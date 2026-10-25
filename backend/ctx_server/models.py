"""Durable state. All timestamps are naive UTC in the database."""

import uuid
from datetime import datetime, timezone

from sqlalchemy import event
from sqlalchemy.dialects.mysql import LONGTEXT
from sqlalchemy.orm import Session as SASession

from .extensions import db

TABLE_OPTIONS = {"mysql_engine": "InnoDB", "mysql_charset": "utf8mb4", "mysql_collate": "utf8mb4_0900_bin"}


def now():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def uid():
    return uuid.uuid4().hex


def iso(value):
    return value.isoformat(timespec="seconds") + "Z" if value else None


class Base(db.Model):
    __abstract__ = True
    __table_args__ = TABLE_OPTIONS
    id = db.Column(db.String(32), primary_key=True, default=uid)
    created_at = db.Column(db.DateTime, nullable=False, default=now)


class Account(Base):
    __tablename__ = "accounts"
    username = db.Column(db.String(32), nullable=False, unique=True)
    password_hash = db.Column(db.String(255), nullable=False)
    active = db.Column(db.Boolean, nullable=False, default=True)


class BrowserSession(Base):
    __tablename__ = "browser_sessions"
    token_hash = db.Column(db.String(64), nullable=False, unique=True)
    csrf_hash = db.Column(db.String(64), nullable=False)
    account_id = db.Column(db.String(32), db.ForeignKey("accounts.id"), index=True)
    expires_at = db.Column(db.DateTime, nullable=False, index=True)


class Captcha(Base):
    __tablename__ = "captchas"
    session_id = db.Column(
        db.String(32), db.ForeignKey("browser_sessions.id", ondelete="CASCADE"), nullable=False
    )
    answer_hash = db.Column(db.String(64), nullable=False)
    expires_at = db.Column(db.DateTime, nullable=False, index=True)


class RateBucket(db.Model):
    __tablename__ = "rate_buckets"
    key = db.Column(db.String(64), primary_key=True)
    hits = db.Column(db.Integer, nullable=False, default=0)
    expires_at = db.Column(db.DateTime, nullable=False, index=True)
    __table_args__ = TABLE_OPTIONS


class DeviceGroup(Base):
    __tablename__ = "device_groups"
    account_id = db.Column(db.String(32), db.ForeignKey("accounts.id"), nullable=False, index=True)
    name = db.Column(db.String(100), nullable=False)
    __table_args__ = (db.UniqueConstraint("account_id", "name"), TABLE_OPTIONS)


class Device(Base):
    __tablename__ = "devices"
    account_id = db.Column(db.String(32), db.ForeignKey("accounts.id"), nullable=False, index=True)
    group_id = db.Column(db.String(32), db.ForeignKey("device_groups.id"), index=True)
    name = db.Column(db.String(100), nullable=False)
    credential_hash = db.Column(db.String(64), nullable=False, unique=True)
    revoked_at = db.Column(db.DateTime)
    last_seen_at = db.Column(db.DateTime, index=True)
    client_version = db.Column(db.String(100), nullable=False, default="")


class PairingCode(Base):
    __tablename__ = "pairing_codes"
    account_id = db.Column(db.String(32), db.ForeignKey("accounts.id"), nullable=False, index=True)
    code_hash = db.Column(db.String(64), nullable=False, unique=True)
    name = db.Column(db.String(100), nullable=False)
    group_id = db.Column(db.String(32), db.ForeignKey("device_groups.id"))
    expires_at = db.Column(db.DateTime, nullable=False, index=True)
    revoked_at = db.Column(db.DateTime)
    device_id = db.Column(db.String(32), db.ForeignKey("devices.id"))
    claim_id = db.Column(db.String(64))


class Resource(Base):
    __tablename__ = "resources"
    account_id = db.Column(db.String(32), db.ForeignKey("accounts.id"), nullable=False, index=True)
    name = db.Column(db.String(100), nullable=False)
    kind = db.Column(db.String(20), nullable=False)
    content = db.Column(db.JSON, nullable=False)
    revision = db.Column(db.Integer, nullable=False, default=1)
    archived = db.Column(db.Boolean, nullable=False, default=False)
    updated_at = db.Column(db.DateTime, nullable=False, default=now, onupdate=now)
    __table_args__ = (
        db.CheckConstraint("kind IN ('profile', 'display_config')", name="valid_kind"),
        db.CheckConstraint("revision > 0", name="positive_revision"),
        TABLE_OPTIONS,
    )


