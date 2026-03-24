"""
ALEX-TD-174: Missing compound index on run_events(run_id, created_at)
ALEX-TD-175: CredentialService allows duplicate (company_id, provider) pairs

Tests are written first (red), then code makes them green.
"""
import pytest
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from sqlalchemy import event as sa_event

from agentco.orm.base import Base
import agentco.orm.company     # noqa: F401
import agentco.orm.agent       # noqa: F401
import agentco.orm.task        # noqa: F401
import agentco.orm.run         # noqa: F401
import agentco.orm.user        # noqa: F401
import agentco.orm.credential  # noqa: F401
import agentco.orm.agent_library  # noqa: F401
import agentco.orm.mcp_server     # noqa: F401


# ── Helpers ───────────────────────────────────────────────────────────────────

def _make_engine():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @sa_event.listens_for(engine, "connect")
    def set_pragmas(dbapi_conn, _):
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA foreign_keys=ON;")
        cursor.close()

    Base.metadata.create_all(engine)
    return engine


def _make_session(engine):
    Session = sessionmaker(bind=engine, autocommit=False, autoflush=False)
    return Session()


def _register_and_login(client, email="user@example.com", password="pass1234"):
    client.post("/auth/register", json={"email": email, "password": password})
    resp = client.post("/auth/login", json={"email": email, "password": password})
    return resp.json()["access_token"]


def _auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


def _create_company(client, token, name="Test Corp"):
    resp = client.post(
        "/api/companies/",
        json={"name": name},
        headers=_auth_headers(token),
    )
    assert resp.status_code == 201
    return resp.json()["id"]


def _create_credential(client, token, company_id, provider="openai", api_key="sk-test-key"):
    return client.post(
        f"/api/companies/{company_id}/credentials",
        json={"provider": provider, "api_key": api_key},
        headers=_auth_headers(token),
    )


# ── ALEX-TD-174: compound index on run_events(run_id, created_at) ─────────────

class TestALEXTD174RunEventsIndex:
    """
    ALEX-TD-174: list_events queries run_events WHERE run_id = ? ORDER BY created_at.
    Without a compound index (run_id, created_at) SQLite does a filesort on top of
    the run_id lookup — expensive for runs with thousands of events.

    The fix: add Index("ix_run_events_run_created", "run_id", "created_at") to RunEventORM.
    """

    def test_run_events_has_compound_index_run_id_created_at(self):
        """RunEventORM must have a compound index on (run_id, created_at)."""
        engine = _make_engine()
        inspector = inspect(engine)
        indexes = inspector.get_indexes("run_events")

        # Check that there is at least one index covering (run_id, created_at)
        compound_indexes = [
            idx for idx in indexes
            if set(idx["column_names"]) == {"run_id", "created_at"}
        ]
        assert compound_indexes, (
            "run_events table is missing a compound index on (run_id, created_at). "
            "Add Index('ix_run_events_run_created', 'run_id', 'created_at') to RunEventORM. "
            "This avoids filesort when listing events ordered by time for a specific run."
        )

    def test_run_events_compound_index_columns_ordered_correctly(self):
        """The compound index should have run_id as the leading column for optimal lookup."""
        engine = _make_engine()
        inspector = inspect(engine)
        indexes = inspector.get_indexes("run_events")

        compound_indexes = [
            idx for idx in indexes
            if set(idx["column_names"]) == {"run_id", "created_at"}
        ]
        assert compound_indexes, "No compound index on (run_id, created_at) found"

        # Check that run_id is the first column (leading column for WHERE run_id = ?)
        leading_idx = compound_indexes[0]
        assert leading_idx["column_names"][0] == "run_id", (
            f"Compound index columns: {leading_idx['column_names']}. "
            "run_id must be the leading column (first) for efficient WHERE run_id = ? lookups."
        )

    def test_explain_query_uses_index_for_list_events(self):
        """SQLite EXPLAIN QUERY PLAN should NOT show 'SCAN' for run_events with the index."""
        engine = _make_engine()
        with engine.connect() as conn:
            result = conn.execute(text(
                "EXPLAIN QUERY PLAN "
                "SELECT * FROM run_events "
                "WHERE run_id = 'test-run-id' "
                "ORDER BY created_at "
                "LIMIT 100"
            ))
            rows = result.fetchall()
            plan_text = " ".join(str(row) for row in rows).upper()

            # With a compound index on (run_id, created_at), SQLite uses the index
            # for both WHERE and ORDER BY — no full table scan needed.
            assert "SCAN" not in plan_text or "SEARCH" in plan_text, (
                f"Query plan shows full table scan: {plan_text}. "
                "Expected SEARCH (index lookup) when compound index exists."
            )


