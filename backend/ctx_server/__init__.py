import json
import logging
import time
import uuid

from flask import Flask, g, request
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from werkzeug.exceptions import HTTPException
from werkzeug.middleware.proxy_fix import ProxyFix

from .config import config
from .errors import APIError, error_response
from .extensions import db, migrate


def create_app(overrides=None):
    app = Flask(__name__)
    app.config.update(config())
    app.config.update(overrides or {})
    if app.config["PROXY_HOPS"]:
        app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)
    db.init_app(app)
    migrate.init_app(app, db, directory="migrations", compare_type=True)
    from . import models  # noqa: F401
    from .cli import register_cli
    from .routes import api
    from .security import load_session

    app.register_blueprint(api, url_prefix="/api/v1")
    register_cli(app)

    @app.before_request
    def begin_request():
        g.request_id = uuid.uuid4().hex
        g.started = time.monotonic()
        g.new_cookie = None
        g.clear_cookie = False
        if app.config["REQUIRE_HTTPS"] and not request.is_secure:
            raise APIError("https_required", "需要通过 HTTPS 访问", 400)
        # Bearer device endpoints do not read or accept browser cookies.
        if not request.path.startswith("/api/v1/device/") and not request.path.startswith("/api/v1/health/"):
            load_session()

    @app.after_request
    def finish_request(response):
        try:
            if response.status_code < 400:
                db.session.commit()
            else:
                db.session.rollback()
        except IntegrityError:
            db.session.rollback()
            response, status = error_response("conflict", "数据发生冲突，请刷新后重试", 409)
            response.status_code = status
        except SQLAlchemyError:
            db.session.rollback()
            response, status = error_response("database_unavailable", "数据库暂时不可用", 503)
            response.status_code = status
        if response.status_code < 400 and getattr(g, "new_cookie", None):
            response.set_cookie(
                app.config["SESSION_COOKIE_NAME"],
                g.new_cookie,
                max_age=app.config["SESSION_DAYS"] * 86400,
                secure=app.config["SESSION_COOKIE_SECURE"],
                httponly=True,
                samesite="Lax",
            )
        if getattr(g, "clear_cookie", False):
            response.delete_cookie(
                app.config["SESSION_COOKIE_NAME"],
                secure=app.config["SESSION_COOKIE_SECURE"],
                httponly=True,
                samesite="Lax",
            )
        response.headers["X-Request-ID"] = g.request_id
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "same-origin"
        response.headers["Cache-Control"] = "no-store"
        if request.is_secure:
            response.headers["Strict-Transport-Security"] = "max-age=31536000"
        app.logger.info(
            json.dumps(
                {
                    "request_id": g.request_id,
                    "method": request.method,
                    "route": str(request.url_rule or "unmatched"),
                    "status": response.status_code,
                    "duration_ms": round((time.monotonic() - g.started) * 1000),
                }
            )
        )
        return response

    @app.errorhandler(APIError)
    def api_error(error):
        db.session.rollback()
        response, status = error_response(error.code, error.message, error.status, error.details)
        if error.status == 429:
            response.headers["Retry-After"] = str(error.details["retry_after"])
        return response, status

    @app.errorhandler(HTTPException)
    def http_error(error):
        return error_response(
            {
                413: "request_too_large",
                404: "not_found",
                405: "method_not_allowed",
                400: "invalid_request",
            }.get(error.code, "http_error"),
            error.description,
            error.code,
        )

    @app.errorhandler(SQLAlchemyError)
    def database_error(error):
        db.session.rollback()
        if isinstance(error, IntegrityError):
            return error_response("conflict", "数据发生冲突，请刷新后重试", 409)
        return error_response("database_unavailable", "数据库暂时不可用", 503)

    @app.errorhandler(Exception)
    def unexpected_error(error):
        db.session.rollback()
        # Do not log exception text: SQL driver errors may contain bound secrets.
        app.logger.error("Unhandled %s request_id=%s", type(error).__name__, g.request_id)
        return error_response("internal_error", "服务内部错误", 500)

    app.logger.setLevel(logging.INFO)
    return app
