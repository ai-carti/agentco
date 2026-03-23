"""
M1-003: Agents CRUD (company only) — TDD.

Tests are written first (red), then code makes them green.

Run: uv run pytest tests/test_agents.py -v
"""
import pytest


# ── Helpers ───────────────────────────────────────────────────────────────────

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


def _create_agent(client, token, company_id, name="CEO Agent", role="ceo",
                  system_prompt="You are CEO", model="gpt-4o-mini"):
    return client.post(
        f"/api/companies/{company_id}/agents",
        json={"name": name, "role": role, "system_prompt": system_prompt, "model": model},
        headers=_auth_headers(token),
    )


# ── AC: POST /companies/{company_id}/agents ───────────────────────────────────

def test_create_agent_requires_jwt(auth_client):
    """POST /companies/{company_id}/agents без токена → 401."""
    client, _ = auth_client
    token = _register_and_login(client)
    company_id = _create_company(client, token)

    resp = client.post(
        f"/api/companies/{company_id}/agents",
        json={"name": "Agent X", "role": "worker"},
    )
    assert resp.status_code == 401


def test_create_agent_returns_201(auth_client):
    """POST /companies/{company_id}/agents с JWT → 201."""
    client, _ = auth_client
    token = _register_and_login(client)
    company_id = _create_company(client, token)

    resp = _create_agent(client, token, company_id)
    assert resp.status_code == 201


def test_create_agent_response_schema(auth_client):
    """POST → 201, ответ содержит id, name, role, system_prompt, model, company_id."""
    client, _ = auth_client
    token = _register_and_login(client)
    company_id = _create_company(client, token)

    resp = _create_agent(client, token, company_id,
                         name="CEO", role="ceo",
                         system_prompt="You are CEO", model="gpt-4o-mini")
    assert resp.status_code == 201
    data = resp.json()
    assert "id" in data
    assert data["name"] == "CEO"
    assert data["role"] == "ceo"
    assert data["system_prompt"] == "You are CEO"
    assert data["model"] == "gpt-4o-mini"
    assert data["company_id"] == company_id


def test_create_agent_ownership_check(auth_client):
    """POST /companies/{other_company_id}/agents → 404 если не владелец."""
    client, _ = auth_client
    token_alice = _register_and_login(client, email="alice@example.com")
    token_bob = _register_and_login(client, email="bob@example.com")

    company_id = _create_company(client, token_alice, "Alice Corp")

    # Bob пытается создать агента в компании Alice
    resp = _create_agent(client, token_bob, company_id)
    assert resp.status_code == 404


def test_create_agent_company_not_found(auth_client):
    """POST /companies/unknown/agents → 404."""
    client, _ = auth_client
    token = _register_and_login(client)

    resp = _create_agent(client, token, "nonexistent-company-id")
    assert resp.status_code == 404


# ── AC: GET /companies/{company_id}/agents ────────────────────────────────────

def test_list_agents_requires_jwt(auth_client):
    """GET /companies/{company_id}/agents без токена → 401."""
    client, _ = auth_client
    token = _register_and_login(client)
    company_id = _create_company(client, token)

    resp = client.get(f"/api/companies/{company_id}/agents")
    assert resp.status_code == 401


def test_list_agents_returns_200(auth_client):
    """GET /companies/{company_id}/agents с JWT → 200."""
    client, _ = auth_client
    token = _register_and_login(client)
    company_id = _create_company(client, token)

    resp = client.get(f"/api/companies/{company_id}/agents", headers=_auth_headers(token))
    assert resp.status_code == 200


def test_list_agents_returns_agents(auth_client):
    """GET → список агентов компании."""
    client, _ = auth_client
    token = _register_and_login(client)
    company_id = _create_company(client, token)

    _create_agent(client, token, company_id, name="Agent A")
    _create_agent(client, token, company_id, name="Agent B")

    resp = client.get(f"/api/companies/{company_id}/agents", headers=_auth_headers(token))
    assert resp.status_code == 200
    agents = resp.json()
    names = [a["name"] for a in agents]
    assert "Agent A" in names
    assert "Agent B" in names


