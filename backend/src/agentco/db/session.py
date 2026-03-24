"""
Database session management.

Single source of truth for SQLAlchemy engine + session factory.
Use `get_session` as a FastAPI dependency everywhere.

DATABASE_URL resolution (ALEX-POST-001):
  1. DATABASE_URL env var (new, standard)
  2. AGENTCO_DB_URL env var (legacy, kept for backward compat)
  3. Fallback: sqlite:///./agentco.db

Postgres support is optional (extras: [postgres]):
  - postgresql:// or postgres:// → synchronous psycopg2 engine (sync path)
  - postgresql:// or postgres:// → async asyncpg engine (async path, ALEX-POST-010)
  - sqlite://  → SQLite engine with WAL + foreign keys pragmas

Async engine (ALEX-POST-010):
  - _make_async_engine() creates an async engine for Postgres
  - get_async_session() is an async FastAPI dependency
  - AsyncSession re-exported for type hints
  - install sqlalchemy[asyncio] + asyncpg via extras [async]
"""
import logging
import os
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, Session

_log = logging.getLogger(__name__)

# Async SQLAlchemy imports — only available with sqlalchemy[asyncio] + asyncpg
from sqlalchemy.ext.asyncio import (
    create_async_engine,
    AsyncSession,
    async_sessionmaker,
)

_SQLITE_DEFAULT = "sqlite:///./agentco.db"


def _resolve_db_url() -> str:
    """Return effective DB URL, reading env at call-time.

    Priority: DATABASE_URL > AGENTCO_DB_URL > sqlite default.
    """
    return (
        os.environ.get("DATABASE_URL")
        or os.environ.get("AGENTCO_DB_URL")
        or _SQLITE_DEFAULT
    )


def _is_postgres(url: str) -> bool:
    return url.startswith("postgresql://") or url.startswith("postgres://")


def _to_async_url(url: str) -> str:
    """Convert a DB URL to its asyncpg variant for async SQLAlchemy.

    postgresql:// → postgresql+asyncpg://
    postgres://    → postgresql+asyncpg://
    sqlite://      → unchanged (no async driver swap needed)
    """
    if url.startswith("postgresql://"):
        return "postgresql+asyncpg://" + url[len("postgresql://"):]
    if url.startswith("postgres://"):
        return "postgresql+asyncpg://" + url[len("postgres://"):]
    return url


def _make_engine(url: str):
    """Create a synchronous SQLAlchemy engine for the given URL.

    For SQLite: enables WAL + foreign keys on every connection.
    For Postgres: plain create_engine (psycopg2-binary must be installed
    from optional extras [postgres]).
    """
    if _is_postgres(url):
        # Postgres: no SQLite-specific connect_args
        return create_engine(url)

    # SQLite path
    engine = create_engine(
        url,
        connect_args={"check_same_thread": False},
    )

    @event.listens_for(engine, "connect")
    def _set_sqlite_pragmas(dbapi_conn, _record):
        """Enable WAL + foreign keys on every new connection."""
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA journal_mode=WAL;")
        cursor.execute("PRAGMA foreign_keys=ON;")
        cursor.close()

    return engine


def _make_async_engine(url: str):
    """Create an async SQLAlchemy engine for Postgres URLs (ALEX-POST-010).

    Automatically converts postgresql:// → postgresql+asyncpg://.
    Requires: sqlalchemy[asyncio] + asyncpg (extras [async]).

    For non-Postgres URLs, raises ValueError — use _make_engine for SQLite.
    """
    async_url = _to_async_url(url)
    return create_async_engine(async_url, echo=False)


# ---------------------------------------------------------------------------
# Module-level sync engine: reads env at import time.
# Tests that need isolation should override get_session via dependency injection.
# ---------------------------------------------------------------------------
_DB_URL = _resolve_db_url()
engine = _make_engine(_DB_URL)

SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)


def get_session() -> Session:
    """FastAPI dependency: yields a DB session, always closes it."""
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


# ---------------------------------------------------------------------------
# Async engine + session factory (ALEX-POST-010)
# Only initialised when DATABASE_URL is Postgres.
# For SQLite deployments, async_engine stays None and get_async_session
# falls back gracefully to a sync-like stub so imports don't break.
# ---------------------------------------------------------------------------
_async_engine = None
_AsyncSessionLocal = None

if _is_postgres(_DB_URL):
    try:
        _async_engine = _make_async_engine(_DB_URL)
        _AsyncSessionLocal = async_sessionmaker(
            _async_engine, class_=AsyncSession, expire_on_commit=False
        )
    except Exception as e:
        # asyncpg not installed — async engine unavailable
        _log.debug("async engine unavailable: %s", e)


async def get_async_session():
    """FastAPI async dependency: yields an AsyncSession.

    Use this instead of get_session for async endpoints when DATABASE_URL
    points to PostgreSQL. For SQLite, continue using get_session.
    """
    if _AsyncSessionLocal is None:
        raise RuntimeError(
            "Async session not available. "
            "DATABASE_URL must be a Postgres URL and "
            "sqlalchemy[asyncio] + asyncpg must be installed ([async] extra)."
        )
    async with _AsyncSessionLocal() as session:
        yield session
