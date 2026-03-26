"""
Tests for ALEX-TD-238 and ALEX-TD-239 backend self-audit fixes.

ALEX-TD-238: list endpoints (agents, tasks, library, runs) cap at le=100 not le=500
ALEX-TD-239: save_to_library returns 404 (not 403) when agent belongs to another user
"""
from __future__ import annotations
import pytest


# ── Helpers ───────────────────────────────────────────────────────────────────

def _register_and_login(client, email="user@test.com", password="testpass1"):
    client.post("/auth/register", json={"email": email, "password": password})
    resp = client.post("/auth/login", json={"email": email, "password": password})
    return resp.json()["access_token"]


def _auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


def _create_company(client, token, name="TestCo"):
    resp = client.post("/api/companies/", json={"name": name}, headers=_auth_headers(token))
    assert resp.status_code == 201
    return resp.json()["id"]


def _create_agent(client, token, company_id, name="Agent A"):
    resp = client.post(
        f"/api/companies/{company_id}/agents",
        json={"name": name, "role": "worker", "model": "gpt-4o-mini"},
        headers=_auth_headers(token),
    )
    assert resp.status_code == 201
    return resp.json()["id"]


def _create_task(client, token, company_id, agent_id, title="Task 1"):
    resp = client.post(
        f"/api/companies/{company_id}/tasks",
        json={"title": title, "agent_id": agent_id, "description": "desc"},
        headers=_auth_headers(token),
    )
    assert resp.status_code == 201
    return resp.json()["id"]


# ── ALEX-TD-238: le=100 on list endpoints ────────────────────────────────────

class TestListAgentsLimitCap:
    """ALEX-TD-238: GET /agents?limit=101 must return 422 (limit exceeded)."""

    def test_list_agents_limit_101_returns_422(self, auth_client):
        client, _ = auth_client
        token = _register_and_login(client, "agent238a@test.com")
        company_id = _create_company(client, token)

        resp = client.get(
            f"/api/companies/{company_id}/agents?limit=101",
            headers=_auth_headers(token),
        )
        assert resp.status_code == 422, (
            f"Expected 422 for limit=101 (le=100), got {resp.status_code}. "
            "ALEX-TD-238: le=500 must be reduced to le=100 in agents handler."
        )

    def test_list_agents_limit_100_returns_200(self, auth_client):
        client, _ = auth_client
        token = _register_and_login(client, "agent238b@test.com")
        company_id = _create_company(client, token)

        resp = client.get(
            f"/api/companies/{company_id}/agents?limit=100",
            headers=_auth_headers(token),
        )
        assert resp.status_code == 200, f"limit=100 must be accepted, got {resp.status_code}"

    def test_list_agents_limit_500_returns_422(self, auth_client):
        client, _ = auth_client
        token = _register_and_login(client, "agent238c@test.com")
        company_id = _create_company(client, token)

        resp = client.get(
            f"/api/companies/{company_id}/agents?limit=500",
            headers=_auth_headers(token),
        )
        assert resp.status_code == 422, (
            f"Expected 422 for limit=500 (old cap was 500, new cap is 100), got {resp.status_code}"
        )


class TestListTasksLimitCap:
    """ALEX-TD-238: GET /agents/{id}/tasks?limit=101 must return 422."""

    def test_list_tasks_limit_101_returns_422(self, auth_client):
        client, _ = auth_client
        token = _register_and_login(client, "task238a@test.com")
        company_id = _create_company(client, token)
        agent_id = _create_agent(client, token, company_id)

        resp = client.get(
            f"/api/companies/{company_id}/agents/{agent_id}/tasks?limit=101",
            headers=_auth_headers(token),
        )
        assert resp.status_code == 422, (
            f"Expected 422 for limit=101 (le=100), got {resp.status_code}. "
            "ALEX-TD-238: le=500 must be reduced to le=100 in tasks handler."
        )

    def test_list_tasks_limit_100_returns_200(self, auth_client):
        client, _ = auth_client
        token = _register_and_login(client, "task238b@test.com")
        company_id = _create_company(client, token)
        agent_id = _create_agent(client, token, company_id)

        resp = client.get(
            f"/api/companies/{company_id}/agents/{agent_id}/tasks?limit=100",
            headers=_auth_headers(token),
        )
        assert resp.status_code == 200


