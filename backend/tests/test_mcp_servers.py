"""
POST-004: MCP tools foundation — TDD tests.

Run: uv run pytest tests/test_mcp_servers.py -v
"""
import pytest


# ── Helpers ───────────────────────────────────────────────────────────────────

def _register_and_login(client, email="mcp_user@example.com", password="pass1234"):
    client.post("/auth/register", json={"email": email, "password": password})
    resp = client.post("/auth/login", json={"email": email, "password": password})
    return resp.json()["access_token"]


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _create_company(client, token, name="MCP Corp"):
    resp = client.post("/api/companies/", json={"name": name}, headers=_auth(token))
    assert resp.status_code == 201
    return resp.json()["id"]


def _create_agent(client, token, company_id, name="Test Agent"):
    resp = client.post(
        f"/api/companies/{company_id}/agents",
        json={"name": name, "role": "worker", "model": "gpt-4o-mini"},
        headers=_auth(token),
    )
    assert resp.status_code == 201
    return resp.json()["id"]


def _mcp_url(company_id, agent_id):
    return f"/api/companies/{company_id}/agents/{agent_id}/mcp-servers"


# ── Tests ─────────────────────────────────────────────────────────────────────

def test_create_mcp_server_201(auth_client):
    """POST /mcp-servers → 201 и корректная схема ответа."""
    client, _ = auth_client
    token = _register_and_login(client, "mcp01@example.com")
    company_id = _create_company(client, token)
    agent_id = _create_agent(client, token, company_id)

    resp = client.post(
        _mcp_url(company_id, agent_id),
        json={"name": "filesystem", "server_url": "http://localhost:3000", "transport": "sse"},
        headers=_auth(token),
    )
    assert resp.status_code == 201
    data = resp.json()
    assert "id" in data
    assert data["name"] == "filesystem"
    assert data["server_url"] == "http://localhost:3000"
    assert data["transport"] == "sse"
    assert data["enabled"] is True


def test_list_mcp_servers(auth_client):
    """GET /mcp-servers → список созданных серверов."""
    client, _ = auth_client
    token = _register_and_login(client, "mcp02@example.com")
    company_id = _create_company(client, token)
    agent_id = _create_agent(client, token, company_id)

    client.post(
        _mcp_url(company_id, agent_id),
        json={"name": "server-a", "server_url": "http://a.local", "transport": "stdio"},
        headers=_auth(token),
    )
    client.post(
        _mcp_url(company_id, agent_id),
        json={"name": "server-b", "server_url": "http://b.local", "transport": "sse"},
        headers=_auth(token),
    )

    resp = client.get(_mcp_url(company_id, agent_id), headers=_auth(token))
    assert resp.status_code == 200
    names = [s["name"] for s in resp.json()]
    assert "server-a" in names
    assert "server-b" in names


def test_delete_mcp_server_204(auth_client):
    """DELETE /mcp-servers/{id} → 204, сервер исчезает из списка."""
    client, _ = auth_client
    token = _register_and_login(client, "mcp03@example.com")
    company_id = _create_company(client, token)
    agent_id = _create_agent(client, token, company_id)

    create_resp = client.post(
        _mcp_url(company_id, agent_id),
        json={"name": "to-delete", "server_url": "http://del.local", "transport": "sse"},
        headers=_auth(token),
    )
    server_id = create_resp.json()["id"]

    del_resp = client.delete(
        f"{_mcp_url(company_id, agent_id)}/{server_id}",
        headers=_auth(token),
    )
    assert del_resp.status_code == 204

    list_resp = client.get(_mcp_url(company_id, agent_id), headers=_auth(token))
    ids = [s["id"] for s in list_resp.json()]
    assert server_id not in ids


def test_create_mcp_server_401_no_token(auth_client):
    """POST без токена → 401."""
    client, _ = auth_client
    token = _register_and_login(client, "mcp04@example.com")
    company_id = _create_company(client, token)
    agent_id = _create_agent(client, token, company_id)

    resp = client.post(
        _mcp_url(company_id, agent_id),
        json={"name": "x", "server_url": "http://x.local", "transport": "sse"},
    )
    assert resp.status_code == 401


def test_create_mcp_server_404_unknown_agent(auth_client):
    """POST с несуществующим agent_id → 404."""
    client, _ = auth_client
    token = _register_and_login(client, "mcp05@example.com")
    company_id = _create_company(client, token)

    resp = client.post(
        _mcp_url(company_id, "nonexistent-agent-id"),
        json={"name": "x", "server_url": "http://x.local", "transport": "sse"},
        headers=_auth(token),
    )
    assert resp.status_code == 404


def test_duplicate_name_returns_409(auth_client):
    """POST с повторяющимся именем для того же агента → 409."""
    client, _ = auth_client
    token = _register_and_login(client, "mcp06@example.com")
    company_id = _create_company(client, token)
    agent_id = _create_agent(client, token, company_id)

    payload = {"name": "duplicate", "server_url": "http://x.local", "transport": "sse"}
    resp1 = client.post(_mcp_url(company_id, agent_id), json=payload, headers=_auth(token))
    assert resp1.status_code == 201

    resp2 = client.post(_mcp_url(company_id, agent_id), json=payload, headers=_auth(token))
    assert resp2.status_code == 409


def test_invalid_transport_returns_422(auth_client):
    """POST с transport не из {stdio, sse} → 422."""
    client, _ = auth_client
    token = _register_and_login(client, "mcp07@example.com")
    company_id = _create_company(client, token)
    agent_id = _create_agent(client, token, company_id)

    resp = client.post(
        _mcp_url(company_id, agent_id),
        json={"name": "bad-transport", "server_url": "http://x.local", "transport": "grpc"},
        headers=_auth(token),
    )
    assert resp.status_code == 422


def test_empty_url_returns_422(auth_client):
    """POST с пустым server_url → 422."""
    client, _ = auth_client
    token = _register_and_login(client, "mcp08@example.com")
    company_id = _create_company(client, token)
    agent_id = _create_agent(client, token, company_id)

    resp = client.post(
        _mcp_url(company_id, agent_id),
        json={"name": "no-url", "server_url": "", "transport": "sse"},
        headers=_auth(token),
    )
    assert resp.status_code == 422



def test_list_mcp_servers_order_is_stable(auth_client):
    """ALEX-TD-069: list_mcp_servers должен возвращать серверы в стабильном порядке (ORDER BY created_at asc)."""
    client, _ = auth_client
    token = _register_and_login(client, "mcp_order@example.com")
    company_id = _create_company(client, token, "Order Corp")
    agent_id = _create_agent(client, token, company_id, "Order Agent")

    server_names = ["alpha-server", "beta-server", "gamma-server"]
    created_ids = []
    for name in server_names:
        r = client.post(
            _mcp_url(company_id, agent_id),
            json={"name": name, "server_url": f"http://{name}.test", "transport": "sse"},
            headers=_auth(token),
        )
        assert r.status_code == 201
        created_ids.append(r.json()["id"])

    r = client.get(_mcp_url(company_id, agent_id), headers=_auth(token))
    assert r.status_code == 200
    items = r.json()
    returned_ids = [item["id"] for item in items]

    # All created servers must be present in stable order (created_at asc)
    assert returned_ids == created_ids, (
        f"ALEX-TD-069: ожидали порядок по created_at asc: {created_ids}, получили: {returned_ids}"
    )
