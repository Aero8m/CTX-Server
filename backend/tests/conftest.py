import os
import secrets
from copy import deepcopy

import pytest
from ctx_server import create_app
from ctx_server.extensions import db
from ctx_server.models import Account, Captcha
from ctx_server.security import digest
from sqlalchemy import event
from werkzeug.security import generate_password_hash

PROFILE = {
    "version": 1,
    "profile": {
        "name": "测试档案",
        "subjects": [{"name": "语文", "simplifiedName": "语", "teacher": "老师"}],
        "timeLines": [],
        "schedules": [
            {
                "id": "week-a",
                "name": "常规周",
                "mode": "all",
                "daySchedules": [
                    {
                        "name": "星期一",
                        "enableDay": 1,
                        "classes": [{"subject": "语文", "startTime": "08:00:00", "endTime": "08:45:00"}],
                    }
                ],
            }
        ],
    },
}
DISPLAY = {
    "schema_version": 1,
    "courseBarConfig": {
        "components": [{"typeId": "builtin/date", "instanceId": "date-1", "enabled": True, "settings": {}}]
    },
}


@pytest.fixture
def app(tmp_path):
    url = os.getenv("TEST_DATABASE_URL", "sqlite:///" + str(tmp_path / "test.db"))
    if url.startswith("mysql") and "test" not in url.rsplit("/", 1)[-1].lower():
        pytest.fail("TEST_DATABASE_URL must name a dedicated database containing 'test'")
    application = create_app(
        {
            "TESTING": True,
            "SQLALCHEMY_DATABASE_URI": url,
            "SQLALCHEMY_ENGINE_OPTIONS": {"pool_pre_ping": True},
            "SECRET_KEY": "test-secret-do-not-deploy-0123456789",
            "RATELIMIT_ENABLED": False,
            "REQUIRE_HTTPS": False,
            "PROXY_HOPS": 0,
            "TRUSTED_HOSTS": None,
        }
    )
    from ctx_server.responses import RESPONSE_MAP
    from flask import request

    @application.after_request
    def verify_response_contract(response):
        endpoint = request.endpoint.split(".")[-1] if request.endpoint else ""
        if response.status_code < 400 and endpoint in RESPONSE_MAP:
            RESPONSE_MAP[endpoint].model_validate(response.json["data"])
        return response

    with application.app_context():
        if db.engine.dialect.name == "sqlite":

            @event.listens_for(db.engine, "connect")
            def sqlite_foreign_keys(connection, _):
                connection.execute("PRAGMA foreign_keys=ON")
                connection.execute("PRAGMA journal_mode=WAL")

        db.drop_all()
        db.create_all()
        yield application
        db.session.remove()
        db.drop_all()
        db.engine.dispose()


@pytest.fixture
def client(app):
    return app.test_client()


def unpack(response, status=200):
    assert response.status_code == status, response.get_data(as_text=True)
    return response.json["data"]


class Browser:
    def __init__(self, app, username="teacher_a", create=True):
        self.app = app
        self.client = app.test_client()
        if create:
            with app.app_context():
                db.session.add(
                    Account(username=username, password_hash=generate_password_hash("testing-password"))
                )
                db.session.commit()
        self.csrf = unpack(self.client.get("/api/v1/auth/csrf"))["csrf_token"]
        result = unpack(self.post("/auth/login", {"username": username, "password": "testing-password"}))
        self.csrf = result["csrf_token"]
        self.account_id = result["account"]["id"]

    def post(self, path, body=None, **headers):
        return self.client.post(
            "/api/v1" + path,
            json=body if body is not None else {},
            headers={"X-CSRF-Token": self.csrf, **headers},
        )

    def patch(self, path, body):
        return self.client.patch("/api/v1" + path, json=body, headers={"X-CSRF-Token": self.csrf})

    def get(self, path):
        return self.client.get("/api/v1" + path)

    def pair(self, group_id=None):
        record = unpack(self.post("/pairing-codes", {"name": "教室设备", "group_id": group_id}), 201)
        secret = secrets.token_urlsafe(32)
        claim = {"code": record["code"], "claim_id": secrets.token_hex(16), "device_secret": secret}
        device = unpack(self.client.post("/api/v1/device/pair", json=claim), 201)
        return device["device_id"], secret, claim

    def resource(self, kind="profile", content=None):
        return unpack(
            self.post(
                "/resources",
                {
                    "kind": kind,
                    "name": "测试资源",
                    "content": deepcopy(content or (PROFILE if kind == "profile" else DISPLAY)),
                },
            ),
            201,
        )["resource"]

    def release(self, resources, device_ids=None, group_ids=None, key=None):
        body = {
            "resources": [{"id": r["id"], "revision": r["revision"]} for r in resources],
            "device_ids": device_ids or [],
            "group_ids": group_ids or [],
            "note": "测试发布",
        }
        preview = unpack(self.post("/releases/preview", body))
        headers = {
            "Idempotency-Key": key or secrets.token_hex(16),
            "X-Preview-Token": preview["preview_token"],
        }
        return unpack(self.post("/releases", body, **headers), 201), body, headers


@pytest.fixture
def owner(app):
    return Browser(app)


def device_post(client, secret, path, data):
    return client.post("/api/v1/device/" + path, json=data, headers={"Authorization": "Bearer " + secret})


def captcha_answer(app, client):
    result = unpack(client.get("/api/v1/auth/captcha"))
    with app.app_context():
        record = db.session.get(Captcha, result["id"])
        record.answer_hash = digest("captcha:ABCDE")
        db.session.commit()
    return {"captcha_id": result["id"], "captcha_answer": "ABCDE"}
