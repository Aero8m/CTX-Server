"""Transactional business operations; request boundary owns commit/rollback."""

import base64
import hashlib
import io
import json
import secrets
from datetime import timedelta

from flask import g
from PIL import Image, ImageDraw, ImageFont
from sqlalchemy import delete, func, select
from werkzeug.security import check_password_hash, generate_password_hash

from .errors import APIError
from .extensions import db
from .models import (
    Account,
    Assignment,
    Audit,
    BrowserSession,
    Captcha,
    Device,
    DeviceChannel,
    DeviceGroup,
    PairingCode,
    PublishedVersion,
    Receipt,
    Release,
    Resource,
    iso,
    now,
)
from .schemas import canonical, normalize_content
from .security import digest, issue_session, lock_account, owned, rate_hits, rate_limit

KINDS = ("profile", "display_config")


def audit(action, object_id=None, **detail):
    db.session.add(Audit(account_id=g.account.id, action=action, object_id=object_id, detail=detail))


def account_dict(account):
    return {"id": account.id, "username": account.username, "created_at": iso(account.created_at)}


def create_captcha():
    rate_limit("captcha", 20)
    if not g.browser_session:
        raise APIError("csrf_failed", "请先初始化页面会话", 403)
    answer = "".join(secrets.choice("ABCDEFGHJKLMNPQRSTUVWXYZ23456789") for _ in range(5))
    record = Captcha(
        session_id=g.browser_session.id,
        answer_hash=digest("captcha:" + answer),
        expires_at=now() + timedelta(minutes=3),
    )
    db.session.add(record)
    db.session.flush()
    image = Image.new("RGB", (180, 64), "#f1f5f9")
    draw = ImageDraw.Draw(image)
    font = ImageFont.load_default(size=30)
    for _ in range(12):
        draw.line(
            [
                (secrets.randbelow(180), secrets.randbelow(64)),
                (secrets.randbelow(180), secrets.randbelow(64)),
            ],
            fill="#a9bed1",
            width=1,
        )
    for index, char in enumerate(answer):
        draw.text((12 + index * 32, 10 + secrets.randbelow(12)), char, fill="#17415b", font=font)
    stream = io.BytesIO()
    image.save(stream, format="PNG")
    return {
        "id": record.id,
        "image": "data:image/png;base64," + base64.b64encode(stream.getvalue()).decode(),
        "expires_at": iso(record.expires_at),
    }


def consume_captcha(captcha_id, answer):
    valid = False
    if not captcha_id or not answer or not g.browser_session:
        raise APIError("captcha_required", "请填写图形验证码", 422)
    # Consume in its own transaction even when credentials subsequently fail.
    with db.engine.begin() as connection:
        row = (
            connection.execute(
                select(Captcha.__table__)
                .where(Captcha.id == captcha_id, Captcha.session_id == g.browser_session.id)
                .with_for_update()
            )
            .mappings()
            .first()
        )
        if row:
            connection.execute(delete(Captcha).where(Captcha.id == captcha_id))
            valid = row["expires_at"] > now() and secrets.compare_digest(
                row["answer_hash"], digest("captcha:" + answer.upper())
            )
    if not valid:
        raise APIError("captcha_invalid", "验证码错误或已过期，请刷新验证码", 422)


def register(payload):
    rate_limit("register", 5, 600)
    consume_captcha(payload.captcha_id, payload.captcha_answer)
    username = payload.username.lower()
    if db.session.scalar(select(Account.id).where(Account.username == username)):
        raise APIError("username_taken", "用户名已存在", 409)
    account = Account(
        username=username, password_hash=generate_password_hash(payload.password, method="scrypt")
    )
    db.session.add(account)
    db.session.flush()
    g.account = account
    db.session.delete(g.browser_session)
    csrf = issue_session(account.id)
    audit("account.register", account.id)
    return {"account": account_dict(account), "csrf_token": csrf}


