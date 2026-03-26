"""
Tests for ALEX-TD-248, ALEX-TD-249, ALEX-TD-250:

- ALEX-TD-248: RunEventORM.run_id must NOT have a standalone single-column index
  (ix_run_events_run_id). The compound index ix_run_events_run_created covers all
  WHERE run_id = ? queries.

- ALEX-TD-249: RunService.list_events must use 2 DB lookups (not 3). It should
  validate run ownership in a single query (run + company JOIN) instead of separate
  company_repo.get() + self.get() calls.

- ALEX-TD-250: RunEventORM.agent_id and task_id must have indexes for analytics.
"""
import pytest
from unittest.mock import MagicMock, patch
from sqlalchemy import inspect as sa_inspect, text

from agentco.orm.run import RunEventORM, RunORM
from agentco.repositories.base import NotFoundError


# ─── ALEX-TD-248: no standalone ix_run_events_run_id ─────────────────────────

def test_run_event_run_id_no_standalone_index():
    """ALEX-TD-248: RunEventORM must NOT have index=True on run_id column.
    The compound index ix_run_events_run_created (run_id, created_at) covers it.
    """
    col = RunEventORM.__table__.c["run_id"]
    # Check that there is no standalone single-column index named ix_run_events_run_id
    single_col_run_id_indexes = [
        idx for idx in RunEventORM.__table__.indexes
        if len(list(idx.columns)) == 1
        and "run_id" in [c.name for c in idx.columns]
    ]
    assert not single_col_run_id_indexes, (
        "ALEX-TD-248: RunEventORM.run_id must not have a standalone single-column index. "
        "Remove index=True — the compound ix_run_events_run_created covers it. "
        f"Found: {[idx.name for idx in single_col_run_id_indexes]}"
    )


def test_run_event_compound_index_exists():
    """ALEX-TD-248: compound index ix_run_events_run_created must still exist."""
    index_names = {idx.name for idx in RunEventORM.__table__.indexes}
    assert "ix_run_events_run_created" in index_names, (
        "ALEX-TD-248: compound index ix_run_events_run_created (run_id, created_at) "
        "must still exist after removing the standalone index."
    )


def test_run_event_run_id_in_db_has_no_standalone_index(auth_client):
    """ALEX-TD-248: in the actual DB, ix_run_events_run_id must not exist."""
    _client, engine = auth_client
    inspector = sa_inspect(engine)
    indexes = inspector.get_indexes("run_events")
    standalone_run_id = [
        idx for idx in indexes
        if set(idx.get("column_names", idx.get("columns", []))) == {"run_id"}
    ]
    assert not standalone_run_id, (
        "ALEX-TD-248: ix_run_events_run_id (standalone) should not exist in DB. "
        f"Found: {standalone_run_id}"
    )


# ─── ALEX-TD-249: list_events does 2 lookups, not 3 ─────────────────────────

def test_list_events_uses_get_owned_not_separate_company_and_run_get(auth_client):
    """ALEX-TD-249: RunService.list_events must use RunRepository.get_owned instead
    of calling company_repo.get() + self.get() separately."""
    from agentco.services.run import RunService
    import inspect as _inspect
    src = _inspect.getsource(RunService.list_events)
    # Must NOT call company_repo.get() — that's the extra round trip
    assert "self._company_repo.get(" not in src, (
        "ALEX-TD-249: list_events must not call self._company_repo.get(). "
        "Use self._repo.get_owned(run_id, company_id, owner_id) instead."
    )


def test_run_repository_has_get_owned():
    """ALEX-TD-249: RunRepository must have a get_owned method."""
    from agentco.repositories.run import RunRepository
    assert hasattr(RunRepository, "get_owned"), (
        "ALEX-TD-249: RunRepository must have get_owned(run_id, company_id, owner_id) method."
    )


def _register_and_login(client, email, password="pass1234"):
    client.post("/auth/register", json={"email": email, "password": password})
    token = client.post("/auth/login", json={"email": email, "password": password}).json()["access_token"]
    return token


def _get_owner_id_from_db(engine, company_id: str) -> str:
    """Helper: fetch owner_id for a company directly from the DB."""
    from sqlalchemy.orm import sessionmaker
    from agentco.orm.company import CompanyORM
    Session = sessionmaker(bind=engine)
    with Session() as session:
        row = session.get(CompanyORM, company_id)
        assert row is not None
        return row.owner_id


