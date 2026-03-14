"""
Shared test fixtures.

auth_client: isolated FastAPI TestClient with fresh in-memory SQLite DB.
"""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from agentco.main import app
from agentco.orm.base import Base
# Import all ORM models so Base.metadata knows about them
import agentco.orm.company     # noqa: F401
import agentco.orm.agent       # noqa: F401
import agentco.orm.task        # noqa: F401
import agentco.orm.run         # noqa: F401
import agentco.orm.user        # noqa: F401
import agentco.orm.credential  # noqa: F401
from agentco.db.session import get_session


def _make_test_engine():
    # StaticPool: all sessions share one in-memory connection → tables persist
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @event.listens_for(engine, "connect")
    def set_pragmas(dbapi_conn, _):
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA foreign_keys=ON;")
        cursor.close()

    Base.metadata.create_all(engine)
    return engine


@pytest.fixture
def auth_client():
    """TestClient with isolated in-memory DB per test."""
    engine = _make_test_engine()
    TestingSessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)

    def override_get_session():
        session = TestingSessionLocal()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_session] = override_get_session
    with TestClient(app) as client:
        yield client, engine
    app.dependency_overrides.pop(get_session, None)