# ── ALEX-TD-175: duplicate credential prevention ──────────────────────────────

class TestALEXTD175DuplicateCredentials:
    """
    ALEX-TD-175: CredentialService.create() allows multiple credentials with the same
    (company_id, provider) pair. A user can create 10 openai credentials for the same
    company — only the first is ever used by the orchestration layer (it picks first).
    The rest are wasted storage and confusing UX.

    Fix: raise ConflictError in CredentialService.create() if a credential for this
    (company_id, provider) already exists.
    """

    def test_create_duplicate_credential_returns_409(self, auth_client):
        """Second credential for same (company_id, provider) must return 409."""
        client, _ = auth_client
        token = _register_and_login(client)
        company_id = _create_company(client, token)

        # First credential — should succeed
        resp1 = _create_credential(client, token, company_id, provider="openai")
        assert resp1.status_code == 201, f"First create failed: {resp1.json()}"

        # Second credential for the same provider — must fail with 409
        resp2 = _create_credential(client, token, company_id, provider="openai")
        assert resp2.status_code == 409, (
            f"Expected 409 for duplicate credential, got {resp2.status_code}: {resp2.json()}. "
            "CredentialService.create() must check for existing (company_id, provider) pair."
        )

    def test_create_credential_different_providers_allowed(self, auth_client):
        """Different providers for same company should still be allowed."""
        client, _ = auth_client
        token = _register_and_login(client)
        company_id = _create_company(client, token)

        resp1 = _create_credential(client, token, company_id, provider="openai")
        assert resp1.status_code == 201

        resp2 = _create_credential(client, token, company_id, provider="anthropic")
        assert resp2.status_code == 201, (
            f"Different provider should be allowed, got {resp2.status_code}: {resp2.json()}"
        )

    def test_create_credential_same_provider_different_companies_allowed(self, auth_client):
        """Same provider for different companies must still be allowed."""
        client, _ = auth_client
        token = _register_and_login(client)
        company_id_1 = _create_company(client, token, name="Company A")
        company_id_2 = _create_company(client, token, name="Company B")

        resp1 = _create_credential(client, token, company_id_1, provider="openai")
        assert resp1.status_code == 201

        resp2 = _create_credential(client, token, company_id_2, provider="openai")
        assert resp2.status_code == 201, (
            f"Same provider for different company should be allowed, got {resp2.status_code}: {resp2.json()}"
        )

    def test_service_raises_conflict_on_duplicate(self):
        """CredentialService.create() raises ConflictError directly on duplicate."""
        from agentco.services.credential import CredentialService
        from agentco.repositories.base import ConflictError
        import uuid

        engine = _make_engine()
        session = _make_session(engine)

        # Create a user and company manually
        from agentco.orm.user import UserORM
        from agentco.orm.company import CompanyORM

        user = UserORM(id=str(uuid.uuid4()), email="test@test.com", hashed_password="x")
        session.add(user)
        session.flush()

        company = CompanyORM(id=str(uuid.uuid4()), name="Test Corp", owner_id=user.id)
        session.add(company)
        session.commit()

        svc = CredentialService(session)
        svc.create(company.id, "openai", "sk-test", owner_id=user.id)

        with pytest.raises(ConflictError, match="already exists"):
            svc.create(company.id, "openai", "sk-other", owner_id=user.id)
