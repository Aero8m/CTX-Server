"""A real-protocol device reference with durable application and receipt journals."""

import argparse
import hashlib
import json
import os
import secrets
import sys
import time
from pathlib import Path
from urllib.parse import urljoin, urlparse

import requests

from .errors import APIError
from .schemas import canonical, normalize_content


def atomic_write(path, data):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + ".tmp")
    with temporary.open("wb") as stream:
        stream.write(data)
        stream.flush()
        os.fsync(stream.fileno())
    if os.name != "nt":
        temporary.chmod(0o600)
    os.replace(temporary, path)


class DeviceClient:
    def __init__(self, server, directory, timeout=15):
        self.server = server.rstrip("/") + "/"
        parsed = urlparse(self.server)
        if parsed.scheme not in ("https", "http") or parsed.username or parsed.password:
            raise ValueError("Server must be an http(s) origin without credentials")
        if parsed.scheme == "http" and parsed.hostname not in ("127.0.0.1", "localhost", "::1"):
            raise ValueError("Non-local servers require HTTPS")
        if parsed.path != "/" or parsed.query or parsed.fragment:
            raise ValueError("Server must be an origin, for example https://ctx.example.com")
        self.directory, self.timeout = Path(directory), timeout
        self.path = self.directory / "state.json"
        self.session = requests.Session()
        if self.path.exists():
            self.state = json.loads(self.path.read_text(encoding="utf-8"))
            if self.state.get("schema_version") != 1 or self.state.get("server") != self.server:
                raise ValueError("State format or server mismatch; existing file preserved")
        else:
            self.state = {
                "schema_version": 1,
                "server": self.server,
                "device_secret": secrets.token_urlsafe(32),
                "claim_id": secrets.token_hex(16),
                "device_id": None,
                "applied": {},
                "attempts": {},
                "pending_receipts": [],
            }
            self.save()
        self.session.headers["Authorization"] = "Bearer " + self.state["device_secret"]

    def save(self):
        atomic_write(self.path, canonical(self.state).encode("utf-8"))

    def request(self, method, path, payload=None, raw=False):
        url = urljoin(self.server, path)
        target, origin = urlparse(url), urlparse(self.server)
        if (target.scheme, target.netloc) != (origin.scheme, origin.netloc) or not target.path.startswith(
            "/api/v1/"
        ):
            raise ValueError("Device download URL must stay on the configured API origin")
        response = self.session.request(
            method, url, json=payload, timeout=self.timeout, allow_redirects=False
        )
        if response.status_code == 401:
            raise PermissionError("Device credential rejected; stop syncing and re-pair if revoked")
        if not 200 <= response.status_code < 300:
            try:
                message = response.json()["error"]["message"]
            except (ValueError, KeyError):
                message = "Unexpected server response"
            raise RuntimeError(f"HTTP {response.status_code}: {message}")
        return response.content if raw else response.json()["data"]

    def pair(self, code):
        code = code.upper()
        code_hash = hashlib.sha256(code.encode()).hexdigest()
        if self.state.get("pair_code_hash") != code_hash:
            if self.state.get("pair_code_hash") or self.state.get("device_id"):
                # A new binding needs a new credential and independent generation space.
                # Keep the last applied files usable while pairing is pending.
                self.state.update(
                    device_secret=secrets.token_urlsafe(32),
                    claim_id=secrets.token_hex(16),
                    device_id=None,
                    applied={},
                    attempts={},
                    pending_receipts=[],
                )
            self.state["pair_code_hash"] = code_hash
            self.save()
            self.session.headers["Authorization"] = "Bearer " + self.state["device_secret"]
        result = self.request(
            "POST",
            "/api/v1/device/pair",
            {
                "code": code,
                "claim_id": self.state["claim_id"],
                "device_secret": self.state["device_secret"],
                "client_version": "simulator/0.1.0",
            },
        )
        self.state["device_id"] = result["device_id"]
        self.save()
        return result

    def flush_receipts(self, repeat=False):
        for receipt in list(self.state["pending_receipts"]):
            self.request("POST", "/api/v1/device/receipts", receipt)
            if repeat:
                self.request("POST", "/api/v1/device/receipts", receipt)
            self.state["pending_receipts"].remove(receipt)
            self.save()

    def tick(self, *, block=False, fail_save=False, drop_receipt=False, repeat=False, offline=False):
        if offline:
            raise requests.ConnectionError("Simulated offline; last applied files preserved")
        if not self.state.get("device_id"):
            raise ValueError("Pair the device first")
        if not drop_receipt:
            self.flush_receipts(repeat)
        result = self.request(
            "POST",
            "/api/v1/device/sync",
            {
                "client_version": "simulator/0.1.0",
                "supported_formats": {"profile": [1], "display_config": [1]},
                "applied": self.state["applied"],
            },
        )
        for kind, target in result["channels"].items():
            if not target or not target["compatible"]:
                continue
            local = self.state["applied"].get(kind, {})
            if local.get("generation") == target["generation"]:
                continue
            if any(r["assignment_id"] == target["assignment_id"] for r in self.state["pending_receipts"]):
                continue
            assignment_id = target["assignment_id"]
            attempt = self.state["attempts"].get(assignment_id, 0) + 1
            self.state["attempts"][assignment_id] = attempt
            self.save()
            receipt = {
                "assignment_id": assignment_id,
                "kind": kind,
                "generation": target["generation"],
                "version_id": target["version_id"],
                "attempt": attempt,
                "result": "applied",
                "reason": "",
            }
            try:
                if kind == "profile" and block:
                    receipt.update(result="blocked", reason="local_edit")
                else:
                    data = self.request("GET", target["download_url"], raw=True)
                    if hashlib.sha256(data).hexdigest() != target["sha256"]:
                        raise ValueError("checksum_mismatch")
                    normalize_content(kind, json.loads(data))
                    if fail_save:
                        raise OSError("simulated_save_failed")
                    atomic_write(self.directory / f"{kind}.json", data)
                    self.state["applied"][kind] = {
                        "generation": target["generation"],
                        "version_id": target["version_id"],
                    }
            except PermissionError:
                raise
            except (OSError, ValueError, RuntimeError, APIError) as error:
                receipt.update(result="failed", reason=str(error)[:1000])
            self.state["pending_receipts"].append(receipt)
            self.save()
        if not drop_receipt:
            self.flush_receipts(repeat)
        return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--server", default="http://127.0.0.1:5000")
    parser.add_argument("--state-dir", default=".device-state")
    parser.add_argument("--pair", metavar="CODE")
    parser.add_argument("--once", action="store_true")
    parser.add_argument("--block-local-edit", action="store_true")
    parser.add_argument("--fail-save", action="store_true")
    parser.add_argument("--drop-receipt", action="store_true")
    parser.add_argument("--repeat-receipt", action="store_true")
    parser.add_argument("--offline", action="store_true")
    args = parser.parse_args()
    try:
        client = DeviceClient(args.server, args.state_dir)
        if args.pair:
            print(json.dumps(client.pair(args.pair), ensure_ascii=False))
        delay = 2
        while True:
            try:
                result = client.tick(
                    block=args.block_local_edit,
                    fail_save=args.fail_save,
                    drop_receipt=args.drop_receipt,
                    repeat=args.repeat_receipt,
                    offline=args.offline,
                )
                print(json.dumps({"device_id": result["device_id"], "applied": client.state["applied"]}))
                delay = result["sync_after_seconds"]
            except PermissionError:
                raise
            except (requests.RequestException, RuntimeError) as error:
                print(str(error), file=sys.stderr)
                if args.once:
                    return 1
                delay = min(delay * 2, 120)
            if args.once:
                return 0
            time.sleep(delay)
    except (PermissionError, ValueError, OSError, RuntimeError) as error:
        print(str(error), file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        return 0


if __name__ == "__main__":
    sys.exit(main())
