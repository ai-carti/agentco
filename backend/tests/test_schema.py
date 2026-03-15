"""
M0-003: Test SQLite schema migrations via Alembic.

Run: uv run pytest tests/test_schema.py -v
"""
import sqlite3
import tempfile
from pathlib import Path

import pytest


EXPECTED_TABLES = {
    "companies",
    "agents",
    "tasks",
    "llm_credentials",
    "runs",
}


def apply_migrations(db_path: str) -> None:
    """Apply Alembic migrations to the given SQLite DB path."""
    import subprocess
    import os

    backend_dir = Path(__file__).parent.parent
    env = {**os.environ, "AGENTCO_DB_URL": f"sqlite:///{db_path}"}
    result = subprocess.run(
        ["uv", "run", "python", "-m", "alembic", "upgrade", "head"],
        cwd=backend_dir,
        env=env,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, (
        f"Alembic migration failed:\nSTDOUT: {result.stdout}\nSTDERR: {result.stderr}"
    )


def test_schema_creates_all_tables():
    """Apply migrations from scratch and verify all tables exist."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
        db_path = f.name

    try:
        apply_migrations(db_path)

        conn = sqlite3.connect(db_path)
        try:
            # Check tables
            rows = conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'alembic_%';"
            ).fetchall()
            actual_tables = {row[0] for row in rows}
            missing = EXPECTED_TABLES - actual_tables
            assert not missing, f"Missing tables: {missing}"

            # Check WAL mode
            wal_mode = conn.execute("PRAGMA journal_mode;").fetchone()[0]
            assert wal_mode == "wal", f"Expected WAL journal mode, got: {wal_mode}"

        finally:
            conn.close()
    finally:
        # Cleanup
        for suffix in ("", "-shm", "-wal"):
            p = Path(db_path + suffix)
            if p.exists():
                p.unlink()


def test_companies_table_columns():
    """Verify companies table has correct columns."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
        db_path = f.name

    try:
        apply_migrations(db_path)
        conn = sqlite3.connect(db_path)
        try:
            cols = {
                row[1]
                for row in conn.execute("PRAGMA table_info(companies);").fetchall()
            }
            assert {"id", "name", "created_at"} <= cols
        finally:
            conn.close()
    finally:
        for suffix in ("", "-shm", "-wal"):
            p = Path(db_path + suffix)
            if p.exists():
                p.unlink()


def test_runs_table_columns():
    """Verify runs table has cost_usd column."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
        db_path = f.name

    try:
        apply_migrations(db_path)
        conn = sqlite3.connect(db_path)
        try:
            cols = {
                row[1]
                for row in conn.execute("PRAGMA table_info(runs);").fetchall()
            }
            assert {"id", "company_id", "task_id", "status", "started_at", "finished_at", "cost_usd"} <= cols
        finally:
            conn.close()
    finally:
        for suffix in ("", "-shm", "-wal"):
            p = Path(db_path + suffix)
            if p.exists():
                p.unlink()
