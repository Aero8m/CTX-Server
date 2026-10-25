import hashlib
import secrets

from conftest import Browser, device_post, unpack
from ctx_server import create_app
from ctx_server.extensions import db
from ctx_server.models import DeviceChannel, PublishedVersion, Release
from sqlalchemy import func, select


def make_receipt(target, result="applied", attempt=1, reason=""):
    return {k: target[k] for k in ("assignment_id", "kind", "generation", "version_id")} | {
        "attempt": attempt,
        "result": result,
        "reason": reason,
    }


def test_full_workflow_and_restart(app, owner, client):
    device_id, secret, claim = owner.pair()
    retry = unpack(client.post("/api/v1/device/pair", json=claim), 201)
    assert retry["device_id"] == device_id
    conflict = {**claim, "device_secret": secrets.token_urlsafe(32), "claim_id": secrets.token_hex(16)}
    assert client.post("/api/v1/device/pair", json=conflict).status_code == 409
    profile, display = owner.resource(), owner.resource("display_config")
    release, body, headers = owner.release([profile, display], [device_id])
    assert unpack(owner.post("/releases", body, **headers), 201)["id"] == release["id"]
    synced = unpack(device_post(client, secret, "sync", {"client_version": "test/1"}))
    assert synced["sync_after_seconds"] in range(20, 31)
    for kind, target in synced["channels"].items():
        assert target["generation"] == 1
        download = client.get(target["download_url"], headers={"Authorization": "Bearer " + secret})
        assert hashlib.sha256(download.data).hexdigest() == target["sha256"]
        receipt = make_receipt(
            target,
            "blocked" if kind == "profile" else "applied",
            reason="local_edit" if kind == "profile" else "",
        )
        assert device_post(client, secret, "receipts", receipt).status_code == 200
        assert unpack(device_post(client, secret, "receipts", receipt))["duplicate"]
    detail = unpack(owner.get("/devices/" + device_id))
    assert detail["online"]
    assert {c["kind"]: c["status"] for c in detail["channels"]} == {
        "profile": "blocked",
        "display_config": "applied",
    }
    profile_target = synced["channels"]["profile"]
    assert device_post(client, secret, "receipts", make_receipt(profile_target, attempt=2)).status_code == 200
    restarted = create_app({**app.config, "SQLALCHEMY_ENGINE_OPTIONS": {}})
    resumed = unpack(device_post(restarted.test_client(), secret, "sync", {}))
    assert resumed["channels"]["profile"]["applied_version_id"] == profile_target["version_id"]


def test_isolation_on_all_object_types_and_downloads(app, owner, client):
    other = Browser(app, "teacher_b")
    device_id, secret, _ = owner.pair()
    other_id, other_secret, _ = other.pair()
    group = unpack(owner.post("/groups", {"name": "一班"}), 201)
    resource = owner.resource()
    release, _, _ = owner.release([resource], [device_id])
    for path in (
        f"/devices/{device_id}",
        f"/resources/{resource['id']}",
        f"/releases/{release['id']}",
        f"/resources/{resource['id']}/content",
        f"/versions/{release['versions'][0]['id']}/content",
    ):
        assert other.get(path).status_code == 404
    assert other.patch(f"/devices/{other_id}", {"group_id": group["id"]}).status_code == 404
    assert (
        client.get(
            f"/api/v1/versions/{release['versions'][0]['id']}/content",
            headers={"Authorization": "Bearer " + other_secret},
        ).status_code
        == 404
    )
    assert (
        other.post(
            "/releases/preview",
            {"resources": [{"id": resource["id"], "revision": 1}], "device_ids": [other_id]},
        ).status_code
        == 404
    )
    assert (
        device_post(
            client, secret, "receipts", make_receipt(release["targets"][0] | {"assignment_id": "f" * 32})
        ).status_code
        == 404
    )
    assert client.get("/api/v1/devices", headers={"Authorization": "Bearer " + secret}).status_code == 401


