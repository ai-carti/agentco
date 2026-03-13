"""
Database session management.

Single source of truth for SQLAlchemy engine + session factory.
Use `get_session` as a FastAPI dependency everywhere.
"""
import os
from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import sessionmaker, Session

_DB_URL = os.getenv("AGENTCO_DB_URL", "sqlite:///./agentco.db")

engine = create_engine(
    _DB_URL,
    connect_args={"check_same_thread": False},  # SQLite only
)


@event.listens_for(engine, "connect")
def _set_sqlite_pragmas(dbapi_conn, _record):
    """Enable WAL + foreign keys on every new connection."""
    cursor = dbapi_conn.cursor()
    cursor.execute("PRAGMA journal_mode=WAL;")
    cursor.execute("PRAGMA foreign_keys=ON;")
    cursor.close()


SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)


def get_session() -> Session:
    """FastAPI dependency: yields a DB session, always closes it."""
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