class TestListRunsLimitCap:
    """ALEX-TD-236 (now fixed via ALEX-TD-238): GET /runs?limit=101 must return 422."""

    def test_list_runs_limit_101_returns_422(self, auth_client):
        client, _ = auth_client
        token = _register_and_login(client, "runs238a@test.com")
        company_id = _create_company(client, token)

        resp = client.get(
            f"/api/companies/{company_id}/runs?limit=101",
            headers=_auth_headers(token),
        )
        assert resp.status_code == 422, (
            f"Expected 422 for limit=101 (le=100), got {resp.status_code}. "
            "ALEX-TD-236: le=500 must be reduced to le=100 in runs handler."
        )

    def test_list_runs_limit_100_returns_200(self, auth_client):
        client, _ = auth_client
        token = _register_and_login(client, "runs238b@test.com")
        company_id = _create_company(client, token)

        resp = client.get(
            f"/api/companies/{company_id}/runs?limit=100",
            headers=_auth_headers(token),
        )
        assert resp.status_code == 200


class TestListLibraryLimitCap:
    """ALEX-TD-238: GET /api/library?limit=101 must return 422."""

    def test_list_library_limit_101_returns_422(self, auth_client):
        client, _ = auth_client
        token = _register_and_login(client, "lib238a@test.com")

        resp = client.get(
            "/api/library?limit=101",
            headers=_auth_headers(token),
        )
        assert resp.status_code == 422, (
            f"Expected 422 for limit=101 (le=100), got {resp.status_code}. "
            "ALEX-TD-238: le=500 must be reduced to le=100 in library handler."
        )

    def test_list_library_limit_100_returns_200(self, auth_client):
        client, _ = auth_client
        token = _register_and_login(client, "lib238b@test.com")

        resp = client.get(
            "/api/library?limit=100",
            headers=_auth_headers(token),
        )
        assert resp.status_code == 200


# ── ALEX-TD-239: save_to_library returns 404 not 403 for unauthorized ────────

class TestSaveToLibraryOwnershipCheck:
    """ALEX-TD-239: POST /api/library with another user's agent_id → 404 not 403."""

    def test_save_foreign_agent_returns_404_not_403(self, auth_client):
        """User B trying to save User A's agent must get 404, not 403."""
        client, _ = auth_client

        # User A creates agent
        token_a = _register_and_login(client, "usera239@test.com")
        company_a = _create_company(client, token_a, "Company A")
        agent_a_id = _create_agent(client, token_a, company_a, "Agent A")

        # User B tries to save User A's agent to library
        token_b = _register_and_login(client, "userb239@test.com", "testpass2")
        resp = client.post(
            "/api/library",
            json={"agent_id": agent_a_id},
            headers=_auth_headers(token_b),
        )
        assert resp.status_code == 404, (
            f"Expected 404 (ALEX-TD-239: should not leak agent existence via 403), "
            f"got {resp.status_code}: {resp.json()}"
        )

    def test_save_own_agent_to_library_returns_201(self, auth_client):
        """Owner saving their own agent to library → 201."""
        client, _ = auth_client
        token = _register_and_login(client, "owner239@test.com")
        company_id = _create_company(client, token, "My Company")
        agent_id = _create_agent(client, token, company_id, "My Agent")

        resp = client.post(
            "/api/library",
            json={"agent_id": agent_id},
            headers=_auth_headers(token),
        )
        assert resp.status_code == 201, f"Owner should be able to save agent: {resp.json()}"

    def test_save_nonexistent_agent_returns_404(self, auth_client):
        """POST /api/library with unknown agent_id → 404."""
        client, _ = auth_client
        token = _register_and_login(client, "notfound239@test.com")

        resp = client.post(
            "/api/library",
            json={"agent_id": "00000000-0000-0000-0000-000000000000"},
            headers=_auth_headers(token),
        )
        assert resp.status_code == 404
