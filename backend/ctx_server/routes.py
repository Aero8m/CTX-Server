import time

from flask import Blueprint, Response, current_app, g, jsonify, request
from sqlalchemy import func, select, text
from sqlalchemy.exc import OperationalError

from . import schemas as s
from . import services as service
from .errors import APIError
from .extensions import db
from .models import (
    Assignment,
    BrowserSession,
    Device,
    DeviceGroup,
    PairingCode,
    PublishedVersion,
    Release,
    Resource,
    now,
)
from .security import (
    account_required,
    authenticate_device,
    csrf_required,
    device_required,
    digest,
    issue_session,
    lock_account,
    owned,
    rate_limit,
)

api = Blueprint("api", __name__)


def body(schema):
    return s.parse(schema, request.get_json())


def ok(value=None, status=200):
    return jsonify(data=value if value is not None else {}), status


def paginated(stmt, serialize):
    try:
        page, size = int(request.args.get("page", "1")), int(request.args.get("page_size", "20"))
        if page < 1 or not 1 <= size <= 100:
            raise ValueError
    except ValueError:
        raise APIError("validation_error", "分页参数无效", 422) from None
    total = db.session.scalar(select(func.count()).select_from(stmt.order_by(None).subquery()))
    items = db.session.scalars(stmt.limit(size).offset((page - 1) * size)).all()
    return ok({"items": [serialize(item) for item in items], "total": total, "page": page, "page_size": size})


@api.get("/health/live")
def live():
    return ok({"status": "ok"})


@api.get("/health/ready")
def ready():
    attempts = current_app.config["DATABASE_STARTUP_ATTEMPTS"]
    for attempt in range(attempts):
        try:
            db.session.execute(text("SELECT 1"))
            # A responding DB without schema is not ready to serve requests.
            db.session.execute(select(1).select_from(BrowserSession).limit(1))
            return ok({"status": "ready"})
        except OperationalError:
            db.session.rollback()
            if attempt + 1 == attempts:
                raise APIError("database_unavailable", "数据库或迁移未就绪", 503) from None
            time.sleep(0.2 * (attempt + 1))


@api.get("/auth/csrf")
def csrf():
    rate_limit("csrf", 60)
    if g.browser_session:
        token = digest("csrf:" + request.cookies[current_app.config["SESSION_COOKIE_NAME"]])
        g.browser_session.csrf_hash = digest(token)
    else:
        token = issue_session()
    return ok({"csrf_token": token, "authenticated": bool(g.account)})


@api.get("/auth/captcha")
def captcha():
    return ok(service.create_captcha())


@api.post("/auth/register")
def register():
    csrf_required()
    return ok(service.register(body(s.Credentials)), 201)


@api.post("/auth/login")
def login():
    csrf_required()
    return ok(service.login(body(s.Credentials)))


@api.get("/auth/me")
@account_required
def me():
    return ok(service.account_dict(g.account))


@api.post("/auth/logout")
@account_required
def logout():
    db.session.delete(g.browser_session)
    g.clear_cookie = True
    return ok()


@api.post("/auth/password")
@account_required
def password():
    service.change_password(body(s.PasswordChange))
    return ok()


@api.get("/groups")
@account_required
def groups():
    return paginated(
        select(DeviceGroup)
        .where(DeviceGroup.account_id == g.account.id)
        .order_by(DeviceGroup.created_at.desc(), DeviceGroup.id),
        service.group_dict,
    )


@api.post("/groups")
@account_required
def create_group():
    payload = body(s.Named)
    lock_account(g.account.id)
    group = DeviceGroup(account_id=g.account.id, name=payload.name)
    db.session.add(group)
    db.session.flush()
    service.audit("group.create", group.id)
    return ok(service.group_dict(group), 201)