class Release(Base):
    __tablename__ = "releases"
    account_id = db.Column(db.String(32), db.ForeignKey("accounts.id"), nullable=False, index=True)
    idempotency_key = db.Column(db.String(64), nullable=False)
    request_hash = db.Column(db.String(64), nullable=False)
    note = db.Column(db.String(500), nullable=False, default="")
    rollback_of = db.Column(db.String(32), db.ForeignKey("releases.id"))
    __table_args__ = (db.UniqueConstraint("account_id", "idempotency_key"), TABLE_OPTIONS)


class PublishedVersion(Base):
    __tablename__ = "published_versions"
    account_id = db.Column(db.String(32), db.ForeignKey("accounts.id"), nullable=False, index=True)
    resource_id = db.Column(db.String(32), db.ForeignKey("resources.id"), nullable=False)
    release_id = db.Column(db.String(32), db.ForeignKey("releases.id"), nullable=False, index=True)
    kind = db.Column(db.String(20), nullable=False)
    format_version = db.Column(db.Integer, nullable=False)
    # Canonical UTF-8 bytes are immutable, including across MySQL JSON reserialization.
    payload = db.Column(db.Text().with_variant(LONGTEXT(), "mysql"), nullable=False)
    sha256 = db.Column(db.String(64), nullable=False)
    __table_args__ = (db.UniqueConstraint("release_id", "kind"), TABLE_OPTIONS)


class Assignment(Base):
    __tablename__ = "assignments"
    release_id = db.Column(db.String(32), db.ForeignKey("releases.id"), nullable=False, index=True)
    device_id = db.Column(db.String(32), db.ForeignKey("devices.id"), nullable=False, index=True)
    version_id = db.Column(db.String(32), db.ForeignKey("published_versions.id"), nullable=False)
    kind = db.Column(db.String(20), nullable=False)
    generation = db.Column(db.Integer, nullable=False)
    __table_args__ = (
        db.UniqueConstraint("device_id", "kind", "generation"),
        db.CheckConstraint("generation > 0", name="positive_generation"),
        TABLE_OPTIONS,
    )


class DeviceChannel(db.Model):
    __tablename__ = "device_channels"
    device_id = db.Column(db.String(32), db.ForeignKey("devices.id"), primary_key=True)
    kind = db.Column(db.String(20), primary_key=True)
    generation = db.Column(db.Integer, nullable=False, default=0)
    assignment_id = db.Column(db.String(32), db.ForeignKey("assignments.id"))
    applied_version_id = db.Column(db.String(32), db.ForeignKey("published_versions.id"))
    applied_generation = db.Column(db.Integer, nullable=False, default=0)
    attempt = db.Column(db.Integer, nullable=False, default=0)
    status = db.Column(db.String(20), nullable=False, default="pending")
    reason = db.Column(db.String(1000), nullable=False, default="")
    __table_args__ = (
        db.CheckConstraint("kind IN ('profile', 'display_config')", name="valid_kind"),
        TABLE_OPTIONS,
    )


class Receipt(Base):
    __tablename__ = "receipts"
    device_id = db.Column(db.String(32), db.ForeignKey("devices.id"), nullable=False, index=True)
    assignment_id = db.Column(db.String(32), db.ForeignKey("assignments.id"), nullable=False)
    attempt = db.Column(db.Integer, nullable=False)
    result = db.Column(db.String(20), nullable=False)
    reason = db.Column(db.String(1000), nullable=False, default="")
    request_hash = db.Column(db.String(64), nullable=False)
    __table_args__ = (
        db.UniqueConstraint("assignment_id", "attempt"),
        db.CheckConstraint("attempt > 0", name="positive_attempt"),
        db.CheckConstraint("result IN ('applied', 'failed', 'blocked')", name="valid_result"),
        TABLE_OPTIONS,
    )


class Audit(Base):
    __tablename__ = "audits"
    account_id = db.Column(db.String(32), db.ForeignKey("accounts.id"), nullable=False, index=True)
    action = db.Column(db.String(50), nullable=False)
    object_id = db.Column(db.String(32))
    detail = db.Column(db.JSON, nullable=False, default=dict)


@event.listens_for(SASession, "before_flush")
def immutable_versions(session, *_):
    if any(isinstance(obj, (PublishedVersion, Assignment)) for obj in session.dirty | session.deleted):
        raise ValueError("Published versions and assignments are immutable")
