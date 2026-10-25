from datetime import timedelta

from conftest import Browser, captcha_answer, unpack
from ctx_server.extensions import db
from ctx_server.models import Account, BrowserSession, Captcha, now
from sqlalchemy import select


def test_register_csrf_captcha_and_logout(app, client):
    assert client.post("/api/v1/auth/register", json={}).status_code == 403
    token = unpack(client.get("/api/v1/auth/csrf"))["csrf_token"]
    credentials = {"username": "Teacher_1", "password": "secure-password", **captcha_answer(app, client)}
    result = unpack(
        client.post("/api/v1/auth/register", json=credentials, headers={"X-CSRF-Token": token}), 201
    )
    assert result["account"]["username"] == "teacher_1"
    assert result["csrf_token"] != token
    assert client.get("/api/v1/auth/me").status_code == 200
    assert client.post("/api/v1/auth/logout", headers={"X-CSRF-Token": token}).status_code == 403
    assert (
        client.post("/api/v1/auth/logout", headers={"X-CSRF-Token": result["csrf_token"]}).status_code == 200
    )
    assert client.get("/api/v1/auth/me").status_code == 401
    with app.app_context():
        account = db.session.scalar(select(Account))
        assert account.password_hash.startswith("scrypt:")
        assert "secure-password" not in account.password_hash


def test_captcha_single_use_even_on_bad_password(app, owner):
    app.config["RATELIMIT_ENABLED"] = True
    for _ in range(3):
        assert (
            owner.post("/auth/login", {"username": "teacher_a", "password": "wrong-password"}).status_code
            == 401
        )
    assert (
        owner.post("/auth/login", {"username": "teacher_a", "password": "testing-password"}).status_code
        == 422
    )
    captcha = captcha_answer(app, owner.client)
    assert (
        owner.post(
            "/auth/login", {"username": "teacher_a", "password": "wrong-password", **captcha}
        ).status_code
        == 401
    )
    assert (
        owner.post(
            "/auth/login", {"username": "teacher_a", "password": "testing-password", **captcha}
        ).status_code
        == 422
    )


def test_password_change_revokes_all_sessions(app, owner):
    second = Browser(app, create=False)
    assert (
        owner.post(
            "/auth/password", {"old_password": "testing-password", "new_password": "replacement-password"}
        ).status_code
        == 200
    )
    assert owner.get("/auth/me").status_code == 401
    assert second.get("/auth/me").status_code == 401


def test_captcha_expiry_and_session_binding(app, client):
    token = unpack(client.get("/api/v1/auth/csrf"))["csrf_token"]
    captcha = captcha_answer(app, client)
    with app.app_context():
        db.session.get(Captcha, captcha["captcha_id"]).expires_at = now() - timedelta(seconds=1)
        db.session.commit()
    credentials = {"username": "teacher_x", "password": "testing-password", **captcha}
    assert (
        client.post("/api/v1/auth/register", json=credentials, headers={"X-CSRF-Token": token}).status_code
        == 422
    )
    assert client.get("/api/v1/auth/me").status_code == 401


def test_shared_rate_limit_and_error_format(app, client):
    app.config["RATELIMIT_ENABLED"] = True
    # Failure counter persists independently of a rejected request transaction.
    from ctx_server.security import rate_limit

    with app.test_request_context():
        rate_limit("test", 1)
    with app.test_request_context():
        import pytest
        from ctx_server.errors import APIError

        with pytest.raises(APIError) as error:
            rate_limit("test", 1)
        assert error.value.status == 429
    response = client.get("/api/v1/missing")
    assert response.status_code == 404
    assert response.json["error"]["request_id"] == response.headers["X-Request-ID"]


def test_expired_session_and_cli_recovery(app, owner):
    with app.app_context():
        for session in db.session.scalars(select(BrowserSession)):
            session.expires_at = now() - timedelta(seconds=1)
        db.session.commit()
    assert owner.get("/auth/me").status_code == 401
    runner = app.test_cli_runner()
    result = runner.invoke(
        args=["accounts", "reset-password", "teacher_a"], input="new-password-123\nnew-password-123\n"
    )
    assert result.exit_code == 0, result.output
    assert runner.invoke(args=["cleanup"]).exit_code == 0
