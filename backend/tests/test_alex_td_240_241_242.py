"""
TDD tests for ALEX-TD-240, ALEX-TD-241, ALEX-TD-242.

ALEX-TD-240: RunService.list_by_company should be internal (_list_by_company)
ALEX-TD-241: list_mcp_servers must support limit/offset pagination
ALEX-TD-242: list_runs should have TODO comment about offset pagination degradation
"""
import inspect
import uuid

import pytest

from agentco.services.run import RunService
from agentco.handlers.runs import list_runs
from agentco.handlers.mcp_servers import list_mcp_servers


# ── ALEX-TD-240: RunService.list_by_company must be internal ─────────────────

def test_run_service_has_no_public_list_by_company():
    """
    ALEX-TD-240: RunService.list_by_company must be renamed _list_by_company
    (internal). Public method without ownership check is a refactoring hazard.
    """
    # Public method should NOT exist
    assert not hasattr(RunService, "list_by_company"), (
        "ALEX-TD-240: RunService.list_by_company must be renamed to "
        "_list_by_company (internal, no ownership check)."
    )


def test_run_service_has_internal_list_by_company():
    """
    ALEX-TD-240: _list_by_company (private) should exist on RunService.
    """
    assert hasattr(RunService, "_list_by_company"), (
        "ALEX-TD-240: RunService._list_by_company (internal) must exist."
    )


# ── ALEX-TD-241: list_mcp_servers must accept limit/offset ───────────────────

def test_list_mcp_servers_has_limit_offset_params():
    """
    ALEX-TD-241: GET /mcp-servers must accept limit and offset query params.
    Check via function signature.
    """
    sig = inspect.signature(list_mcp_servers)
    params = sig.parameters
    assert "limit" in params, (
        "ALEX-TD-241: list_mcp_servers must have a 'limit' Query parameter."
    )
    assert "offset" in params, (
        "ALEX-TD-241: list_mcp_servers must have an 'offset' Query parameter."
    )


def test_list_mcp_servers_pagination(auth_client):
    """
    ALEX-TD-241: list_mcp_servers must respect limit and offset.
    Create 3 servers, fetch with limit=2 and offset=1 → must return 2 items (2nd and 3rd).
    """
    client, _ = auth_client
    # register user
    client.post("/auth/register", json={"email": "td241@example.com", "password": "pass1234"})
    login = client.post("/auth/login", json={"email": "td241@example.com", "password": "pass1234"})
    token = login.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # create company + agent
    company_resp = client.post("/api/companies/", json={"name": "TD241 Corp"}, headers=headers)
    assert company_resp.status_code == 201
    company_id = company_resp.json()["id"]

    agent_resp = client.post(
        f"/api/companies/{company_id}/agents",
        json={"name": "TD241 Agent", "role": "worker", "model": "gpt-4o-mini"},
        headers=headers,
    )
    assert agent_resp.status_code == 201
    agent_id = agent_resp.json()["id"]

    base_url = f"/api/companies/{company_id}/agents/{agent_id}/mcp-servers"

    # create 3 servers
    server_ids = []
    for i in range(3):
        r = client.post(
            base_url,
            json={"name": f"srv-{i}", "server_url": f"https://srv{i}.example.com", "transport": "sse"},
            headers=headers,
        )
        assert r.status_code == 201
        server_ids.append(r.json()["id"])

    # limit=2 should return only first 2
    r = client.get(base_url, params={"limit": 2, "offset": 0}, headers=headers)
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 2, f"ALEX-TD-241: expected 2, got {len(data)}"
    assert data[0]["id"] == server_ids[0]
    assert data[1]["id"] == server_ids[1]

    # offset=1, limit=2 → items at index 1 and 2
    r = client.get(base_url, params={"limit": 2, "offset": 1}, headers=headers)
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 2, f"ALEX-TD-241: expected 2 with offset=1, got {len(data)}"
    assert data[0]["id"] == server_ids[1]
    assert data[1]["id"] == server_ids[2]

    # offset=3 → empty list
    r = client.get(base_url, params={"limit": 10, "offset": 3}, headers=headers)
    assert r.status_code == 200
    assert r.json() == [], f"ALEX-TD-241: expected empty list at offset=3, got {r.json()}"


# ── ALEX-TD-242: list_runs must have TODO about offset pagination ─────────────

def test_list_runs_has_todo_cursor_pagination():
    """
    ALEX-TD-242: list_runs source must contain a TODO comment about
    offset-based pagination degradation for >1000 runs and cursor-based pagination.
    """
    source = inspect.getsource(list_runs)
    assert "TODO" in source and ("cursor" in source.lower() or "cursor-based" in source.lower()), (
        "ALEX-TD-242: list_runs must have a TODO comment explaining offset pagination "
        "limitation and cursor-based pagination as future work."
    )
