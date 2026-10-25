import os
from pathlib import Path


def config():
    environment = os.getenv("CTX_ENV", "development")
    production = environment == "production"
    secret = os.getenv("SECRET_KEY", "development-only-change-before-deploy")
    database = os.getenv("DATABASE_URL", "sqlite:///ctx-development.db")
    hosts = [x.strip() for x in os.getenv("TRUSTED_HOSTS", "").split(",") if x.strip()]
    proxy_hops = int(os.getenv("PROXY_HOPS", "0"))
    if production:
        if len(secret) < 32 or secret.startswith(("development-", "replace-")):
            raise RuntimeError("Production requires a stable random SECRET_KEY of at least 32 characters")
        if not database.startswith("mysql+pymysql://"):
            raise RuntimeError("Production requires a mysql+pymysql DATABASE_URL")
        if not hosts or proxy_hops != 1 or os.getenv("PUBLIC_URL", "").split(":", 1)[0] != "https":
            raise RuntimeError("Production requires TRUSTED_HOSTS, PROXY_HOPS=1 and an https PUBLIC_URL")
    engine = {"pool_pre_ping": True, "pool_recycle": 1800, "hide_parameters": True}
    if database.startswith("mysql"):
        engine.update(
            pool_size=int(os.getenv("DB_POOL_SIZE", "5")),
            max_overflow=2,
            pool_timeout=10,
            isolation_level="READ COMMITTED",
            connect_args={"connect_timeout": 5, "read_timeout": 15, "write_timeout": 15},
        )
    return dict(
        SECRET_KEY=secret,
        SQLALCHEMY_DATABASE_URI=database,
        SQLALCHEMY_ENGINE_OPTIONS=engine,
        SQLALCHEMY_TRACK_MODIFICATIONS=False,
        MAX_CONTENT_LENGTH=2 * 1024 * 1024,
        SESSION_COOKIE_NAME="ctx_session",
        SESSION_COOKIE_SECURE=production,
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SAMESITE="Lax",
        SESSION_DAYS=7,
        TRUSTED_HOSTS=hosts or None,
        PROXY_HOPS=proxy_hops,
        REQUIRE_HTTPS=production,
        RATELIMIT_ENABLED=True,
        DATABASE_STARTUP_ATTEMPTS=3,
        PUBLIC_URL=os.getenv("PUBLIC_URL", "http://localhost:5173"),
        SCHEMA_DIR=str(Path(__file__).resolve().parents[2] / "contracts"),
    )
