"""Bounded connection check; schema changes always require an explicit CLI command."""

import os
import sys
import time

from ctx_server import create_app
from ctx_server.extensions import db
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

app = create_app()
with app.app_context():
    for attempt in range(5):
        try:
            with db.engine.connect() as connection:
                connection.execute(text("SELECT 1"))
            break
        except SQLAlchemyError:
            if attempt == 4:
                sys.exit(
                    "Database unavailable after 5 connection attempts; check DATABASE_URL and networking"
                )
            time.sleep(min(2**attempt, 8))
    db.engine.dispose()
if len(sys.argv) < 2:
    sys.exit("An explicit server or migration command is required")
os.execvp(sys.argv[1], sys.argv[1:])
