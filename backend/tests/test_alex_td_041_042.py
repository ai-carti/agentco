"""
Tests for ALEX-TD-041 and ALEX-TD-042.

ALEX-TD-041: list_agents and list_tasks support pagination (limit/offset)
ALEX-TD-042: list_mcp_servers supports pagination (limit/offset)
"""
import pytest
from fastapi.testclient import TestClient


# ── Helpers ───────────────────────────────────────────────────────────────────

def _register_and_login(client, email, password="pass1234"):
    client.post("/auth/register", json={"email": email, "password": password})
    resp = client.post("/auth/login", json={"email": email, "password": password})
    return resp.json()["access_token"]


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _create_company(client, token, name="Test Co"):
    resp = client.post("/api/companies/", json={"name": name}, headers=_auth(token))
    assert resp.status_code == 201
    return resp.json()["id"]


def _create_agent(client, token, company_id, name="Agent"):
    resp = client.post(
        f"/api/companies/{company_id}/agents",
        json={"name": name, "model": "gpt-4o-mini"},
        headers=_auth(token),
    )
    assert resp.status_code == 201
    return resp.json()["id"]


def _create_task(client, token, company_id, agent_id, title="Task"):
    resp = client.post(
        f"/api/companies/{company_id}/agents/{agent_id}/tasks",
        json={"title": title},
        headers=_auth(token),
    )
    assert resp.status_code == 201
    return resp.json()["id"]


def _create_mcp_server(client, token, company_id, agent_id, name):
    resp = client.post(
        f"/api/companies/{company_id}/agents/{agent_id}/mcp-servers",
        json={"name": name, "server_url": f"http://{name}.local", "transport": "sse"},
        headers=_auth(token),
    )
    assert resp.status_code == 201
    return resp.json()["id"]


# ══════════════════════════════════════════════════════════════════════════════
# ALEX-TD-041: list_agents pagination
# ══════════════════════════════════════════════════════════════════════════════

def test_list_agents_default_limit(auth_client):
    """GET /agents без параметров → 200 (default limit=50)."""
    client, _ = auth_client
    token = _register_and_login(client, "ag041_01@example.com")
    company_id = _create_company(client, token, "Agents Co 1")

    resp = client.get(
        f"/api/companies/{company_id}/agents",
        headers=_auth(token),
    )
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


def test_list_agents_with_limit_param(auth_client):
    """GET /agents?limit=2 возвращает не больше 2 агентов."""
    client, _ = auth_client
    token = _register_and_login(client, "ag041_02@example.com")
    company_id = _create_company(client, token, "Agents Co 2")

    for i in range(5):
        _create_agent(client, token, company_id, f"Agent-{i}")

    resp = client.get(
        f"/api/companies/{company_id}/agents",
        params={"limit": 2},
        headers=_auth(token),
    )
    assert resp.status_code == 200
    assert len(resp.json()) <= 2


def test_list_agents_with_offset(auth_client):
    """GET /agents?limit=2&offset=2 возвращает следующую страницу."""
    client, _ = auth_client
    token = _register_and_login(client, "ag041_03@example.com")
    company_id = _create_company(client, token, "Agents Co 3")

    for i in range(5):
        _create_agent(client, token, company_id, f"Agent-{i}")

    page1 = client.get(
        f"/api/companies/{company_id}/agents",
        params={"limit": 2, "offset": 0},
        headers=_auth(token),
    ).json()
    page2 = client.get(
        f"/api/companies/{company_id}/agents",
        params={"limit": 2, "offset": 2},
        headers=_auth(token),
    ).json()

    ids_p1 = {a["id"] for a in page1}
    ids_p2 = {a["id"] for a in page2}
    assert ids_p1.isdisjoint(ids_p2), "Страницы не должны пересекаться"


def test_list_agents_large_offset_returns_empty(auth_client):
    """GET /agents?offset=99999 → пустой список."""
    client, _ = auth_client
    token = _register_and_login(client, "ag041_04@example.com")
    company_id = _create_company(client, token, "Agents Co 4")
    _create_agent(client, token, company_id, "Solo Agent")

    resp = client.get(
        f"/api/companies/{company_id}/agents",
        params={"limit": 10, "offset": 99999},
        headers=_auth(token),
    )
    assert resp.status_code == 200
    assert resp.json() == []