@api.patch("/groups/<object_id>")
@account_required
def edit_group(object_id):
    payload = body(s.Named)
    lock_account(g.account.id)
    group = owned(DeviceGroup, object_id, lock=True)
    group.name = payload.name
    service.audit("group.rename", group.id)
    return ok(service.group_dict(group))


@api.delete("/groups/<object_id>")
@account_required
def delete_group(object_id):
    lock_account(g.account.id)
    group = owned(DeviceGroup, object_id, lock=True)
    for model in (Device, PairingCode):
        for item in db.session.scalars(select(model).where(model.group_id == group.id)):
            item.group_id = None
    db.session.flush()
    db.session.delete(group)
    service.audit("group.delete", group.id)
    return ok()


@api.get("/devices")
@account_required
def devices():
    stmt = select(Device).where(Device.account_id == g.account.id)
    if group_id := request.args.get("group_id"):
        owned(DeviceGroup, group_id)
        stmt = stmt.where(Device.group_id == group_id)
    if name := request.args.get("q"):
        stmt = stmt.where(Device.name.contains(name, autoescape=True))
    if request.args.get("revoked") == "false":
        stmt = stmt.where(Device.revoked_at.is_(None))
    return paginated(stmt.order_by(Device.created_at.desc(), Device.id), service.device_dict)


@api.get("/devices/<object_id>")
@account_required
def device_detail(object_id):
    return ok(service.device_dict(owned(Device, object_id), detail=True))


@api.patch("/devices/<object_id>")
@account_required
def edit_device(object_id):
    payload = body(s.DeviceEdit)
    lock_account(g.account.id)
    device = owned(Device, object_id, lock=True)
    if payload.name is not None:
        device.name = payload.name
    if "group_id" in payload.model_fields_set:
        if payload.group_id:
            owned(DeviceGroup, payload.group_id)
        device.group_id = payload.group_id
    service.audit("device.update", device.id)
    return ok(service.device_dict(device))


@api.post("/devices/<object_id>/revoke")
@account_required
def revoke_device(object_id):
    lock_account(g.account.id)
    device = owned(Device, object_id, lock=True)
    device.revoked_at = device.revoked_at or now()
    service.audit("device.revoke", device.id)
    return ok(service.device_dict(device))


@api.get("/pairing-codes")
@account_required
def pairing_codes():
    return paginated(
        select(PairingCode)
        .where(PairingCode.account_id == g.account.id)
        .order_by(PairingCode.created_at.desc(), PairingCode.id),
        service.pairing_dict,
    )


@api.post("/pairing-codes")
@account_required
def create_pairing():
    rate_limit("create-pairing", 30, 600, g.account.id)
    return ok(service.create_pairing(body(s.PairCodeCreate)), 201)


@api.post("/pairing-codes/<object_id>/revoke")
@account_required
def revoke_pairing(object_id):
    lock_account(g.account.id)
    record = owned(PairingCode, object_id, lock=True)
    record.revoked_at = record.revoked_at or now()
    service.audit("pairing.revoke", record.id)
    return ok(service.pairing_dict(record))


@api.post("/device/pair")
def pair_device():
    return ok(service.claim_pairing(body(s.PairClaim)), 201)


@api.get("/resources")
@account_required
def resources():
    stmt = select(Resource).where(Resource.account_id == g.account.id)
    if kind := request.args.get("kind"):
        if kind not in service.KINDS:
            raise APIError("validation_error", "资源类型无效", 422)
        stmt = stmt.where(Resource.kind == kind)
    stmt = stmt.where(Resource.archived.is_(request.args.get("archived") == "true"))
    if name := request.args.get("q"):
        stmt = stmt.where(Resource.name.contains(name, autoescape=True))
    return paginated(
        stmt.order_by(Resource.updated_at.desc(), Resource.id),
        lambda r: service.resource_dict(r, include_content=False),
    )


@api.post("/resources")
@api.post("/resources/import")
@account_required
def create_resource():
    return ok(service.create_resource(body(s.ResourceCreate)), 201)


