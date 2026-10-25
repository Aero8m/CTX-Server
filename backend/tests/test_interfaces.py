from copy import deepcopy
from datetime import timedelta

import pytest
from conftest import DISPLAY, PROFILE, device_post, unpack
from ctx_server import create_app
from ctx_server.config import config
from ctx_server.contracts import OPERATIONS
from ctx_server.extensions import db
from ctx_server.models import Device, PairingCode, now
from ctx_server.schemas import normalize_content


def test_group_deletion_unassigns_devices_and_unclaimed_codes(app, owner):
    group = unpack(owner.post("/groups", {"name": "临时分组"}), 201)
    device_id, _, _ = owner.pair(group["id"])
    code = unpack(owner.post("/pairing-codes", {"name": "待配对", "group_id": group["id"]}), 201)
    assert (
        owner.client.delete("/api/v1/groups/" + group["id"], headers={"X-CSRF-Token": owner.csrf}).status_code
        == 200
    )
    with app.app_context():
        assert db.session.get(Device, device_id).group_id is None
        assert db.session.get(PairingCode, code["id"]).group_id is None


def test_expired_and_revoked_pairing(app, owner, client):
    import secrets

    code = unpack(owner.post("/pairing-codes", {"name": "过期设备"}), 201)
    with app.app_context():
        db.session.get(PairingCode, code["id"]).expires_at = now() - timedelta(seconds=1)
        db.session.commit()
    claim = {
        "code": code["code"],
        "claim_id": secrets.token_hex(16),
        "device_secret": secrets.token_urlsafe(32),
    }
    assert client.post("/api/v1/device/pair", json=claim).status_code == 422
    code = unpack(owner.post("/pairing-codes", {"name": "撤销设备"}), 201)
    assert owner.post("/pairing-codes/" + code["id"] + "/revoke").status_code == 200
    claim["code"] = code["code"]
    assert client.post("/api/v1/device/pair", json=claim).status_code == 422


def test_validation_preview_filters_and_size_limit(owner):
    response = unpack(owner.post("/resources/validate", {"kind": "profile", "content": PROFILE}))
    assert response["content"]["version"] == 1
    resource = owner.resource()
    assert unpack(owner.get("/resources?kind=profile"))["total"] == 1
    assert owner.get("/resources?kind=invalid").status_code == 422
    assert owner.get("/resources?page_size=101").status_code == 422
    assert owner.get("/resources/" + resource["id"] + "/preview").status_code == 422
    assert unpack(owner.get("/resources/" + resource["id"] + "/preview?date=2026-10-19"))["classes"]
    assert owner.get("/resources/" + resource["id"] + "/content").status_code == 200
    response = owner.client.post(
        "/api/v1/resources",
        data="x" * (2 * 1024 * 1024 + 1),
        content_type="application/json",
        headers={"X-CSRF-Token": owner.csrf},
    )
    assert response.status_code == 413 and response.json["error"]["code"] == "request_too_large"


def test_account_disable_and_enable_revokes_device(app, owner, client):
    device_id, secret, _ = owner.pair()
    runner = app.test_cli_runner()
    assert runner.invoke(args=["accounts", "disable", "teacher_a"]).exit_code == 0
    assert owner.get("/auth/me").status_code == 401
    assert device_post(client, secret, "sync", {}).status_code == 401
    assert runner.invoke(args=["accounts", "enable", "teacher_a"]).exit_code == 0
    assert device_post(client, secret, "sync", {}).status_code == 200


def test_openapi_covers_registered_routes_and_response_models(app, client):
    schema = client.get("/api/v1/openapi.json").json
    assert schema["openapi"] == "3.1.0"
    described = {
        (method.upper(), "/api/v1" + path.replace("{object_id}", "<object_id>"))
        for method, path, *_ in OPERATIONS
    }
    actual = {
        (method, rule.rule)
        for rule in app.url_map.iter_rules()
        if rule.endpoint not in ("static", "api.openapi")
        for method in rule.methods
        if method not in ("HEAD", "OPTIONS")
    }
    assert actual == described
    assert schema["paths"]["/device/sync"]["post"]["responses"]["200"]["content"]["application/json"][
        "schema"
    ]["properties"]["data"]["$ref"].endswith("SyncView")


def test_production_validation_https_host_and_secure_cookie(monkeypatch):
    monkeypatch.setenv("CTX_ENV", "production")
    monkeypatch.setenv("SECRET_KEY", "replace-with-at-least-32-random-characters")
    with pytest.raises(RuntimeError):
        config()
    monkeypatch.setenv("SECRET_KEY", "real-test-only-secret-012345678901234567890")
    monkeypatch.setenv("DATABASE_URL", "mysql+pymysql://test:test@127.0.0.1/ctx_test")
    monkeypatch.setenv("TRUSTED_HOSTS", "ctx.example.com")
    monkeypatch.setenv("PROXY_HOPS", "1")
    monkeypatch.setenv("PUBLIC_URL", "https://ctx.example.com")
    app = create_app()
    assert app.config["SESSION_COOKIE_SECURE"]
    assert (
        app.test_client().get("/api/v1/health/live", headers={"Host": "ctx.example.com"}).status_code == 400
    )
    response = app.test_client().get(
        "/api/v1/health/live", headers={"Host": "ctx.example.com", "X-Forwarded-Proto": "https"}
    )
    assert response.status_code == 200
    assert response.headers["Strict-Transport-Security"] == "max-age=31536000"


@pytest.mark.parametrize("kind,value", [("profile", PROFILE), ("display_config", DISPLAY)])
def test_boolean_is_not_a_format_version(kind, value):
    from ctx_server.errors import APIError

    data = deepcopy(value)
    data["version" if kind == "profile" else "schema_version"] = True
    with pytest.raises(APIError):
        normalize_content(kind, data)