def test_list_agents_ownership_check(auth_client):
    """GET /companies/{other_company_id}/agents → 404 если не владелец."""
    client, _ = auth_client
    token_alice = _register_and_login(client, email="alice_l@example.com")
    token_bob = _register_and_login(client, email="bob_l@example.com")

    company_id = _create_company(client, token_alice, "Alice Corp")

    resp = client.get(
        f"/api/companies/{company_id}/agents",
        headers=_auth_headers(token_bob),
    )
    assert resp.status_code == 404


# ── AC: GET /companies/{company_id}/agents/{agent_id} ────────────────────────

def test_get_agent_requires_jwt(auth_client):
    """GET /companies/{cid}/agents/{aid} без токена → 401."""
    client, _ = auth_client
    token = _register_and_login(client)
    company_id = _create_company(client, token)
    resp_create = _create_agent(client, token, company_id)
    agent_id = resp_create.json()["id"]

    resp = client.get(f"/api/companies/{company_id}/agents/{agent_id}")
    assert resp.status_code == 401


def test_get_agent_returns_200(auth_client):
    """GET /companies/{cid}/agents/{aid} с JWT → 200."""
    client, _ = auth_client
    token = _register_and_login(client)
    company_id = _create_company(client, token)
    agent_id = _create_agent(client, token, company_id).json()["id"]

    resp = client.get(
        f"/api/companies/{company_id}/agents/{agent_id}",
        headers=_auth_headers(token),
    )
    assert resp.status_code == 200
    assert resp.json()["id"] == agent_id


def test_get_agent_returns_404_unknown(auth_client):
    """GET /companies/{cid}/agents/unknown → 404."""
    client, _ = auth_client
    token = _register_and_login(client)
    company_id = _create_company(client, token)

    resp = client.get(
        f"/api/companies/{company_id}/agents/nonexistent-agent",
        headers=_auth_headers(token),
    )
    assert resp.status_code == 404


def test_get_agent_ownership_check(auth_client):
    """GET чужого агента → 404."""
    client, _ = auth_client
    token_alice = _register_and_login(client, email="alice_g@example.com")
    token_bob = _register_and_login(client, email="bob_g@example.com")

    company_id = _create_company(client, token_alice, "Alice Corp")
    agent_id = _create_agent(client, token_alice, company_id).json()["id"]

    resp = client.get(
        f"/api/companies/{company_id}/agents/{agent_id}",
        headers=_auth_headers(token_bob),
    )
    assert resp.status_code == 404


# ── AC: PUT /companies/{company_id}/agents/{agent_id} ────────────────────────

def test_update_agent_requires_jwt(auth_client):
    """PUT без токена → 401."""
    client, _ = auth_client
    token = _register_and_login(client)
    company_id = _create_company(client, token)
    agent_id = _create_agent(client, token, company_id).json()["id"]

    resp = client.put(
        f"/api/companies/{company_id}/agents/{agent_id}",
        json={"name": "Updated"},
    )
    assert resp.status_code == 401


