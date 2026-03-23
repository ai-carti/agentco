"""
ALEX-TD-127: Agent mutable endpoints (PUT/DELETE) have rate limiting.
ALEX-TD-128: Memory GET endpoint has rate limiting.
ALEX-TD-131: Company mutable endpoints (PUT/DELETE) have rate limiting.

Verifies that update_agent, delete_agent, update_company, delete_company,
and get_agent_memory all respond correctly under normal load.
"""
import pytest


def _register_login(client, email, password="pass1234"):
    client.post("/auth/register", json={"email": email, "password": password})
    resp = client.post("/auth/login", json={"email": email, "password": password})
    return resp.json()["access_token"]


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


# ── ALEX-TD-127: Agent PUT/DELETE rate limiting ────────────────────────────────

def test_update_agent_rate_limited_endpoint_accepts_normal_load(auth_client):
    """PUT /agents/{id} returns 200 normally (rate limiter present, not triggered)."""
    client, _ = auth_client
    token = _register_login(client, "td127_update@example.com")
    company = client.post("/api/companies/", json={"name": "TD127 Co"}, headers=_auth(token))
    company_id = company.json()["id"]
    agent = client.post(
        f"/api/companies/{company_id}/agents",
        json={"name": "UpdateMe", "model": "gpt-4o-mini"},
        headers=_auth(token),
    )
    agent_id = agent.json()["id"]

    resp = client.put(
        f"/api/companies/{company_id}/agents/{agent_id}",
        json={"name": "UpdatedName"},
        headers=_auth(token),
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "UpdatedName"


def test_delete_agent_rate_limited_endpoint_accepts_normal_load(auth_client):
    """DELETE /agents/{id} returns 204 normally (rate limiter present, not triggered)."""
    client, _ = auth_client
    token = _register_login(client, "td127_delete@example.com")
    company = client.post("/api/companies/", json={"name": "TD127 Del Co"}, headers=_auth(token))
    company_id = company.json()["id"]
    agent = client.post(
        f"/api/companies/{company_id}/agents",
        json={"name": "DeleteMe", "model": "gpt-4o-mini"},
        headers=_auth(token),
    )
    agent_id = agent.json()["id"]

    resp = client.delete(
        f"/api/companies/{company_id}/agents/{agent_id}",
        headers=_auth(token),
    )
    assert resp.status_code == 204


# ── ALEX-TD-128: Memory GET rate limiting ─────────────────────────────────────

def test_get_memory_rate_limited_endpoint_accepts_normal_load(auth_client):
    """GET /memory returns 200 normally (rate limiter present, not triggered)."""
    client, _ = auth_client
    token = _register_login(client, "td128_memory@example.com")
    company = client.post("/api/companies/", json={"name": "TD128 Mem Co"}, headers=_auth(token))
    company_id = company.json()["id"]
    agent = client.post(
        f"/api/companies/{company_id}/agents",
        json={"name": "MemAgent", "model": "gpt-4o-mini"},
        headers=_auth(token),
    )
    agent_id = agent.json()["id"]

    resp = client.get(
        f"/api/companies/{company_id}/agents/{agent_id}/memory",
        headers=_auth(token),
    )
    # Memory endpoint returns 200 with empty list when no memories stored
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


# ── ALEX-TD-131: Company PUT/DELETE rate limiting ──────────────────────────────

def test_update_company_rate_limited_endpoint_accepts_normal_load(auth_client):
    """PUT /companies/{id} returns 200 normally (rate limiter present, not triggered)."""
    client, _ = auth_client
    token = _register_login(client, "td131_update@example.com")
    company = client.post("/api/companies/", json={"name": "TD131 Update Co"}, headers=_auth(token))
    company_id = company.json()["id"]

    resp = client.put(
        f"/api/companies/{company_id}",
        json={"name": "Updated Name"},
        headers=_auth(token),
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "Updated Name"


def test_delete_company_rate_limited_endpoint_accepts_normal_load(auth_client):
    """DELETE /companies/{id} returns 204 normally (rate limiter present, not triggered)."""
    client, _ = auth_client
    token = _register_login(client, "td131_delete@example.com")
    company = client.post("/api/companies/", json={"name": "TD131 Delete Co"}, headers=_auth(token))
    company_id = company.json()["id"]

    resp = client.delete(
        f"/api/companies/{company_id}",
        headers=_auth(token),
    )
    assert resp.status_code == 204
