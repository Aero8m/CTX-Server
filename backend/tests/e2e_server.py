"""Local browser-test harness. Never used by production entrypoints."""

import os

from ctx_server import create_app
from ctx_server.extensions import db

url = os.environ["E2E_DATABASE_URL"]
if "test" not in url.rsplit("/", 1)[-1].lower():
    raise RuntimeError("E2E_DATABASE_URL must point to a disposable test database")
app = create_app(
    {
        "SQLALCHEMY_DATABASE_URI": url,
        "SQLALCHEMY_ENGINE_OPTIONS": {"pool_pre_ping": True},
        "SECRET_KEY": "e2e-only-local-test-key-0123456789",
        "REQUIRE_HTTPS": False,
        "PROXY_HOPS": 0,
        "TRUSTED_HOSTS": None,
    }
)
with app.app_context():
    db.drop_all()
    db.create_all()
app.run(host="127.0.0.1", port=5001, threaded=True, use_reloader=False)
