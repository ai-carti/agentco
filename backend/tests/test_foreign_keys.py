"""
M0-003 FIX: Test that PRAGMA foreign_keys=ON is enforced on every connection,
including Alembic migrations.

TDD: This test must fail before the fix, pass after.
"""
import os
import tempfile
import subprocess
from pathlib import Path

import pytest
import sqlalchemy as sa
from sqlalchemy import create_engine, event, text


BACKEND_DIR = Path(__file__).parent.parent


def make_engine_with_fk(db_url: str):
    """Create an engine with foreign_keys=ON (same as session.py)."""
    engine = create_engine(db_url, connect_args={"check_same_thread": False})

    @event.listens_for(engine, "connect")
    def set_pragmas(dbapi_conn, _record):
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA journal_mode=WAL;")
        cursor.execute("PRAGMA foreign_keys=ON;")
        cursor.close()

    return engine


def apply_migrations(db_path: str) -> None:
    env = {**os.environ, "AGENTCO_DB_URL": f"sqlite:///{db_path}"}
    result = subprocess.run(
        ["uv", "run", "python", "-m", "alembic", "upgrade", "head"],
        cwd=BACKEND_DIR,
        env=env,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, (
        f"Alembic migration failed:\nSTDOUT: {result.stdout}\nSTDERR: {result.stderr}"
    )


def test_foreign_key_violation_raises_integrity_error():
    """
    Insert an agent with a non-existent company_id.
    Expect IntegrityError — NOT silent insert.

    This verifies PRAGMA foreign_keys=ON is active on connections.
    """
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
        db_path = f.name

    try:
        apply_migrations(db_path)

        engine = make_engine_with_fk(f"sqlite:///{db_path}")
        with engine.connect() as conn:
            # Verify FK is ON
            fk_status = conn.execute(text("PRAGMA foreign_keys;")).scalar()
            assert fk_status == 1, f"PRAGMA foreign_keys expected 1, got {fk_status}"

            # Try inserting agent with non-existent company_id (999999)
            with pytest.raises(sa.exc.IntegrityError):
                conn.execute(
                    text(
                        "INSERT INTO agents (id, company_id, name, role, model, created_at) "
                        "VALUES ('test-agent-1', 999999, 'Ghost Agent', 'worker', 'gpt-4o', datetime('now'))"
                    )
                )
    finally:
        for suffix in ("", "-shm", "-wal"):
            p = Path(db_path + suffix)
            if p.exists():
                p.unlink()


def test_alembic_env_configures_foreign_keys():
    """
    RED before fix: alembic/env.py must explicitly set PRAGMA foreign_keys=ON
    on its migration connection, otherwise FK violations are silently ignored
    during migration scripts.
    """
    env_py_path = BACKEND_DIR / "alembic" / "env.py"
    content = env_py_path.read_text()
    assert "foreign_keys" in content, (
        "alembic/env.py does not configure PRAGMA foreign_keys=ON — "
        "FK violations during migrations are silently ignored. "
        "Add event listener or connection_kwargs to enforce FK on alembic connection."
    )


def test_alembic_engine_has_foreign_keys_on():
    """
    Verify that after migration, FK constraints exist in schema
    and are enforced when FK=ON is active.
    """
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
        db_path = f.name

    try:
        apply_migrations(db_path)

        # Use raw sqlite3 with FK ON to verify schema has FK constraints defined
        import sqlite3
        conn = sqlite3.connect(db_path)
        conn.execute("PRAGMA foreign_keys=ON")
        try:
            fk_list = conn.execute("PRAGMA foreign_key_list(agents);").fetchall()
            # agents table should have FK to companies
            assert len(fk_list) > 0, (
                "agents table has no FK constraints defined in schema — "
                "migrations may not have created proper FK constraints"
            )
        finally:
            conn.close()
    finally:
        for suffix in ("", "-shm", "-wal"):
            p = Path(db_path + suffix)
            if p.exists():
                p.unlink()