def login(payload):
    username = payload.username.lower()
    rate_limit("login-ip", 30, 300)
    rate_limit("login-user", 15, 300, username)
    if rate_hits("login-failure", username, 900) >= 3:
        consume_captcha(payload.captcha_id, payload.captcha_answer)
    account = db.session.scalar(select(Account).where(Account.username == username))
    if not account or not check_password_hash(account.password_hash, payload.password) or not account.active:
        rate_limit("login-failure", 1000, 900, username)
        raise APIError(
            "invalid_credentials",
            "用户名或密码错误",
            401,
            {"captcha_required": rate_hits("login-failure", username, 900) >= 3},
        )
    if g.browser_session:
        db.session.delete(g.browser_session)
    g.account = account
    csrf = issue_session(account.id)
    audit("account.login", account.id)
    return {"account": account_dict(account), "csrf_token": csrf}


def change_password(payload):
    rate_limit("password", 5, 300, g.account.id)
    account = lock_account(g.account.id)
    if not check_password_hash(account.password_hash, payload.old_password):
        raise APIError("invalid_credentials", "原密码错误", 401)
    account.password_hash = generate_password_hash(payload.new_password, method="scrypt")
    db.session.execute(delete(BrowserSession).where(BrowserSession.account_id == account.id))
    audit("account.password", account.id)
    g.clear_cookie = True


def channel_dict(channel):
    assignment = db.session.get(Assignment, channel.assignment_id) if channel.assignment_id else None
    return {
        "kind": channel.kind,
        "generation": channel.generation,
        "assignment_id": channel.assignment_id,
        "target_version_id": assignment.version_id if assignment else None,
        "applied_version_id": channel.applied_version_id,
        "applied_generation": channel.applied_generation,
        "attempt": channel.attempt,
        "status": channel.status,
        "reason": channel.reason,
    }


def device_dict(device, detail=False):
    data = {
        "id": device.id,
        "name": device.name,
        "group_id": device.group_id,
        "created_at": iso(device.created_at),
        "revoked_at": iso(device.revoked_at),
        "last_seen_at": iso(device.last_seen_at),
        "client_version": device.client_version,
        "online": bool(
            not device.revoked_at
            and device.last_seen_at
            and device.last_seen_at > now() - timedelta(seconds=90)
        ),
    }
    data["channels"] = [
        channel_dict(c)
        for c in db.session.scalars(
            select(DeviceChannel).where(DeviceChannel.device_id == device.id).order_by(DeviceChannel.kind)
        )
    ]
    if detail:
        data["receipts"] = [
            receipt_dict(r)
            for r in db.session.scalars(
                select(Receipt)
                .where(Receipt.device_id == device.id)
                .order_by(Receipt.created_at.desc(), Receipt.attempt.desc())
                .limit(50)
            )
        ]
    return data


def group_dict(group):
    return {"id": group.id, "name": group.name, "created_at": iso(group.created_at)}


def create_pairing(payload):
    lock_account(g.account.id)
    if payload.group_id:
        owned(DeviceGroup, payload.group_id)
    code = "".join(secrets.choice("ABCDEFGHJKLMNPQRSTUVWXYZ23456789") for _ in range(12))
    record = PairingCode(
        account_id=g.account.id,
        code_hash=digest("pair:" + code),
        name=payload.name,
        group_id=payload.group_id,
        expires_at=now() + timedelta(minutes=10),
    )
    db.session.add(record)
    db.session.flush()
    audit("pairing.create", record.id)
    return {**pairing_dict(record), "code": code}


def pairing_dict(record):
    return {
        "id": record.id,
        "name": record.name,
        "group_id": record.group_id,
        "expires_at": iso(record.expires_at),
        "revoked_at": iso(record.revoked_at),
        "device_id": record.device_id,
        "created_at": iso(record.created_at),
    }


def claim_pairing(payload):
    rate_limit("pair-ip", 10, 60)
    rate_limit("pair-code", 10, 600, payload.code)
    record = db.session.scalar(
        select(PairingCode).where(PairingCode.code_hash == digest("pair:" + payload.code))
    )
    if not record:
        raise APIError("pairing_invalid", "配对码无效或已过期", 422)
    account = lock_account(record.account_id)
    record = db.session.scalar(
        select(PairingCode)
        .where(PairingCode.id == record.id)
        .execution_options(populate_existing=True)
        .with_for_update()
    )
    if not account.active or record.revoked_at or record.expires_at <= now():
        raise APIError("pairing_invalid", "配对码无效或已过期", 422)
    if record.device_id:
        device = db.session.get(Device, record.device_id)
        if (
            record.claim_id == payload.claim_id
            and not device.revoked_at
            and secrets.compare_digest(device.credential_hash, digest(payload.device_secret))
        ):
            return {"device_id": device.id, "name": device.name}
        raise APIError("pairing_consumed", "配对码已被使用", 409)
    device = Device(
        account_id=record.account_id,
        name=record.name,
        group_id=record.group_id,
        credential_hash=digest(payload.device_secret),
        client_version=payload.client_version,
    )
    db.session.add(device)
    db.session.flush()
    for kind in KINDS:
        db.session.add(DeviceChannel(device_id=device.id, kind=kind))
    record.device_id, record.claim_id = device.id, payload.claim_id
    db.session.add(Audit(account_id=record.account_id, action="device.pair", object_id=device.id))
    return {"device_id": device.id, "name": device.name}