def test_revisions_preview_change_and_atomic_failure(app, owner):
    device_id, _, _ = owner.pair()
    resource = owner.resource()
    body = {"resources": [{"id": resource["id"], "revision": 1}], "device_ids": [device_id]}
    preview = unpack(owner.post("/releases/preview", body))
    assert owner.patch(f"/resources/{resource['id']}", {"revision": 1, "name": "改名"}).status_code == 200
    assert owner.patch(f"/resources/{resource['id']}", {"revision": 1, "name": "冲突"}).status_code == 409
    assert (
        owner.post(
            "/releases", body, **{"Idempotency-Key": "test", "X-Preview-Token": preview["preview_token"]}
        ).status_code
        == 409
    )
    body["resources"][0]["revision"] = 2
    body["device_ids"].append("f" * 32)
    assert owner.post("/releases/preview", body).status_code == 404
    with app.app_context():
        assert db.session.scalar(select(func.count()).select_from(Release)) == 0
        assert db.session.scalar(select(func.count()).select_from(PublishedVersion)) == 0


def test_group_snapshot_preview_and_rollback(app, owner):
    group = unpack(owner.post("/groups", {"name": "高一"}), 201)
    first_id, _, _ = owner.pair(group["id"])
    resource = owner.resource()
    release, body, _ = owner.release([resource], group_ids=[group["id"]])
    preview = unpack(owner.post("/releases/preview", body))
    second_id, _, _ = owner.pair(group["id"])
    assert (
        owner.post(
            "/releases", body, **{"Idempotency-Key": "changed", "X-Preview-Token": preview["preview_token"]}
        ).status_code
        == 409
    )
    with app.app_context():
        assert db.session.get(DeviceChannel, (second_id, "profile")).generation == 0
    original = unpack(owner.get("/releases/" + release["id"]))
    assert original["target_count"] == 1
    rollback_body = {"device_ids": [first_id, second_id], "note": "恢复"}
    path = "/releases/" + release["id"] + "/rollback"
    preview = unpack(owner.post(path + "/preview", rollback_body))
    rollback = unpack(
        owner.post(
            path,
            rollback_body,
            **{"Idempotency-Key": "rollback-1", "X-Preview-Token": preview["preview_token"]},
        ),
        201,
    )
    assert rollback["id"] != release["id"]
    assert rollback["rollback_of"] == release["id"]
    assert rollback["versions"][0]["sha256"] == release["versions"][0]["sha256"]
    assert {t["device_id"]: t["generation"] for t in rollback["targets"]} == {first_id: 2, second_id: 1}


def test_out_of_order_receipts_format_compatibility_and_revoke(app, owner, client):
    device_id, secret, _ = owner.pair()
    resource = owner.resource()
    first, _, _ = owner.release([resource], [device_id])
    second, _, _ = owner.release([resource], [device_id])
    old, latest = first["targets"][0], second["targets"][0]
    assert device_post(client, secret, "receipts", make_receipt(latest, attempt=3)).status_code == 200
    assert device_post(client, secret, "receipts", make_receipt(latest, "failed", 2)).status_code == 200
    assert device_post(client, secret, "receipts", make_receipt(old, "blocked", 4)).status_code == 200
    detail = unpack(owner.get("/devices/" + device_id))["channels"]
    channel = next(c for c in detail if c["kind"] == "profile")
    assert channel["status"] == "applied" and channel["applied_generation"] == 2
    assert device_post(client, secret, "receipts", make_receipt(latest, "failed", 3)).status_code == 409
    synced = unpack(
        device_post(client, secret, "sync", {"supported_formats": {"profile": [2], "display_config": [1]}})
    )
    assert not synced["channels"]["profile"]["compatible"]
    assert synced["channels"]["profile"]["reason"] == "unsupported_format"
    assert owner.post(f"/devices/{device_id}/revoke").status_code == 200
    assert device_post(client, secret, "sync", {}).status_code == 401


def test_immutable_version_and_archive(app, owner):
    device_id, _, _ = owner.pair()
    resource = owner.resource()
    release, _, _ = owner.release([resource], [device_id])
    assert owner.patch(f"/resources/{resource['id']}", {"revision": 1, "archived": True}).status_code == 200
    assert owner.get(f"/versions/{release['versions'][0]['id']}/content").status_code == 200
    with app.app_context():
        import pytest

        version = db.session.get(PublishedVersion, release["versions"][0]["id"])
        version.payload = "{}"
        with pytest.raises(ValueError, match="immutable"):
            db.session.flush()
        db.session.rollback()
