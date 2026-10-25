"""Test-only direct database setup. Exposes no HTTP bypass or fixed production captcha."""

import os
import sys

from ctx_server import create_app
from ctx_server.extensions import db
from ctx_server.models import Captcha
from ctx_server.security import digest

url = os.environ["E2E_DATABASE_URL"]
if "test" not in url.rsplit("/", 1)[-1].lower():
    raise RuntimeError("Refusing a non-test database")
app = create_app(
    {
        "SQLALCHEMY_DATABASE_URI": url,
        "SQLALCHEMY_ENGINE_OPTIONS": {},
        "SECRET_KEY": "e2e-only-local-test-key-0123456789",
    }
)
with app.app_context():
    captcha = db.session.get(Captcha, sys.argv[1])
    if captcha is None:
        raise RuntimeError("Captcha not found")
    captcha.answer_hash = digest("captcha:ABCDE")
    db.session.commit()
