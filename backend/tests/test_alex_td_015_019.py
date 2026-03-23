"""
Tests for ALEX-TD-015 through ALEX-TD-019.

ALEX-TD-015: GET /runs?status=running filter
ALEX-TD-016: datetime.utcnow() removed (no warnings from models)
ALEX-TD-017: AgentUpdate.name whitespace validation
ALEX-TD-018: CredentialCreate.provider validation
ALEX-TD-019: GET /runs?offset=-1 → 422
"""
import pytest
from sqlalchemy.orm import Session
from agentco.db.session import SessionLocal


# ── Helpers ───────────────────────────────────────────────────────────────────

def _register_and_login(client, email="tduser@example.com", password="pass1234"):
    client.post("/auth/register", json={"email": email, "password": password})
    resp = client.post("/auth/login", json={"email": email, "password": password})
    return resp.json()["access_token"]


def _auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


def _create_company(client, token, name="TD Corp"):
    resp = client.post("/api/companies/", json={"name": name}, headers=_auth_headers(token))
    assert resp.status_code == 201
    return resp.json()["id"]


def _create_agent(client, token, company_id, name="TDAgent"):
    resp = client.post(
        f"/api/companies/{company_id}/agents",
        json={"name": name, "model": "gpt-4o-mini"},
        headers=_auth_headers(token),
    )
    assert resp.status_code == 201
    return resp.json()["id"]


# ── ALEX-TD-015: status filter ────────────────────────────────────────────────

def test_list_runs_status_filter_running(auth_client):
    """GET /api/companies/{id}/runs?status=running returns only running runs."""
    from agentco.orm.run import RunORM
    import uuid

    client, engine = auth_client
    token = _register_and_login(client, "td015@example.com")
    company_id = _create_company(client, token, "TD015 Corp")

    # Seed two runs directly in DB
    from sqlalchemy.orm import sessionmaker
    Session = sessionmaker(bind=engine)
    with Session() as session:
        run_running = RunORM(
            id=str(uuid.uuid4()), company_id=company_id, status="running", goal="r"
        )
        run_stopped = RunORM(
            id=str(uuid.uuid4()), company_id=company_id, status="stopped", goal="s"
        )
        session.add_all([run_running, run_stopped])
        session.commit()
        running_id = run_running.id
        stopped_id = run_stopped.id

    resp = client.get(
        f"/api/companies/{company_id}/runs?status=running",
        headers=_auth_headers(token),
    )
    assert resp.status_code == 200
    ids = [r["id"] for r in resp.json()]
    assert running_id in ids
    assert stopped_id not in ids
    for r in resp.json():
        assert r["status"] == "running"


def test_list_runs_no_status_filter_returns_all(auth_client):
    """GET /api/companies/{id}/runs (no filter) returns runs of all statuses."""
    from agentco.orm.run import RunORM
    import uuid
    from sqlalchemy.orm import sessionmaker

    client, engine = auth_client
    token = _register_and_login(client, "td015b@example.com")
    company_id = _create_company(client, token, "TD015B Corp")

    Session = sessionmaker(bind=engine)
    with Session() as session:
        session.add(RunORM(id=str(uuid.uuid4()), company_id=company_id, status="pending", goal="p"))
        session.add(RunORM(id=str(uuid.uuid4()), company_id=company_id, status="done", goal="d"))
        session.commit()

    resp = client.get(f"/api/companies/{company_id}/runs", headers=_auth_headers(token))
    assert resp.status_code == 200
    statuses = {r["status"] for r in resp.json()}
    assert "pending" in statuses
    assert "done" in statuses


# ── ALEX-TD-016: no utcnow deprecation ───────────────────────────────────────

def test_company_model_created_at_no_utcnow_warning():
    """Company model default created_at uses timezone-aware path, no utcnow DeprecationWarning."""
    import warnings
    from agentco.models.company import Company
    with warnings.catch_warnings(record=True) as w:
        warnings.simplefilter("always")
        c = Company(name="Test", owner_id="u1")
        assert c.created_at is not None
        dep_warnings = [x for x in w if issubclass(x.category, DeprecationWarning)
                        and "utcnow" in str(x.message)]
        assert len(dep_warnings) == 0, f"Got utcnow warnings: {dep_warnings}"