def test_get_owned_returns_run_when_valid(auth_client):
    """ALEX-TD-249: get_owned returns Run when run exists and belongs to company/owner."""
    client, engine = auth_client

    token = _register_and_login(client, "alex249@test.com")
    headers = {"Authorization": f"Bearer {token}"}

    comp = client.post("/api/companies/", json={"name": "TestCo249"}, headers=headers).json()
    company_id = comp["id"]
    owner_id = _get_owner_id_from_db(engine, company_id)

    run_resp = client.post(f"/api/companies/{company_id}/runs", json={"goal": "test goal 249"}, headers=headers)
    assert run_resp.status_code == 201
    run_id = run_resp.json()["id"]

    # Test get_owned directly via repository
    from sqlalchemy.orm import sessionmaker
    from agentco.repositories.run import RunRepository
    Session = sessionmaker(bind=engine)
    with Session() as session:
        repo = RunRepository(session)
        run = repo.get_owned(run_id, company_id, owner_id)
        assert run is not None
        assert run.id == run_id
        assert run.company_id == company_id


def test_get_owned_raises_not_found_on_wrong_company(auth_client):
    """ALEX-TD-249: get_owned raises NotFoundError when company_id doesn't match."""
    client, engine = auth_client

    token = _register_and_login(client, "alex249b@test.com")
    headers = {"Authorization": f"Bearer {token}"}

    comp = client.post("/api/companies/", json={"name": "TestCo249b"}, headers=headers).json()
    company_id = comp["id"]
    owner_id = _get_owner_id_from_db(engine, company_id)

    run_resp = client.post(f"/api/companies/{company_id}/runs", json={"goal": "test goal 249b"}, headers=headers)
    run_id = run_resp.json()["id"]

    from sqlalchemy.orm import sessionmaker
    from agentco.repositories.run import RunRepository
    Session = sessionmaker(bind=engine)
    with Session() as session:
        repo = RunRepository(session)
        with pytest.raises(NotFoundError):
            repo.get_owned(run_id, "wrong-company-id", owner_id)


def test_get_owned_raises_not_found_on_wrong_owner(auth_client):
    """ALEX-TD-249: get_owned raises NotFoundError when owner_id doesn't match."""
    client, engine = auth_client

    token = _register_and_login(client, "alex249c@test.com")
    headers = {"Authorization": f"Bearer {token}"}

    comp = client.post("/api/companies/", json={"name": "TestCo249c"}, headers=headers).json()
    company_id = comp["id"]

    run_resp = client.post(f"/api/companies/{company_id}/runs", json={"goal": "test goal 249c"}, headers=headers)
    run_id = run_resp.json()["id"]

    from sqlalchemy.orm import sessionmaker
    from agentco.repositories.run import RunRepository
    Session = sessionmaker(bind=engine)
    with Session() as session:
        repo = RunRepository(session)
        with pytest.raises(NotFoundError):
            repo.get_owned(run_id, company_id, "wrong-owner-id")


# ─── ALEX-TD-250: agent_id and task_id indexed ───────────────────────────────

def test_run_event_agent_id_has_index():
    """ALEX-TD-250: RunEventORM.agent_id must have an index."""
    indexed_cols = [
        c.name
        for idx in RunEventORM.__table__.indexes
        for c in idx.columns
    ]
    assert "agent_id" in indexed_cols, (
        "ALEX-TD-250: RunEventORM.agent_id must have index=True for analytics queries."
    )


def test_run_event_task_id_has_index():
    """ALEX-TD-250: RunEventORM.task_id must have an index."""
    indexed_cols = [
        c.name
        for idx in RunEventORM.__table__.indexes
        for c in idx.columns
    ]
    assert "task_id" in indexed_cols, (
        "ALEX-TD-250: RunEventORM.task_id must have index=True for analytics queries."
    )


def test_run_event_agent_id_in_db_has_index(auth_client):
    """ALEX-TD-250: in the actual DB, agent_id must be indexed."""
    _client, engine = auth_client
    inspector = sa_inspect(engine)
    indexes = inspector.get_indexes("run_events")
    indexed_cols = [col for idx in indexes for col in idx.get("column_names", idx.get("columns", []))]
    assert "agent_id" in indexed_cols, (
        f"ALEX-TD-250: run_events.agent_id must be indexed in DB. Indexes: {indexes}"
    )


def test_run_event_task_id_in_db_has_index(auth_client):
    """ALEX-TD-250: in the actual DB, task_id must be indexed."""
    _client, engine = auth_client
    inspector = sa_inspect(engine)
    indexes = inspector.get_indexes("run_events")
    indexed_cols = [col for idx in indexes for col in idx.get("column_names", idx.get("columns", []))]
    assert "task_id" in indexed_cols, (
        f"ALEX-TD-250: run_events.task_id must be indexed in DB. Indexes: {indexes}"
    )
