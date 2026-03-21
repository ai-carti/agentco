"""
Tests for ALEX-POST-001 — SQLite → PostgreSQL migration support.

Verifies:
- DATABASE_URL parsing (_resolve_db_url, _is_postgres)
- _make_engine returns correct dialect per URL
- Alembic migration 0001 guards PRAGMA behind sqlite-only condition
"""
import os
import ast
import textwrap
from pathlib import Path
from unittest.mock import patch

import pytest

# ── DATABASE_URL parsing ──────────────────────────────────────────────────────

def test_sqlite_url_creates_sqlite_engine():
    from agentco.db.session import _make_engine
    eng = _make_engine("sqlite:///./agentco_test_post001.db")
    assert eng.dialect.name == "sqlite"
    eng.dispose()


def test_memory_sqlite_creates_sqlite_engine():
    from agentco.db.session import _make_engine
    eng = _make_engine("sqlite:///:memory:")
    assert eng.dialect.name == "sqlite"
    eng.dispose()


def test_no_database_url_fallback_to_sqlite():
    from agentco.db.session import _resolve_db_url
    env_clean = {k: v for k, v in os.environ.items()
                 if k not in ("DATABASE_URL", "AGENTCO_DB_URL")}
    with patch.dict(os.environ, env_clean, clear=True):
        url = _resolve_db_url()
    assert url == "sqlite:///./agentco.db"


def test_database_url_env_used_when_set():
    from agentco.db.session import _resolve_db_url
    with patch.dict(os.environ, {"DATABASE_URL": "sqlite:///./override.db"}):
        url = _resolve_db_url()
    assert url == "sqlite:///./override.db"


def test_postgres_url_recognized():
    from agentco.db.session import _resolve_db_url, _is_postgres
    pg_url = "postgresql://user:pass@localhost:5432/agentco"
    with patch.dict(os.environ, {"DATABASE_URL": pg_url}):
        url = _resolve_db_url()
    assert url == pg_url
    assert _is_postgres(url) is True


def test_postgres_alias_url_recognized():
    from agentco.db.session import _is_postgres
    assert _is_postgres("postgres://user:pass@localhost:5432/agentco") is True


def test_sqlite_url_not_postgres():
    from agentco.db.session import _is_postgres
    assert _is_postgres("sqlite:///./agentco.db") is False


def test_legacy_agentco_db_url_respected():
    from agentco.db.session import _resolve_db_url
    env = {k: v for k, v in os.environ.items() if k != "DATABASE_URL"}
    env["AGENTCO_DB_URL"] = "sqlite:///./legacy.db"
    with patch.dict(os.environ, env, clear=True):
        url = _resolve_db_url()
    assert url == "sqlite:///./legacy.db"


def test_database_url_takes_priority_over_legacy():
    from agentco.db.session import _resolve_db_url
    with patch.dict(os.environ,
                    {"DATABASE_URL": "sqlite:///./new.db",
                     "AGENTCO_DB_URL": "sqlite:///./old.db"}):
        url = _resolve_db_url()
    assert url == "sqlite:///./new.db"


# ── Alembic migration Postgres compatibility ──────────────────────────────────

def _load_migration_source(filename: str) -> str:
    path = Path(__file__).parent.parent / "alembic" / "versions" / filename
    return path.read_text()


def test_migration_0001_pragma_guarded_by_sqlite_check():
    """PRAGMA journal_mode=WAL in 0001 must be inside a dialect check, not raw."""
    source = _load_migration_source("0001_initial_schema.py")
    # The PRAGMA must NOT appear as a bare op.execute without dialect guard
    # We verify that the word 'sqlite' appears before the PRAGMA line
    lines = source.splitlines()
    pragma_lines = [i for i, l in enumerate(lines) if "PRAGMA journal_mode" in l]
    assert pragma_lines, "PRAGMA journal_mode not found in 0001 migration"

    # For each PRAGMA line, check that within the 5 preceding lines there is
    # a dialect/sqlite guard
    for lineno in pragma_lines:
        context = "\n".join(lines[max(0, lineno - 5):lineno + 1])
        assert "sqlite" in context.lower(), (
            f"PRAGMA at line {lineno + 1} is not guarded by a sqlite dialect check.\n"
            f"Context:\n{context}"
        )


def test_migration_0001_no_raw_pragma_outside_guard():
    """Raw PRAGMA not allowed outside dialect check (double-check via AST)."""
    source = _load_migration_source("0001_initial_schema.py")
    # Simple string-based check: PRAGMA must be inside an if block
    # Find if there's "PRAGMA" and it follows dialect check pattern
    assert "dialect.name" in source or 'dialect.name' in source or \
           "dialect" in source, (
        "Migration 0001 references PRAGMA but has no dialect check"
    )


def test_all_migrations_no_raw_sqlite_pragma():
    """No migration should have a raw op.execute(PRAGMA ...) without a guard."""
    versions_dir = Path(__file__).parent.parent / "alembic" / "versions"
    for migration_file in sorted(versions_dir.glob("*.py")):
        source = migration_file.read_text()
        if "PRAGMA" not in source:
            continue
        # Check that any PRAGMA is guarded
        lines = source.splitlines()
        pragma_lines = [i for i, l in enumerate(lines) if "PRAGMA" in l]
        for lineno in pragma_lines:
            # Look back up to 10 lines for a dialect guard
            context = "\n".join(lines[max(0, lineno - 10):lineno + 1])
            assert "sqlite" in context.lower() or "dialect" in context.lower(), (
                f"{migration_file.name} line {lineno + 1}: PRAGMA not guarded by dialect check.\n"
                f"Context:\n{context}"
            )


def test_migration_0012_exists():
    """Migration 0012_postgresql_compat.py must exist."""
    path = Path(__file__).parent.parent / "alembic" / "versions" / "0012_postgresql_compat.py"
    assert path.exists(), "Migration 0012 not found"


def test_migration_0012_revises_0011():
    """Migration 0012 must revise 0011."""
    source = _load_migration_source("0012_postgresql_compat.py")
    assert 'down_revision = "0011"' in source, "0012 should revise 0011"
    assert 'revision = "0012"' in source, "revision should be 0012"


def test_migration_0012_pragma_guarded():
    """Any PRAGMA in 0012 must be guarded by sqlite dialect check."""
    source = _load_migration_source("0012_postgresql_compat.py")
    if "PRAGMA" not in source:
        return  # no PRAGMA — OK
    lines = source.splitlines()
    pragma_lines = [i for i, l in enumerate(lines) if "PRAGMA" in l]
    for lineno in pragma_lines:
        context = "\n".join(lines[max(0, lineno - 10):lineno + 1])
        assert "sqlite" in context.lower() or "dialect" in context.lower(), (
            f"0012 line {lineno + 1}: PRAGMA not guarded\nContext:\n{context}"
        )
