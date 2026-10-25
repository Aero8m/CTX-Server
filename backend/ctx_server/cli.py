import json
from pathlib import Path

import click
from sqlalchemy import delete, select
from werkzeug.security import generate_password_hash

from .extensions import db
from .models import Account, BrowserSession, Captcha, PairingCode, RateBucket, now
from .schemas import Credentials


def register_cli(app):
    @app.cli.group("accounts")
    def accounts():
        """Create, disable or recover accounts. Passwords are read without echo."""

    def find(username):
        account = db.session.scalar(
            select(Account).where(Account.username == username.lower()).with_for_update()
        )
        if not account:
            raise click.ClickException("Account not found")
        return account

    @accounts.command("create")
    @click.argument("username")
    @click.password_option()
    def create(username, password):
        payload = Credentials(username=username, password=password)
        if db.session.scalar(select(Account).where(Account.username == username.lower())):
            raise click.ClickException("Username already exists")
        db.session.add(
            Account(
                username=payload.username.lower(),
                password_hash=generate_password_hash(payload.password, method="scrypt"),
            )
        )
        db.session.commit()
        click.echo("Account created")

    @accounts.command("reset-password")
    @click.argument("username")
    @click.password_option()
    def reset_password(username, password):
        payload = Credentials(username=username, password=password)
        account = find(username)
        account.password_hash = generate_password_hash(payload.password, method="scrypt")
        db.session.execute(delete(BrowserSession).where(BrowserSession.account_id == account.id))
        db.session.commit()
        click.echo("Password reset; all browser sessions revoked")

    @accounts.command("disable")
    @click.argument("username")
    def disable(username):
        account = find(username)
        account.active = False
        db.session.execute(delete(BrowserSession).where(BrowserSession.account_id == account.id))
        db.session.commit()
        click.echo("Account disabled; browser and device authentication revoked")

    @accounts.command("enable")
    @click.argument("username")
    def enable(username):
        find(username).active = True
        db.session.commit()
        click.echo("Account enabled")

    @app.cli.command("cleanup")
    def cleanup():
        """Remove expired ephemeral records, never releases or device history."""
        for model in (Captcha, BrowserSession, RateBucket, PairingCode):
            db.session.execute(delete(model).where(model.expires_at < now()))
        db.session.commit()
        click.echo("Expired sessions, captchas, rate buckets and pairing codes removed")

    @app.cli.command("export-contracts")
    @click.option("--output", type=click.Path(path_type=Path), default=Path("../contracts"))
    def export_contracts(output):
        from .contracts import build_openapi, wire_schemas

        output.mkdir(parents=True, exist_ok=True)
        for name, schema in wire_schemas().items():
            (output / f"{name}.schema.json").write_text(
                json.dumps(schema, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
            )
        (output / "openapi.json").write_text(
            json.dumps(build_openapi(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        click.echo(f"Contracts exported to {output.resolve()}")