def resource_dict(resource, include_content=True):
    data = {
        "id": resource.id,
        "name": resource.name,
        "kind": resource.kind,
        "revision": resource.revision,
        "archived": resource.archived,
        "created_at": iso(resource.created_at),
        "updated_at": iso(resource.updated_at),
    }
    if include_content:
        data["content"] = resource.content
    return data


def create_resource(payload):
    content, warnings = normalize_content(payload.kind, payload.content)
    resource = Resource(account_id=g.account.id, name=payload.name, kind=payload.kind, content=content)
    db.session.add(resource)
    db.session.flush()
    audit("resource.create", resource.id)
    return {"resource": resource_dict(resource), "warnings": warnings}


def edit_resource(resource_id, payload):
    lock_account(g.account.id)
    resource = owned(Resource, resource_id, lock=True)
    if resource.revision != payload.revision:
        raise APIError(
            "revision_conflict",
            "草稿已被修改，请重新载入后合并",
            409,
            {"current_revision": resource.revision},
        )
    warnings = []
    if payload.content is not None:
        resource.content, warnings = normalize_content(resource.kind, payload.content)
    if payload.name is not None:
        resource.name = payload.name
    if payload.archived is not None:
        resource.archived = payload.archived
    resource.revision += 1
    resource.updated_at = now()
    db.session.flush()
    audit("resource.update", resource.id, revision=resource.revision)
    return {"resource": resource_dict(resource), "warnings": warnings}


def resolve_targets(payload):
    devices = {}
    for device_id in sorted(set(payload.device_ids)):
        device = owned(Device, device_id)
        if device.revoked_at:
            raise APIError("device_revoked", "发布目标包含已撤销设备", 409)
        devices[device.id] = device
    for group_id in sorted(set(payload.group_ids)):
        owned(DeviceGroup, group_id)
        for device in db.session.scalars(
            select(Device).where(
                Device.group_id == group_id, Device.account_id == g.account.id, Device.revoked_at.is_(None)
            )
        ):
            devices[device.id] = device
    if not devices:
        raise APIError("no_targets", "请至少选择一台有效设备", 422)
    if len(devices) > 1000:
        raise APIError("too_many_targets", "单次发布最多支持 1000 台设备", 422)
    return sorted(devices.values(), key=lambda d: d.id)


def release_inputs(payload, rollback_id=None):
    versions = []
    if rollback_id:
        owned(Release, rollback_id)
        for version in db.session.scalars(
            select(PublishedVersion)
            .where(PublishedVersion.release_id == rollback_id)
            .order_by(PublishedVersion.kind)
        ):
            # Historical payload is copied exactly, never re-normalized.
            versions.append(
                {
                    "resource_id": version.resource_id,
                    "kind": version.kind,
                    "format_version": version.format_version,
                    "payload": version.payload,
                    "sha256": version.sha256,
                }
            )
    else:
        for reference in payload.resources:
            resource = owned(Resource, reference.id, lock=True)
            if resource.archived:
                raise APIError("resource_archived", "已归档资源不能发布", 409)
            if reference.revision != resource.revision:
                raise APIError("revision_conflict", "发布草稿已变化，请重新预览", 409)
            content, _ = normalize_content(resource.kind, resource.content)
            body = canonical(content)
            versions.append(
                {
                    "resource_id": resource.id,
                    "kind": resource.kind,
                    "format_version": 1,
                    "payload": body,
                    "sha256": hashlib.sha256(body.encode()).hexdigest(),
                }
            )
    if len({v["kind"] for v in versions}) != len(versions):
        raise APIError("duplicate_kind", "每次发布每种类型只能选择一个资源", 422)
    targets = resolve_targets(payload)
    signature = digest(
        "preview:"
        + canonical(
            {
                "account_id": g.account.id,
                "request": payload.model_dump(),
                "rollback_of": rollback_id,
                "versions": [{"resource_id": v["resource_id"], "sha256": v["sha256"]} for v in versions],
                "device_ids": [d.id for d in targets],
            }
        )
    )
    return versions, targets, signature


