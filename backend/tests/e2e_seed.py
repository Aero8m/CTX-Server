"""Test-only direct database setup. Exposes no HTTP bypass or fixed production captcha."""

import os
import sys

from ctx_server import create_app
from ctx_server.extensions import db
from ctx_server.models import Account, Captcha
from ctx_server.security import digest
from werkzeug.security import generate_password_hash

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
    if sys.argv[1] == "--account":
        db.session.add(
            Account(username=sys.argv[2], password_hash=generate_password_hash("browser-password-123"))
        )
    else:
        captcha = db.session.get(Captcha, sys.argv[1])
        if captcha is None:
            raise RuntimeError("Captcha not found")
        captcha.answer_hash = digest("captcha:ABCDE")
    db.session.commit()