@api.post("/resources/validate")
@account_required
def validate_resource():
    payload = body(s.ResourceValidate)
    content, warnings = s.normalize_content(payload.kind, payload.content)
    return ok({"content": content, "warnings": warnings})


@api.get("/resources/<object_id>")
@account_required
def resource_detail(object_id):
    return ok(service.resource_dict(owned(Resource, object_id)))


@api.patch("/resources/<object_id>")
@account_required
def edit_resource(object_id):
    return ok(service.edit_resource(object_id, body(s.ResourceEdit)))


@api.get("/resources/<object_id>/content")
@account_required
def resource_content(object_id):
    resource = owned(Resource, object_id)
    return Response(
        s.canonical(resource.content),
        mimetype="application/json",
        headers={"Content-Disposition": f'attachment; filename="{resource.id}.json"'},
    )


@api.get("/resources/<object_id>/preview")
@account_required
def resource_preview(object_id):
    resource = owned(Resource, object_id)
    if resource.kind != "profile":
        raise APIError("validation_error", "仅档案支持日期预览", 422)
    return ok(s.resolve_profile(resource.content, request.args.get("date"), request.args.get("schedule_id")))


@api.post("/releases/preview")
@account_required
def preview_release():
    return ok(service.preview_release(body(s.ReleaseRequest)))


@api.post("/releases")
@account_required
def publish():
    return ok(
        service.publish(
            body(s.ReleaseRequest),
            request.headers.get("Idempotency-Key"),
            request.headers.get("X-Preview-Token"),
        ),
        201,
    )


@api.get("/releases")
@account_required
def releases():
    stmt = select(Release).where(Release.account_id == g.account.id)
    if device_id := request.args.get("device_id"):
        owned(Device, device_id)
        stmt = stmt.where(
            Release.id.in_(select(Assignment.release_id).where(Assignment.device_id == device_id))
        )
    return paginated(stmt.order_by(Release.created_at.desc(), Release.id), service.release_dict)


@api.get("/releases/<object_id>")
@account_required
def release_detail(object_id):
    return ok(service.release_dict(owned(Release, object_id), detail=True))


@api.post("/releases/<object_id>/rollback/preview")
@account_required
def preview_rollback(object_id):
    return ok(service.preview_release(body(s.RollbackRequest), object_id))


@api.post("/releases/<object_id>/rollback")
@account_required
def rollback_release(object_id):
    return ok(
        service.publish(
            body(s.RollbackRequest),
            request.headers.get("Idempotency-Key"),
            request.headers.get("X-Preview-Token"),
            object_id,
        ),
        201,
    )


@api.get("/versions/<object_id>/content")
def version_content(object_id):
    if request.headers.get("Authorization"):
        device = authenticate_device()
        version = db.session.scalar(
            select(PublishedVersion)
            .join(Assignment, Assignment.version_id == PublishedVersion.id)
            .where(
                PublishedVersion.id == object_id,
                PublishedVersion.account_id == device.account_id,
                Assignment.device_id == device.id,
            )
            .limit(1)
        )
        if not version:
            raise APIError("not_found", "版本不存在", 404)
    else:
        if not g.account:
            raise APIError("unauthenticated", "请先登录", 401)
        version = owned(PublishedVersion, object_id)
    return Response(
        version.payload.encode("utf-8"),
        mimetype="application/json",
        headers={
            "X-Content-SHA256": version.sha256,
            "ETag": '"' + version.sha256 + '"',
            "Content-Disposition": f'attachment; filename="{version.id}.json"',
        },
    )


@api.post("/device/sync")
@device_required
def device_sync():
    return ok(service.sync_device(body(s.SyncRequest)))


@api.post("/device/receipts")
@device_required
def device_receipt():
    return ok(service.receive_receipt(body(s.ReceiptRequest)))


@api.get("/openapi.json")
def openapi():
    from .contracts import build_openapi

    return jsonify(build_openapi())