def preview_release(payload, rollback_id=None):
    lock_account(g.account.id)
    versions, targets, signature = release_inputs(payload, rollback_id)
    return {
        "preview_token": signature,
        "devices": [{"id": d.id, "name": d.name} for d in targets],
        "versions": [
            {"kind": v["kind"], "sha256": v["sha256"], "content": json.loads(v["payload"])} for v in versions
        ],
    }


def publish(payload, idempotency_key, preview_token, rollback_id=None):
    if not idempotency_key or len(idempotency_key) > 64:
        raise APIError("idempotency_required", "发布需要不超过 64 字符的 Idempotency-Key", 422)
    lock_account(g.account.id)
    request_hash = hashlib.sha256(
        canonical({"payload": payload.model_dump(), "rollback_id": rollback_id}).encode()
    ).hexdigest()
    previous = db.session.scalar(
        select(Release).where(Release.account_id == g.account.id, Release.idempotency_key == idempotency_key)
    )
    if previous:
        if previous.request_hash != request_hash:
            raise APIError("idempotency_conflict", "该幂等键已用于另一发布请求", 409)
        return release_dict(previous, detail=True)
    versions, targets, signature = release_inputs(payload, rollback_id)
    if not preview_token or not secrets.compare_digest(signature, preview_token):
        raise APIError("preview_changed", "发布内容或设备名单已变化，请重新预览", 409)
    release = Release(
        account_id=g.account.id,
        idempotency_key=idempotency_key,
        request_hash=request_hash,
        note=payload.note,
        rollback_of=rollback_id,
    )
    db.session.add(release)
    db.session.flush()
    for data in versions:
        version = PublishedVersion(account_id=g.account.id, release_id=release.id, **data)
        db.session.add(version)
        db.session.flush()
        for device in targets:
            channel = db.session.scalar(
                select(DeviceChannel)
                .where(DeviceChannel.device_id == device.id, DeviceChannel.kind == version.kind)
                .execution_options(populate_existing=True)
                .with_for_update()
            )
            channel.generation += 1
            assignment = Assignment(
                release_id=release.id,
                device_id=device.id,
                version_id=version.id,
                kind=version.kind,
                generation=channel.generation,
            )
            db.session.add(assignment)
            db.session.flush()
            channel.assignment_id = assignment.id
            channel.status, channel.reason, channel.attempt = "pending", "", 0
    db.session.flush()
    audit("release.rollback" if rollback_id else "release.publish", release.id, targets=len(targets))
    return release_dict(release, detail=True)


def release_dict(release, detail=False):
    versions = list(
        db.session.scalars(select(PublishedVersion).where(PublishedVersion.release_id == release.id))
    )
    data = {
        "id": release.id,
        "created_at": iso(release.created_at),
        "note": release.note,
        "rollback_of": release.rollback_of,
        "versions": [
            {
                "id": v.id,
                "resource_id": v.resource_id,
                "kind": v.kind,
                "sha256": v.sha256,
                "format_version": v.format_version,
            }
            for v in versions
        ],
    }
    data["target_count"] = db.session.scalar(
        select(func.count(func.distinct(Assignment.device_id))).where(Assignment.release_id == release.id)
    )
    if detail:
        targets = []
        for assignment in db.session.scalars(
            select(Assignment)
            .where(Assignment.release_id == release.id)
            .order_by(Assignment.device_id, Assignment.kind)
        ):
            device = db.session.get(Device, assignment.device_id)
            latest = db.session.scalar(
                select(Receipt)
                .where(Receipt.assignment_id == assignment.id)
                .order_by(Receipt.attempt.desc())
                .limit(1)
            )
            channel = db.session.get(DeviceChannel, (device.id, assignment.kind))
            targets.append(
                {
                    "assignment_id": assignment.id,
                    "device_id": device.id,
                    "device_name": device.name,
                    "kind": assignment.kind,
                    "generation": assignment.generation,
                    "version_id": assignment.version_id,
                    "superseded": channel.generation > assignment.generation,
                    "status": latest.result if latest else "pending",
                    "reason": latest.reason if latest else "",
                }
            )
        data["targets"] = targets
    return data