def test_list_agents_invalid_limit_rejected(auth_client):
    """GET /agents?limit=0 → 422."""
    client, _ = auth_client
    token = _register_and_login(client, "ag041_05@example.com")
    company_id = _create_company(client, token, "Agents Co 5")

    resp = client.get(
        f"/api/companies/{company_id}/agents",
        params={"limit": 0},
        headers=_auth(token),
    )
    assert resp.status_code == 422


def test_list_agents_over_max_limit_rejected(auth_client):
    """GET /agents?limit=9999 → 422 (max=500)."""
    client, _ = auth_client
    token = _register_and_login(client, "ag041_06@example.com")
    company_id = _create_company(client, token, "Agents Co 6")

    resp = client.get(
        f"/api/companies/{company_id}/agents",
        params={"limit": 9999},
        headers=_auth(token),
    )
    assert resp.status_code == 422


# ══════════════════════════════════════════════════════════════════════════════
# ALEX-TD-041: list_tasks pagination
# ══════════════════════════════════════════════════════════════════════════════

def test_list_tasks_default_limit(auth_client):
    """GET /tasks без параметров → 200."""
    client, _ = auth_client
    token = _register_and_login(client, "tk041_01@example.com")
    company_id = _create_company(client, token, "Tasks Co 1")
    agent_id = _create_agent(client, token, company_id)

    resp = client.get(
        f"/api/companies/{company_id}/agents/{agent_id}/tasks",
        headers=_auth(token),
    )
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


def test_list_tasks_with_limit_param(auth_client):
    """GET /tasks?limit=2 возвращает не больше 2 задач."""
    client, _ = auth_client
    token = _register_and_login(client, "tk041_02@example.com")
    company_id = _create_company(client, token, "Tasks Co 2")
    agent_id = _create_agent(client, token, company_id)

    for i in range(5):
        _create_task(client, token, company_id, agent_id, f"Task-{i}")

    resp = client.get(
        f"/api/companies/{company_id}/agents/{agent_id}/tasks",
        params={"limit": 2},
        headers=_auth(token),
    )
    assert resp.status_code == 200
    assert len(resp.json()) <= 2


def test_list_tasks_with_offset(auth_client):
    """GET /tasks?limit=2&offset=2 возвращает следующую страницу."""
    client, _ = auth_client
    token = _register_and_login(client, "tk041_03@example.com")
    company_id = _create_company(client, token, "Tasks Co 3")
    agent_id = _create_agent(client, token, company_id)

    for i in range(5):
        _create_task(client, token, company_id, agent_id, f"Task-{i}")

    page1 = client.get(
        f"/api/companies/{company_id}/agents/{agent_id}/tasks",
        params={"limit": 2, "offset": 0},
        headers=_auth(token),
    ).json()
    page2 = client.get(
        f"/api/companies/{company_id}/agents/{agent_id}/tasks",
        params={"limit": 2, "offset": 2},
        headers=_auth(token),
    ).json()

    ids_p1 = {t["id"] for t in page1}
    ids_p2 = {t["id"] for t in page2}
    assert ids_p1.isdisjoint(ids_p2), "Страницы не должны пересекаться"


def test_list_tasks_large_offset_returns_empty(auth_client):
    """GET /tasks?offset=99999 → пустой список."""
    client, _ = auth_client
    token = _register_and_login(client, "tk041_04@example.com")
    company_id = _create_company(client, token, "Tasks Co 4")
    agent_id = _create_agent(client, token, company_id)
    _create_task(client, token, company_id, agent_id, "Solo Task")

    resp = client.get(
        f"/api/companies/{company_id}/agents/{agent_id}/tasks",
        params={"limit": 10, "offset": 99999},
        headers=_auth(token),
    )
    assert resp.status_code == 200
    assert resp.json() == []


def test_list_tasks_invalid_limit_rejected(auth_client):
    """GET /tasks?limit=0 → 422."""
    client, _ = auth_client
    token = _register_and_login(client, "tk041_05@example.com")
    company_id = _create_company(client, token, "Tasks Co 5")
    agent_id = _create_agent(client, token, company_id)

    resp = client.get(
        f"/api/companies/{company_id}/agents/{agent_id}/tasks",
        params={"limit": 0},
        headers=_auth(token),
    )
    assert resp.status_code == 422


