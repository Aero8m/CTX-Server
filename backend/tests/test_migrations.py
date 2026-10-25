import os
from pathlib import Path

import pytest
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from ctx_server import create_app
from ctx_server.extensions import db
from flask_migrate import downgrade, upgrade
from sqlalchemy import inspect, text


@pytest.mark.mysql
@pytest.mark.skipif(
    not os.getenv("TEST_MIGRATION_DATABASE_URL"), reason="dedicated migration database required"
)
def test_empty_database_upgrade_downgrade_and_reupgrade():
    url = os.environ["TEST_MIGRATION_DATABASE_URL"]
    assert "test" in url.rsplit("/", 1)[-1].lower()
    application = create_app({"SQLALCHEMY_DATABASE_URI": url, "SQLALCHEMY_ENGINE_OPTIONS": {}})
    directory = str(Path(__file__).resolve().parents[1] / "migrations")
    with application.app_context():
        db.drop_all()
        db.session.execute(text("DROP TABLE IF EXISTS alembic_version"))
        db.session.commit()
        upgrade(directory=directory)
        assert "published_versions" in inspect(db.engine).get_table_names()
        with db.engine.connect() as connection:
            assert compare_metadata(MigrationContext.configure(connection), db.metadata) == []
        downgrade(directory=directory, revision="base")
        assert set(inspect(db.engine).get_table_names()) == {"alembic_version"}
        upgrade(directory=directory)
        assert "receipts" in inspect(db.engine).get_table_names()
        downgrade(directory=directory, revision="base")
        db.engine.dispose()
