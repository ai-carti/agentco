"""
Tests for ALEX-POST-010: async SQLAlchemy engine support.

Verifies:
- postgresql:// URL → auto-converted to postgresql+asyncpg:// and async engine created
- sqlite:// URL → sync engine (unchanged)
- Backward compat: sync engine still works for sqlite
"""
import os
import pytest
from unittest.mock import patch, MagicMock


# ---------------------------------------------------------------------------
# _make_async_engine: should produce an async engine for postgres URLs
# ---------------------------------------------------------------------------

def test_async_engine_created_for_postgresql_url():
    """postgresql:// URL → create_async_engine with postgresql+asyncpg://."""
    from agentco.db.session import _make_async_engine

    # Mock asyncpg to avoid needing real DB connection
    with patch("agentco.db.session.create_async_engine") as mock_create:
        mock_engine = MagicMock()
        mock_engine.dialect.name = "postgresql"
        mock_create.return_value = mock_engine

        engine = _make_async_engine("postgresql://user:pass@localhost:5432/agentco")

        # Should have called create_async_engine with asyncpg URL
        call_args = mock_create.call_args[0][0]
        assert "asyncpg" in call_args or "+asyncpg" in call_args
        assert mock_create.called


def test_async_engine_url_transformation_postgresql():
    """postgresql:// → postgresql+asyncpg:// URL transformation."""
    from agentco.db.session import _to_async_url

    result = _to_async_url("postgresql://user:pass@localhost:5432/agentco")
    assert result == "postgresql+asyncpg://user:pass@localhost:5432/agentco"


def test_async_engine_url_transformation_postgres_alias():
    """postgres:// → postgresql+asyncpg:// URL transformation."""
    from agentco.db.session import _to_async_url

    result = _to_async_url("postgres://user:pass@localhost:5432/agentco")
    assert result == "postgresql+asyncpg://user:pass@localhost:5432/agentco"


def test_async_engine_url_no_change_for_sqlite():
    """sqlite:// URL is not transformed."""
    from agentco.db.session import _to_async_url

    url = "sqlite:///./agentco.db"
    result = _to_async_url(url)
    assert result == url


# ---------------------------------------------------------------------------
# _make_engine: sync engine still works for sqlite
# ---------------------------------------------------------------------------

def test_sync_engine_for_sqlite_url():
    """sqlite:// → sync SQLite engine (backward compat preserved)."""
    from agentco.db.session import _make_engine

    eng = _make_engine("sqlite:///:memory:")
    assert eng.dialect.name == "sqlite"
    eng.dispose()


# ---------------------------------------------------------------------------
# get_async_session: factory function exists and is a callable
# ---------------------------------------------------------------------------

def test_get_async_session_is_callable():
    """get_async_session should be importable and callable."""
    from agentco.db.session import get_async_session
    import inspect
    # It's an async generator function
    assert callable(get_async_session) or inspect.isfunction(get_async_session)


# ---------------------------------------------------------------------------
# Module-level: AsyncSession import available
# ---------------------------------------------------------------------------

def test_async_session_importable():
    """AsyncSession should be importable from db.session."""
    from agentco.db.session import AsyncSession  # noqa: F401
    assert AsyncSession is not None


def test_create_async_engine_importable():
    """create_async_engine should be importable from db.session."""
    from agentco.db.session import create_async_engine  # noqa: F401
    assert create_async_engine is not None