def test_update_agent_returns_200(auth_client):
    """PUT с JWT → 200 с обновлённым агентом."""
    client, _ = auth_client
    token = _register_and_login(client)
    company_id = _create_company(client, token)
    agent_id = _create_agent(client, token, company_id, name="Old Name").json()["id"]

    resp = client.put(
        f"/api/companies/{company_id}/agents/{agent_id}",
        json={"name": "New Name", "role": "updated_role", "system_prompt": "New prompt", "model": "gpt-4o"},
        headers=_auth_headers(token),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "New Name"
    assert data["role"] == "updated_role"
    assert data["system_prompt"] == "New prompt"
    assert data["model"] == "gpt-4o"


def test_update_agent_returns_404_unknown(auth_client):
    """PUT /companies/{cid}/agents/unknown → 404."""
    client, _ = auth_client
    token = _register_and_login(client)
    company_id = _create_company(client, token)

    resp = client.put(
        f"/api/companies/{company_id}/agents/nonexistent",
        json={"name": "X"},
        headers=_auth_headers(token),
    )
    assert resp.status_code == 404


def test_update_agent_ownership_check(auth_client):
    """PUT чужого агента → 404."""
    client, _ = auth_client
    token_alice = _register_and_login(client, email="alice_u@example.com")
    token_bob = _register_and_login(client, email="bob_u@example.com")

    company_id = _create_company(client, token_alice, "Alice Corp")
    agent_id = _create_agent(client, token_alice, company_id).json()["id"]

    resp = client.put(
        f"/api/companies/{company_id}/agents/{agent_id}",
        json={"name": "Hacked"},
        headers=_auth_headers(token_bob),
    )
    assert resp.status_code == 404


# ── AC: DELETE /companies/{company_id}/agents/{agent_id} ─────────────────────

def test_delete_agent_requires_jwt(auth_client):
    """DELETE без токена → 401."""
    client, _ = auth_client
    token = _register_and_login(client)
    company_id = _create_company(client, token)
    agent_id = _create_agent(client, token, company_id).json()["id"]

    resp = client.delete(f"/api/companies/{company_id}/agents/{agent_id}")
    assert resp.status_code == 401


def test_delete_agent_returns_204(auth_client):
    """DELETE с JWT → 204."""
    client, _ = auth_client
    token = _register_and_login(client)
    company_id = _create_company(client, token)
    agent_id = _create_agent(client, token, company_id).json()["id"]

    resp = client.delete(
        f"/api/companies/{company_id}/agents/{agent_id}",
        headers=_auth_headers(token),
    )
    assert resp.status_code == 204


def test_delete_agent_actually_deletes(auth_client):
    """После DELETE агент не находится."""
    client, _ = auth_client
    token = _register_and_login(client)
    company_id = _create_company(client, token)
    agent_id = _create_agent(client, token, company_id).json()["id"]

    client.delete(
        f"/api/companies/{company_id}/agents/{agent_id}",
        headers=_auth_headers(token),
    )
    resp = client.get(
        f"/api/companies/{company_id}/agents/{agent_id}",
        headers=_auth_headers(token),
    )
    assert resp.status_code == 404


def test_delete_agent_ownership_check(auth_client):
    """DELETE чужого агента → 404."""
    client, _ = auth_client
    token_alice = _register_and_login(client, email="alice_d@example.com")
    token_bob = _register_and_login(client, email="bob_d@example.com")

    company_id = _create_company(client, token_alice, "Alice Corp")
    agent_id = _create_agent(client, token_alice, company_id).json()["id"]

    resp = client.delete(
        f"/api/companies/{company_id}/agents/{agent_id}",
        headers=_auth_headers(token_bob),
    )
    assert resp.status_code == 404
    # Alice's agent still exists
    resp_check = client.get(
        f"/api/companies/{company_id}/agents/{agent_id}",
        headers=_auth_headers(token_alice),
    )
    assert resp_check.status_code == 200


# ── BUG-005: AgentCreate.name min_length=1 ───────────────────────────────────

def test_create_agent_empty_name_returns_422(auth_client):
    """BUG-005: POST с name="" должен вернуть 422, а не 201."""
    client, _ = auth_client
    token = _register_and_login(client, email="bug005@example.com")
    company_id = _create_company(client, token)

    resp = client.post(
        f"/api/companies/{company_id}/agents",
        json={"name": "", "role": "worker"},
        headers=_auth_headers(token),
    )
    assert resp.status_code == 422


# ── BUG-007: AgentCreate.name whitespace-only ─────────────────────────────────

def test_create_agent_whitespace_name_returns_422(auth_client):
    """BUG-007: POST с name="   " (whitespace-only) должен вернуть 422."""
    client, _ = auth_client
    token = _register_and_login(client, email="bug007@example.com")
    company_id = _create_company(client, token)

    resp = client.post(
        f"/api/companies/{company_id}/agents",
        json={"name": "   ", "role": "worker"},
        headers=_auth_headers(token),
    )
    assert resp.status_code == 422