def test_credential_model_created_at_no_utcnow_warning():
    """Credential model default created_at has no utcnow DeprecationWarning."""
    import warnings
    from agentco.models.credential import Credential
    with warnings.catch_warnings(record=True) as w:
        warnings.simplefilter("always")
        cr = Credential(company_id="c1", provider="openai", encrypted_api_key="x")
        assert cr.created_at is not None
        dep_warnings = [x for x in w if issubclass(x.category, DeprecationWarning)
                        and "utcnow" in str(x.message)]
        assert len(dep_warnings) == 0


# ── ALEX-TD-017: AgentUpdate name whitespace ──────────────────────────────────

def test_update_agent_whitespace_name_returns_422(auth_client):
    """PUT /api/companies/{id}/agents/{aid} with whitespace name → 422."""
    client, _ = auth_client
    token = _register_and_login(client, "td017@example.com")
    company_id = _create_company(client, token, "TD017 Corp")
    agent_id = _create_agent(client, token, company_id, "ValidAgent")

    resp = client.put(
        f"/api/companies/{company_id}/agents/{agent_id}",
        json={"name": "   "},
        headers=_auth_headers(token),
    )
    assert resp.status_code == 422


def test_update_agent_empty_name_returns_422(auth_client):
    """PUT /api/companies/{id}/agents/{aid} with empty string name → 422."""
    client, _ = auth_client
    token = _register_and_login(client, "td017b@example.com")
    company_id = _create_company(client, token, "TD017B Corp")
    agent_id = _create_agent(client, token, company_id, "AgentForUpdate")

    resp = client.put(
        f"/api/companies/{company_id}/agents/{agent_id}",
        json={"name": ""},
        headers=_auth_headers(token),
    )
    assert resp.status_code == 422


def test_update_agent_valid_name_succeeds(auth_client):
    """PUT /api/companies/{id}/agents/{aid} with valid name → 200."""
    client, _ = auth_client
    token = _register_and_login(client, "td017c@example.com")
    company_id = _create_company(client, token, "TD017C Corp")
    agent_id = _create_agent(client, token, company_id, "OldName")

    resp = client.put(
        f"/api/companies/{company_id}/agents/{agent_id}",
        json={"name": "NewName"},
        headers=_auth_headers(token),
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "NewName"


# ── ALEX-TD-018: CredentialCreate provider validation ─────────────────────────

def test_create_credential_unknown_provider_returns_422(auth_client):
    """POST /api/companies/{id}/credentials with unknown provider → 422."""
    client, _ = auth_client
    token = _register_and_login(client, "td018@example.com")
    company_id = _create_company(client, token, "TD018 Corp")

    resp = client.post(
        f"/api/companies/{company_id}/credentials",
        json={"provider": "badprovider", "api_key": "sk-test"},
        headers=_auth_headers(token),
    )
    assert resp.status_code == 422


def test_create_credential_known_provider_accepted(auth_client):
    """POST /api/companies/{id}/credentials with valid provider → 201."""
    client, _ = auth_client
    token = _register_and_login(client, "td018b@example.com")
    company_id = _create_company(client, token, "TD018B Corp")

    resp = client.post(
        f"/api/companies/{company_id}/credentials",
        json={"provider": "openai", "api_key": "sk-test-key"},
        headers=_auth_headers(token),
    )
    assert resp.status_code == 201
    assert resp.json()["provider"] == "openai"


def test_create_credential_case_insensitive_provider(auth_client):
    """POST /api/companies/{id}/credentials with uppercase provider is normalized."""
    client, _ = auth_client
    token = _register_and_login(client, "td018c@example.com")
    company_id = _create_company(client, token, "TD018C Corp")

    resp = client.post(
        f"/api/companies/{company_id}/credentials",
        json={"provider": "Anthropic", "api_key": "sk-ant-test"},
        headers=_auth_headers(token),
    )
    assert resp.status_code == 201
    assert resp.json()["provider"] == "anthropic"


# ── ALEX-TD-019: offset ge=0 ──────────────────────────────────────────────────

def test_list_runs_negative_offset_returns_422(auth_client):
    """GET /api/companies/{id}/runs?offset=-1 → 422."""
    client, _ = auth_client
    token = _register_and_login(client, "td019@example.com")
    company_id = _create_company(client, token, "TD019 Corp")

    resp = client.get(
        f"/api/companies/{company_id}/runs?offset=-1",
        headers=_auth_headers(token),
    )
    assert resp.status_code == 422
