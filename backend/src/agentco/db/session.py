"""
Database session management.

Single source of truth for SQLAlchemy engine + session factory.
Use `get_session` as a FastAPI dependency everywhere.

DATABASE_URL resolution (ALEX-POST-001):
  1. DATABASE_URL env var (new, standard)
  2. AGENTCO_DB_URL env var (legacy, kept for backward compat)
  3. Fallback: sqlite:///./agentco.db

Postgres support is optional (extras: [postgres]):
  - postgresql:// or postgres:// → synchronous psycopg2 engine
  - sqlite://  → SQLite engine with WAL + foreign keys pragmas
"""
import os
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, Session

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


def _make_engine(url: str):
    """Create a SQLAlchemy engine for the given URL.

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


# Module-level engine: reads env at import time.
# Tests that need isolation should override get_session via dependency injection.
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
