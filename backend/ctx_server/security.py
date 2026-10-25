import hashlib
import hmac
import secrets
import time
from datetime import timedelta
from functools import wraps

from flask import current_app, g, request
from sqlalchemy import select
from sqlalchemy.dialects.mysql import insert as mysql_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert

from .errors import APIError
from .extensions import db
from .models import Account, BrowserSession, Device, RateBucket, now


def digest(value):
    return hmac.new(current_app.config["SECRET_KEY"].encode(), value.encode(), hashlib.sha256).hexdigest()


def issue_session(account_id=None):
    token = secrets.token_urlsafe(32)
    csrf = digest("csrf:" + token)
    session = BrowserSession(
        token_hash=digest(token),
        csrf_hash=digest(csrf),
        account_id=account_id,
        expires_at=now() + timedelta(days=current_app.config["SESSION_DAYS"]),
    )
    db.session.add(session)
    db.session.flush()
    g.browser_session = session
    g.new_cookie = token
    return csrf


def load_session():
    g.browser_session, g.account, g.device = None, None, None
    raw = request.cookies.get(current_app.config["SESSION_COOKIE_NAME"], "")
    if raw and len(raw) < 200:
        session = db.session.scalar(
            select(BrowserSession).where(
                BrowserSession.token_hash == digest(raw), BrowserSession.expires_at > now()
            )
        )
        if session:
            g.browser_session = session
            if session.account_id:
                account = db.session.get(Account, session.account_id)
                if account and account.active:
                    g.account = account


def csrf_required():
    session = g.browser_session
    token = request.headers.get("X-CSRF-Token", "")
    if not session or not token or not hmac.compare_digest(session.csrf_hash, digest(token)):
        raise APIError("csrf_failed", "页面会话已失效，请刷新后重试", 403)


def account_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not g.account:
            raise APIError("unauthenticated", "请先登录", 401)
        if request.method not in {"GET", "HEAD", "OPTIONS"}:
            csrf_required()
        return fn(*args, **kwargs)

    return wrapper


def authenticate_device():
    token = request.headers.get("Authorization", "")
    if not token.startswith("Bearer ") or not 43 <= len(token[7:]) <= 128:
        raise APIError("device_unauthorized", "设备凭证无效或已撤销", 401)
    device = db.session.scalar(select(Device).where(Device.credential_hash == digest(token[7:])))
    if not device or device.revoked_at:
        raise APIError("device_unauthorized", "设备凭证无效或已撤销", 401)
    account = db.session.get(Account, device.account_id)
    if not account or not account.active:
        raise APIError("device_unauthorized", "设备凭证无效或已撤销", 401)
    g.device = device
    return device


def device_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        authenticate_device()
        return fn(*args, **kwargs)

    return wrapper


def rate_key(scope, identity, seconds):
    bucket = int(time.time()) // seconds
    return digest(f"rate:{scope}:{identity}:{seconds}:{bucket}")


def rate_hits(scope, identity, seconds):
    # A separate transaction must survive rejected requests and password failures.
    with db.engine.connect() as connection:
        row = connection.execute(
            select(RateBucket.hits).where(RateBucket.key == rate_key(scope, identity, seconds))
        ).scalar()
        return row or 0


def rate_limit(scope, limit, seconds=60, identity=None):
    if not current_app.config["RATELIMIT_ENABLED"]:
        return
    key = rate_key(scope, identity or request.remote_addr or "unknown", seconds)
    expiry = now() + timedelta(seconds=seconds * 2)
    with db.engine.begin() as connection:
        values = {"key": key, "hits": 1, "expires_at": expiry}
        if connection.dialect.name == "mysql":
            stmt = mysql_insert(RateBucket).values(**values)
            stmt = stmt.on_duplicate_key_update(hits=RateBucket.hits + 1)
        else:
            stmt = (
                sqlite_insert(RateBucket)
                .values(**values)
                .on_conflict_do_update(index_elements=["key"], set_={"hits": RateBucket.hits + 1})
            )
        connection.execute(stmt)
        hits = connection.execute(select(RateBucket.hits).where(RateBucket.key == key)).scalar_one()
    if hits > limit:
        raise APIError("rate_limited", "请求过于频繁，请稍后重试", 429, {"retry_after": seconds})


def owned(model, object_id, lock=False):
    stmt = select(model).where(model.id == object_id, model.account_id == g.account.id)
    if lock:
        stmt = stmt.with_for_update()
    obj = db.session.scalar(stmt)
    if not obj:
        raise APIError("not_found", "对象不存在", 404)
    return obj


def lock_account(account_id):
    # Serializes mutations of membership, pairing and publication for this owner.
    account = db.session.scalar(
        select(Account)
        .where(Account.id == account_id)
        .execution_options(populate_existing=True)
        .with_for_update()
    )
    if not account or not account.active:
        raise APIError("unauthenticated", "账号已停用", 401)
    return account
