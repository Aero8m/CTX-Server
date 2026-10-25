import threading

import pytest
import requests
from conftest import unpack
from ctx_server.simulator import DeviceClient
from werkzeug.serving import make_server


@pytest.fixture
def server(app):
    server = make_server("127.0.0.1", 0, app, threaded=True)
    worker = threading.Thread(target=server.serve_forever, daemon=True)
    worker.start()
    yield f"http://127.0.0.1:{server.server_port}"
    server.shutdown()
    worker.join(timeout=5)


def test_simulator_block_save_failure_lost_receipt_and_restart(server, owner, tmp_path):
    code = unpack(owner.post("/pairing-codes", {"name": "模拟设备"}), 201)["code"]
    device = DeviceClient(server, tmp_path / "device")
    device_id = device.pair(code)["device_id"]
    profile, display = owner.resource(), owner.resource("display_config")
    owner.release([profile, display], [device_id])
    device.tick(block=True)
    assert "profile" not in device.state["applied"]
    assert "display_config" in device.state["applied"]
    device.tick(fail_save=True)
    assert "profile" not in device.state["applied"]
    device.tick(drop_receipt=True)
    applied_file = (tmp_path / "device" / "profile.json").read_bytes()
    assert device.state["pending_receipts"]
    restarted = DeviceClient(server, tmp_path / "device")
    restarted.tick(repeat=True)
    assert not restarted.state["pending_receipts"]
    assert (tmp_path / "device" / "profile.json").read_bytes() == applied_file
    assert (
        next(c for c in unpack(owner.get("/devices/" + device_id))["channels"] if c["kind"] == "profile")[
            "status"
        ]
        == "applied"
    )
    with pytest.raises(requests.ConnectionError):
        restarted.tick(offline=True)
    assert (tmp_path / "device" / "profile.json").read_bytes() == applied_file
    owner.post(f"/devices/{device_id}/revoke")
    with pytest.raises(PermissionError):
        restarted.tick()
    replacement_code = unpack(owner.post("/pairing-codes", {"name": "重新绑定"}), 201)["code"]
    old_secret = restarted.state["device_secret"]
    replacement_id = restarted.pair(replacement_code)["device_id"]
    assert replacement_id != device_id
    assert restarted.state["device_secret"] != old_secret
    assert not restarted.state["applied"]
    assert (tmp_path / "device" / "profile.json").read_bytes() == applied_file
    owner.release([profile], [replacement_id])
    restarted.tick()
    assert restarted.state["applied"]["profile"]["generation"] == 1


def test_simulator_preserves_corrupt_state_and_restricts_origin(tmp_path):
    path = tmp_path / "state.json"
    path.write_text("broken JSON", encoding="utf-8")
    with pytest.raises(ValueError):
        DeviceClient("http://127.0.0.1:5000", tmp_path)
    assert path.read_text() == "broken JSON"
    with pytest.raises(ValueError):
        DeviceClient("http://public.example.com", tmp_path / "other")
    device = DeviceClient("https://ctx.example.com", tmp_path / "secure")
    with pytest.raises(ValueError):
        device.request("GET", "http://ctx.example.com/api/v1/versions/test/content")
