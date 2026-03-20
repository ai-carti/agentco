"""
Tests for database engine configuration (ALEX-POST-001).

Verifies DATABASE_URL-based engine selection:
- SQLite URL → SQLite engine
- No DATABASE_URL → SQLite fallback (sqlite:///./agentco.db)
- Postgres URL pattern → engine URL starts with postgres
"""
import os
import pytest
from unittest.mock import patch


# ---------------------------------------------------------------------------
# _make_engine: pure function, testable without env manipulation
# ---------------------------------------------------------------------------

def test_sqlite_url_creates_sqlite_engine():
    """Explicit sqlite:// URL produces a SQLite engine."""
    from agentco.db.session import _make_engine

    eng = _make_engine("sqlite:///./agentco_test_tmp.db")
    assert eng.dialect.name == "sqlite"
    eng.dispose()


def test_memory_sqlite_url_creates_sqlite_engine():
    """In-memory sqlite:// URL also produces a SQLite engine."""
    from agentco.db.session import _make_engine

    eng = _make_engine("sqlite:///:memory:")
    assert eng.dialect.name == "sqlite"
    eng.dispose()


# ---------------------------------------------------------------------------
# _resolve_db_url: reads env at call-time, safe to patch
# ---------------------------------------------------------------------------

def test_no_database_url_falls_back_to_sqlite():
    """When DATABASE_URL and AGENTCO_DB_URL are absent, returns SQLite default."""
    from agentco.db.session import _resolve_db_url

    env_clean = {k: v for k, v in os.environ.items()
                 if k not in ("DATABASE_URL", "AGENTCO_DB_URL")}
    with patch.dict(os.environ, env_clean, clear=True):
        url = _resolve_db_url()

    assert url == "sqlite:///./agentco.db"


def test_database_url_env_overrides_default():
    """DATABASE_URL env variable is used when set."""
    from agentco.db.session import _resolve_db_url

    with patch.dict(os.environ, {"DATABASE_URL": "sqlite:///./custom.db"}, clear=False):
        url = _resolve_db_url()

    assert url == "sqlite:///./custom.db"


def test_legacy_agentco_db_url_still_works():
    """Legacy AGENTCO_DB_URL is respected when DATABASE_URL is absent."""
    from agentco.db.session import _resolve_db_url

    env = {k: v for k, v in os.environ.items() if k != "DATABASE_URL"}
    env["AGENTCO_DB_URL"] = "sqlite:///./legacy.db"
    with patch.dict(os.environ, env, clear=True):
        url = _resolve_db_url()

    assert url == "sqlite:///./legacy.db"


def test_database_url_takes_priority_over_legacy():
    """DATABASE_URL takes priority over AGENTCO_DB_URL."""
    from agentco.db.session import _resolve_db_url

    with patch.dict(os.environ,
                    {"DATABASE_URL": "sqlite:///./new.db",
                     "AGENTCO_DB_URL": "sqlite:///./old.db"},
                    clear=False):
        url = _resolve_db_url()

    assert url == "sqlite:///./new.db"


def test_postgres_url_recognized():
    """postgresql:// URL resolves correctly (no connection attempted)."""
    from agentco.db.session import _resolve_db_url

    pg_url = "postgresql://user:pass@localhost:5432/agentco"
    with patch.dict(os.environ, {"DATABASE_URL": pg_url}, clear=False):
        url = _resolve_db_url()

    assert url == pg_url
    assert url.startswith("postgresql://")


def test_postgres_alias_url_recognized():
    """postgres:// alias also resolves correctly."""
    from agentco.db.session import _resolve_db_url

    pg_url = "postgres://user:pass@localhost:5432/agentco"
    with patch.dict(os.environ, {"DATABASE_URL": pg_url}, clear=False):
        url = _resolve_db_url()

    assert url.startswith("postgres://")