def sync_device(payload):
    lock_account(g.device.account_id)
    device = db.session.scalar(
        select(Device)
        .where(Device.id == g.device.id)
        .execution_options(populate_existing=True)
        .with_for_update()
    )
    if device.revoked_at:
        raise APIError("device_unauthorized", "设备凭证已撤销", 401)
    device.last_seen_at, device.client_version = now(), payload.client_version
    channels = {}
    for channel in db.session.scalars(select(DeviceChannel).where(DeviceChannel.device_id == device.id)):
        if not channel.assignment_id:
            channels[channel.kind] = None
            continue
        assignment = db.session.get(Assignment, channel.assignment_id)
        version = db.session.get(PublishedVersion, assignment.version_id)
        compatible = version.format_version in getattr(payload.supported_formats, channel.kind)
        if not compatible:
            channel.status, channel.reason = "blocked", "unsupported_format"
        elif channel.reason == "unsupported_format":
            channel.status, channel.reason = "pending", ""
        channels[channel.kind] = {
            **channel_dict(channel),
            "version_id": version.id,
            "sha256": version.sha256,
            "format_version": version.format_version,
            "compatible": compatible,
            "download_url": f"/api/v1/versions/{version.id}/content" if compatible else None,
        }
    return {
        "device_id": device.id,
        "server_time": iso(now()),
        "sync_after_seconds": 20 + secrets.randbelow(11),
        "channels": channels,
    }


def receive_receipt(payload):
    lock_account(g.device.account_id)
    device = db.session.scalar(
        select(Device)
        .where(Device.id == g.device.id)
        .execution_options(populate_existing=True)
        .with_for_update()
    )
    if device.revoked_at:
        raise APIError("device_unauthorized", "设备凭证已撤销", 401)
    assignment = db.session.get(Assignment, payload.assignment_id)
    if not assignment or assignment.device_id != device.id:
        raise APIError("not_found", "分配记录不存在", 404)
    if (assignment.kind, assignment.generation, assignment.version_id) != (
        payload.kind,
        payload.generation,
        payload.version_id,
    ):
        raise APIError("receipt_mismatch", "回执与分配记录不匹配", 422)
    body_hash = hashlib.sha256(canonical(payload.model_dump()).encode()).hexdigest()
    existing = db.session.scalar(
        select(Receipt).where(Receipt.assignment_id == assignment.id, Receipt.attempt == payload.attempt)
    )
    if existing:
        if existing.request_hash != body_hash:
            raise APIError("receipt_conflict", "该尝试序号已有不同回执", 409)
        return {"receipt_id": existing.id, "duplicate": True}
    receipt = Receipt(
        device_id=device.id,
        assignment_id=assignment.id,
        attempt=payload.attempt,
        result=payload.result,
        reason=payload.reason,
        request_hash=body_hash,
    )
    db.session.add(receipt)
    channel = db.session.get(DeviceChannel, (device.id, assignment.kind))
    if assignment.generation == channel.generation and payload.attempt > channel.attempt:
        channel.attempt, channel.status, channel.reason = payload.attempt, payload.result, payload.reason
    if payload.result == "applied" and assignment.generation >= channel.applied_generation:
        latest_success_or_failure = db.session.scalar(
            select(Receipt)
            .where(Receipt.assignment_id == assignment.id, Receipt.attempt > payload.attempt)
            .limit(1)
        )
        if not latest_success_or_failure:
            channel.applied_generation, channel.applied_version_id = (
                assignment.generation,
                assignment.version_id,
            )
    db.session.flush()
    return {"receipt_id": receipt.id, "duplicate": False}


def receipt_dict(receipt):
    assignment = db.session.get(Assignment, receipt.assignment_id)
    return {
        "id": receipt.id,
        "assignment_id": assignment.id,
        "kind": assignment.kind,
        "generation": assignment.generation,
        "version_id": assignment.version_id,
        "attempt": receipt.attempt,
        "result": receipt.result,
        "reason": receipt.reason,
        "created_at": iso(receipt.created_at),
    }
