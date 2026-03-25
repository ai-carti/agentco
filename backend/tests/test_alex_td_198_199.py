"""
Tests for ALEX-TD-198 and ALEX-TD-199.

ALEX-TD-198: /health and /api/health endpoints must be rate-limited (120/minute).
ALEX-TD-199: RunRepository.list_by_company and list_by_task must use NULLS LAST ordering.
"""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from agentco.main import app
from agentco.core.rate_limiting import limiter
from agentco.orm.base import Base
import agentco.orm.company     # noqa: F401
import agentco.orm.agent       # noqa: F401
import agentco.orm.task        # noqa: F401
import agentco.orm.run         # noqa: F401
import agentco.orm.user        # noqa: F401
import agentco.orm.credential  # noqa: F401
import agentco.orm.agent_library  # noqa: F401
import agentco.orm.mcp_server     # noqa: F401
from agentco.db.session import get_session


# ---------------------------------------------------------------------------
# ALEX-TD-198: Health endpoint rate limiting
# ---------------------------------------------------------------------------

@pytest.fixture
def plain_client():
    """TestClient with fresh in-memory SQLite DB."""
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)

    def override_get_session():
        with Session() as session:
            yield session

    app.dependency_overrides[get_session] = override_get_session
    limiter._storage.reset()
    client = TestClient(app, raise_server_exceptions=True)
    yield client
    app.dependency_overrides.pop(get_session, None)
    limiter._storage.reset()


class TestAlexTd198HealthRateLimited:
    """ALEX-TD-198: /health and /api/health must enforce 120/minute rate limit."""

    def test_health_root_rate_limited_on_121st_request(self, plain_client):
        """First 120 requests to /health succeed, 121st → 429."""
        limiter._storage.reset()
        responses = []
        for _ in range(121):
            r = plain_client.get("/health")
            responses.append(r.status_code)

        non_429 = [s for s in responses[:120] if s != 429]
        assert len(non_429) == 120, f"Expected 120 non-429 for /health, got: {responses[:125]}"
        assert responses[120] == 429, f"Expected 429 on 121st /health, got: {responses[120]}"

    def test_api_health_rate_limited_on_121st_request(self, plain_client):
        """First 120 requests to /api/health succeed, 121st → 429."""
        limiter._storage.reset()
        responses = []
        for _ in range(121):
            r = plain_client.get("/api/health")
            responses.append(r.status_code)

        non_429 = [s for s in responses[:120] if s != 429]
        assert len(non_429) == 120, f"Expected 120 non-429 for /api/health, got: {responses[:125]}"
        assert responses[120] == 429, f"Expected 429 on 121st /api/health, got: {responses[120]}"

    def test_health_429_body(self, plain_client):
        """429 body has correct structure."""
        limiter._storage.reset()
        for _ in range(120):
            plain_client.get("/health")
        r = plain_client.get("/health")
        assert r.status_code == 429
        body = r.json()
        assert body.get("error") == "rate_limit_exceeded"
        assert "retry_after" in body

    def test_api_health_429_body(self, plain_client):
        """429 body has correct structure for /api/health."""
        limiter._storage.reset()
        for _ in range(120):
            plain_client.get("/api/health")
        r = plain_client.get("/api/health")
        assert r.status_code == 429
        body = r.json()
        assert body.get("error") == "rate_limit_exceeded"
        assert "retry_after" in body


# ---------------------------------------------------------------------------
# ALEX-TD-199: ORDER BY started_at DESC NULLS LAST
# ---------------------------------------------------------------------------

class TestAlexTd199NullsLastOrdering:
    """ALEX-TD-199: list_by_company and list_by_task must place NULL started_at last."""

    @pytest.fixture
    def run_repo_session(self):
        """Create isolated in-memory DB and return (session, RunRepository)."""
        from agentco.repositories.run import RunRepository

        engine = create_engine(
            "sqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(engine)
        Session = sessionmaker(bind=engine)
        session = Session()
        repo = RunRepository(session)
        yield session, repo
        session.close()

    def _insert_run_orm(self, session, company_id, task_id, started_at, run_id=None):
        """Insert a RunORM directly with potentially NULL started_at."""
        import uuid
        from datetime import timezone
        from agentco.orm.run import RunORM

        run = RunORM(
            id=run_id or str(uuid.uuid4()),
            company_id=company_id,
            goal="test goal",
            task_id=task_id,
            agent_id=None,
            status="pending",
            started_at=started_at,
        )
        session.add(run)
        session.commit()
        return run.id

    def test_list_by_company_nulls_last(self, run_repo_session):
        """Runs with NULL started_at appear after runs with a timestamp."""
        from datetime import datetime, timezone
        session, repo = run_repo_session
        company_id = "co-nulls-test"
        task_id = "task-nulls-test"

        ts = datetime(2024, 1, 15, 12, 0, 0, tzinfo=timezone.utc)
        id_with_date = self._insert_run_orm(session, company_id, task_id, started_at=ts)
        id_null = self._insert_run_orm(session, company_id, task_id, started_at=None)

        runs = repo.list_by_company(company_id)
        ids = [r.id for r in runs]

        assert ids[0] == id_with_date, (
            f"Run with started_at should come first (NULLS LAST), got order: {ids}"
        )
        assert ids[-1] == id_null, (
            f"Run with NULL started_at should be last, got order: {ids}"
        )

    def test_list_by_task_nulls_last(self, run_repo_session):
        """Runs with NULL started_at appear after runs with a timestamp in list_by_task."""
        from datetime import datetime, timezone
        session, repo = run_repo_session
        company_id = "co-task-nulls"
        task_id = "task-nulls-test-2"

        ts = datetime(2024, 3, 10, 9, 0, 0, tzinfo=timezone.utc)
        id_with_date = self._insert_run_orm(session, company_id, task_id, started_at=ts)
        id_null = self._insert_run_orm(session, company_id, task_id, started_at=None)

        runs = repo.list_by_task(task_id)
        ids = [r.id for r in runs]

        assert ids[0] == id_with_date, (
            f"Run with started_at should come first (NULLS LAST), got order: {ids}"
        )
        assert ids[-1] == id_null, (
            f"Run with NULL started_at should be last, got order: {ids}"
        )

    def test_list_by_company_multiple_nulls(self, run_repo_session):
        """Multiple NULL started_at runs appear after dated ones; order among nulls is stable by created_at."""
        from datetime import datetime, timezone
        session, repo = run_repo_session
        company_id = "co-multi-null"
        task_id = "task-multi-null"

        ts1 = datetime(2024, 5, 1, tzinfo=timezone.utc)
        ts2 = datetime(2024, 5, 2, tzinfo=timezone.utc)
        id1 = self._insert_run_orm(session, company_id, task_id, started_at=ts2)
        id2 = self._insert_run_orm(session, company_id, task_id, started_at=ts1)
        id_null1 = self._insert_run_orm(session, company_id, task_id, started_at=None)
        id_null2 = self._insert_run_orm(session, company_id, task_id, started_at=None)

        runs = repo.list_by_company(company_id)
        ids = [r.id for r in runs]

        # Dated runs first (newest first), then nulls
        assert ids[0] == id1, f"Newest dated run should be first: {ids}"
        assert ids[1] == id2, f"Older dated run should be second: {ids}"
        null_ids = set(ids[2:])
        assert null_ids == {id_null1, id_null2}, f"Null runs should be at end: {ids}"
