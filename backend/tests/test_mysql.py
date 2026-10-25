import os
import secrets
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

import pytest
from conftest import unpack
from ctx_server.extensions import db
from ctx_server.models import Device, DeviceChannel, PublishedVersion, Resource
from sqlalchemy import func, select, text
from sqlalchemy.exc import OperationalError

pytestmark = [
    pytest.mark.mysql,
    pytest.mark.skipif(
        not os.getenv("TEST_DATABASE_URL", "").startswith("mysql"),
        reason="dedicated MySQL TEST_DATABASE_URL required",
    ),
]


def test_pairing_race_one_winner_and_same_request_retry(app, owner):
    record = unpack(owner.post("/pairing-codes", {"name": "并发设备"}), 201)
    barrier = Barrier(2)

    def claim(index):
        with app.test_client() as client:
            barrier.wait(timeout=10)
            response = client.post(
                "/api/v1/device/pair",
                json={
                    "code": record["code"],
                    "claim_id": secrets.token_hex(16),
                    "device_secret": secrets.token_urlsafe(32),
                },
            )
            return response.status_code

    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(claim, range(2))) == [201, 409]
    with app.app_context():
        assert db.session.scalar(select(func.count()).select_from(Device)) == 1


def test_concurrent_publish_serializes_generations(app, owner):
    device_id, _, _ = owner.pair()
    resource = owner.resource()
    body = {"resources": [{"id": resource["id"], "revision": 1}], "device_ids": [device_id]}
    preview = unpack(owner.post("/releases/preview", body))
    cookie = owner.client.get_cookie("ctx_session").value
    barrier = Barrier(2)

    def publish(index):
        client = app.test_client()
        client.set_cookie("ctx_session", cookie)
        barrier.wait(timeout=10)
        result = client.post(
            "/api/v1/releases",
            json=body,
            headers={
                "X-CSRF-Token": owner.csrf,
                "Idempotency-Key": f"concurrent-{index}",
                "X-Preview-Token": preview["preview_token"],
            },
        )
        assert result.status_code == 201, result.json
        return result.json["data"]["targets"][0]["generation"]

    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(publish, range(2))) == [1, 2]
    with app.app_context():
        assert db.session.get(DeviceChannel, (device_id, "profile")).generation == 2


def test_database_constraints_transaction_rollback_and_engine(app, owner):
    resource = owner.resource()
    with app.app_context():
        engine = db.session.execute(
            text(
                "SELECT ENGINE, TABLE_COLLATION FROM information_schema.TABLES "
                "WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='resources'"
            )
        ).one()
        assert engine.ENGINE == "InnoDB"
        assert engine.TABLE_COLLATION.startswith("utf8mb4")
        record = db.session.get(Resource, resource["id"])
        record.revision = 0
        with pytest.raises(OperationalError) as error:
            db.session.flush()
        assert error.value.orig.args[0] == 3819
        db.session.rollback()
        assert db.session.get(Resource, resource["id"]).revision == 1


def test_publish_fault_rolls_back_versions_and_assignments(app, owner, monkeypatch):
    device_id, _, _ = owner.pair()
    resource = owner.resource()
    body = {"resources": [{"id": resource["id"], "revision": 1}], "device_ids": [device_id]}
    preview = unpack(owner.post("/releases/preview", body))
    from ctx_server import services

    original = services.audit

    def fail(action, *args, **kwargs):
        if action == "release.publish":
            raise RuntimeError("injected failure before commit")
        return original(action, *args, **kwargs)

    monkeypatch.setattr(services, "audit", fail)
    result = owner.post(
        "/releases", body, **{"Idempotency-Key": "fault", "X-Preview-Token": preview["preview_token"]}
    )
    assert result.status_code == 500
    with app.app_context():
        assert db.session.scalar(select(func.count()).select_from(PublishedVersion)) == 0
        assert db.session.get(DeviceChannel, (device_id, "profile")).generation == 0


def test_pool_pre_ping_recovers_killed_idle_connection(app):
    with app.app_context():
        with db.engine.connect() as connection:
            original_id = connection.execute(text("SELECT CONNECTION_ID()")).scalar_one()
        # An independent raw connection kills an idle connection in the pool.
        from sqlalchemy import create_engine

        admin = create_engine(app.config["SQLALCHEMY_DATABASE_URI"])
        with admin.connect() as connection:
            connection.execute(text(f"KILL CONNECTION {int(original_id)}"))
        admin.dispose()
        with db.engine.connect() as connection:
            assert connection.execute(text("SELECT CONNECTION_ID()")).scalar_one() != original_id