def test_list_tasks_over_max_limit_rejected(auth_client):
    """GET /tasks?limit=9999 → 422 (max=500)."""
    client, _ = auth_client
    token = _register_and_login(client, "tk041_06@example.com")
    company_id = _create_company(client, token, "Tasks Co 6")
    agent_id = _create_agent(client, token, company_id)

    resp = client.get(
        f"/api/companies/{company_id}/agents/{agent_id}/tasks",
        params={"limit": 9999},
        headers=_auth(token),
    )
    assert resp.status_code == 422


# ══════════════════════════════════════════════════════════════════════════════
# ALEX-TD-042: list_mcp_servers pagination
# ══════════════════════════════════════════════════════════════════════════════

def test_list_mcp_servers_default_limit(auth_client):
    """GET /mcp-servers без параметров → 200."""
    client, _ = auth_client
    token = _register_and_login(client, "mcp042_01@example.com")
    company_id = _create_company(client, token, "MCP Co 1")
    agent_id = _create_agent(client, token, company_id)

    resp = client.get(
        f"/api/companies/{company_id}/agents/{agent_id}/mcp-servers",
        headers=_auth(token),
    )
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


def test_list_mcp_servers_with_limit_param(auth_client):
    """GET /mcp-servers?limit=2 возвращает не больше 2 серверов."""
    client, _ = auth_client
    token = _register_and_login(client, "mcp042_02@example.com")
    company_id = _create_company(client, token, "MCP Co 2")
    agent_id = _create_agent(client, token, company_id)

    for i in range(5):
        _create_mcp_server(client, token, company_id, agent_id, f"srv-{i}")

    resp = client.get(
        f"/api/companies/{company_id}/agents/{agent_id}/mcp-servers",
        params={"limit": 2},
        headers=_auth(token),
    )
    assert resp.status_code == 200
    assert len(resp.json()) <= 2


def test_list_mcp_servers_with_offset(auth_client):
    """GET /mcp-servers?limit=2&offset=2 возвращает следующую страницу."""
    client, _ = auth_client
    token = _register_and_login(client, "mcp042_03@example.com")
    company_id = _create_company(client, token, "MCP Co 3")
    agent_id = _create_agent(client, token, company_id)

    for i in range(5):
        _create_mcp_server(client, token, company_id, agent_id, f"mcp-{i}")

    page1 = client.get(
        f"/api/companies/{company_id}/agents/{agent_id}/mcp-servers",
        params={"limit": 2, "offset": 0},
        headers=_auth(token),
    ).json()
    page2 = client.get(
        f"/api/companies/{company_id}/agents/{agent_id}/mcp-servers",
        params={"limit": 2, "offset": 2},
        headers=_auth(token),
    ).json()

    ids_p1 = {s["id"] for s in page1}
    ids_p2 = {s["id"] for s in page2}
    assert ids_p1.isdisjoint(ids_p2), "Страницы не должны пересекаться"


def test_list_mcp_servers_large_offset_returns_empty(auth_client):
    """GET /mcp-servers?offset=99999 → пустой список."""
    client, _ = auth_client
    token = _register_and_login(client, "mcp042_04@example.com")
    company_id = _create_company(client, token, "MCP Co 4")
    agent_id = _create_agent(client, token, company_id)
    _create_mcp_server(client, token, company_id, agent_id, "solo-srv")

    resp = client.get(
        f"/api/companies/{company_id}/agents/{agent_id}/mcp-servers",
        params={"limit": 10, "offset": 99999},
        headers=_auth(token),
    )
    assert resp.status_code == 200
    assert resp.json() == []


def test_list_mcp_servers_invalid_limit_rejected(auth_client):
    """GET /mcp-servers?limit=0 → 422."""
    client, _ = auth_client
    token = _register_and_login(client, "mcp042_05@example.com")
    company_id = _create_company(client, token, "MCP Co 5")
    agent_id = _create_agent(client, token, company_id)

    resp = client.get(
        f"/api/companies/{company_id}/agents/{agent_id}/mcp-servers",
        params={"limit": 0},
        headers=_auth(token),
    )
    assert resp.status_code == 422


def test_list_mcp_servers_over_max_limit_rejected(auth_client):
    """GET /mcp-servers?limit=9999 → 422 (max=200)."""
    client, _ = auth_client
    token = _register_and_login(client, "mcp042_06@example.com")
    company_id = _create_company(client, token, "MCP Co 6")
    agent_id = _create_agent(client, token, company_id)

    resp = client.get(
        f"/api/companies/{company_id}/agents/{agent_id}/mcp-servers",
        params={"limit": 9999},
        headers=_auth(token),
    )
    assert resp.status_code == 422
