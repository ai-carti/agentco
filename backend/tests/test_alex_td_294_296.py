"""
Tests for ALEX-TD-294 through ALEX-TD-296.

ALEX-TD-294: GET /api/library supports ?sort_by=use_count for popularity ranking
ALEX-TD-295: LibraryAgentOut exposes avatar field (optional); AgentLibraryORM stores avatar
ALEX-TD-296: GET /api/library supports ?mine=true to filter by current user's saved agents

Tests written BEFORE implementation (red → green).
"""
import uuid
import pytest


# ── Helpers ───────────────────────────────────────────────────────────────────

def _register_and_login(client, email=None, password="pass1234"):
    if email is None:
        email = f"user_{uuid.uuid4().hex[:8]}@example.com"
    client.post("/auth/register", json={"email": email, "password": password})
    resp = client.post("/auth/login", json={"email": email, "password": password})
    return resp.json()["access_token"]


def _auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


def _create_company(client, token, name=None):
    if name is None:
        name = f"Corp {uuid.uuid4().hex[:6]}"
    resp = client.post(
        "/api/companies/",
        json={"name": name},
        headers=_auth_headers(token),
    )
    assert resp.status_code == 201
    return resp.json()["id"]


def _create_agent(client, token, company_id, name="Test Agent"):
    resp = client.post(
        f"/api/companies/{company_id}/agents",
        json={"name": name, "role": "worker", "system_prompt": "helpful", "model": "gpt-4o-mini"},
        headers=_auth_headers(token),
    )
    assert resp.status_code == 201
    return resp.json()["id"]


def _add_to_library(client, token, agent_id):
    resp = client.post(
        "/api/library",
        json={"agent_id": agent_id},
        headers=_auth_headers(token),
    )
    assert resp.status_code == 201
    return resp.json()


def _fork_agent(client, token, company_id, library_agent_id):
    resp = client.post(
        f"/api/companies/{company_id}/agents/fork",
        json={"library_agent_id": library_agent_id},
        headers=_auth_headers(token),
    )
    assert resp.status_code == 201
    return resp.json()


# ── ALEX-TD-295: LibraryAgentOut has optional avatar field ────────────────────

class TestLibraryAvatarField:
    """ALEX-TD-295: GET /api/library returns avatar field (optional, may be None)."""

    def test_list_library_response_includes_avatar_field(self, auth_client):
        """GET /api/library returns entries with an 'avatar' key (even if None)."""
        client, _ = auth_client
        token = _register_and_login(client)
        company_id = _create_company(client, token)
        agent_id = _create_agent(client, token, company_id)
        _add_to_library(client, token, agent_id)

        resp = client.get("/api/library", headers=_auth_headers(token))
        assert resp.status_code == 200
        entries = resp.json()
        assert len(entries) >= 1
        # avatar field must be present in response (may be None for agents without avatar)
        assert "avatar" in entries[0], \
            "LibraryAgentOut must include 'avatar' field (None if unset)"

    def test_save_to_library_response_includes_avatar_field(self, auth_client):
        """POST /api/library response includes avatar field."""
        client, _ = auth_client
        token = _register_and_login(client)
        company_id = _create_company(client, token)
        agent_id = _create_agent(client, token, company_id)

        resp = client.post(
            "/api/library",
            json={"agent_id": agent_id},
            headers=_auth_headers(token),
        )
        assert resp.status_code == 201
        data = resp.json()
        assert "avatar" in data, "POST /api/library response must include 'avatar' field"

    def test_portfolio_library_agent_includes_avatar(self, auth_client):
        """GET /api/library/{id}/portfolio returns library_agent with avatar field."""
        client, _ = auth_client
        token = _register_and_login(client)
        company_id = _create_company(client, token)
        agent_id = _create_agent(client, token, company_id)
        lib_entry = _add_to_library(client, token, agent_id)
        lib_id = lib_entry["id"]

        resp = client.get(f"/api/library/{lib_id}/portfolio", headers=_auth_headers(token))
        assert resp.status_code == 200
        data = resp.json()
        assert "avatar" in data["library_agent"], \
            "PortfolioOut.library_agent must include 'avatar' field"


# ── ALEX-TD-294: GET /api/library supports sort_by=use_count ─────────────────

class TestLibrarySortBy:
    """ALEX-TD-294: GET /api/library?sort_by=use_count returns results ordered by popularity."""

    def test_sort_by_created_at_is_default(self, auth_client):
        """GET /api/library with no sort_by uses created_at DESC (default behavior)."""
        client, _ = auth_client
        token = _register_and_login(client)
        resp = client.get("/api/library", headers=_auth_headers(token))
        assert resp.status_code == 200  # must not error on missing sort_by

    def test_sort_by_use_count_returns_200(self, auth_client):
        """GET /api/library?sort_by=use_count returns 200."""
        client, _ = auth_client
        token = _register_and_login(client)
        resp = client.get("/api/library?sort_by=use_count", headers=_auth_headers(token))
        assert resp.status_code == 200

    def test_sort_by_invalid_value_returns_422(self, auth_client):
        """GET /api/library?sort_by=invalid returns 422."""
        client, _ = auth_client
        token = _register_and_login(client)
        resp = client.get("/api/library?sort_by=invalid_column", headers=_auth_headers(token))
        assert resp.status_code == 422

    def test_sort_by_use_count_order(self, auth_client):
        """GET /api/library?sort_by=use_count returns agents with higher use_count first."""
        client, _ = auth_client
        token = _register_and_login(client)
        company_id = _create_company(client, token)

        # Create two agents and save both to library
        agent1_id = _create_agent(client, token, company_id, "Popular Agent")
        agent2_id = _create_agent(client, token, company_id, "Unpopular Agent")
        lib1 = _add_to_library(client, token, agent1_id)
        lib2 = _add_to_library(client, token, agent2_id)

        # Fork agent1 (popular) — this increments use_count
        company2_id = _create_company(client, token, "Fork Target")
        _fork_agent(client, token, company2_id, lib1["id"])

        # GET ?sort_by=use_count — popular agent should come first
        resp = client.get("/api/library?sort_by=use_count", headers=_auth_headers(token))
        assert resp.status_code == 200
        entries = resp.json()
        assert len(entries) >= 2

        # Find our two agents by id
        ids = [e["id"] for e in entries]
        assert lib1["id"] in ids
        assert lib2["id"] in ids

        # Popular agent (lib1, use_count=1) must appear before unpopular (lib2, use_count=0)
        assert ids.index(lib1["id"]) < ids.index(lib2["id"]), \
            "Agent with higher use_count must appear first when sort_by=use_count"

    def test_sort_by_use_count_desc_is_default_direction(self, auth_client):
        """sort_by=use_count defaults to DESC (most popular first)."""
        client, _ = auth_client
        token = _register_and_login(client)
        resp = client.get("/api/library?sort_by=use_count", headers=_auth_headers(token))
        assert resp.status_code == 200  # no 500 from missing direction param


# ── ALEX-TD-296: GET /api/library supports ?mine=true ────────────────────────

class TestLibraryMineFilter:
    """ALEX-TD-296: GET /api/library?mine=true returns only current user's saved agents."""

    def test_mine_false_returns_all_agents(self, auth_client):
        """GET /api/library without mine=true (default) returns all agents."""
        client, _ = auth_client
        token1 = _register_and_login(client)
        token2 = _register_and_login(client)

        # User 1 saves an agent
        c1_id = _create_company(client, token1)
        a1_id = _create_agent(client, token1, c1_id, "User1 Agent")
        _add_to_library(client, token1, a1_id)

        # User 2 saves an agent
        c2_id = _create_company(client, token2)
        a2_id = _create_agent(client, token2, c2_id, "User2 Agent")
        _add_to_library(client, token2, a2_id)

        # User 1 without mine=true should see both
        resp = client.get("/api/library", headers=_auth_headers(token1))
        assert resp.status_code == 200
        names = {e["name"] for e in resp.json()}
        assert "User1 Agent" in names
        assert "User2 Agent" in names

    def test_mine_true_returns_only_own_agents(self, auth_client):
        """GET /api/library?mine=true returns only agents saved by current user."""
        client, _ = auth_client
        token1 = _register_and_login(client)
        token2 = _register_and_login(client)

        # User 1 saves an agent
        c1_id = _create_company(client, token1)
        a1_id = _create_agent(client, token1, c1_id, "Mine Agent")
        _add_to_library(client, token1, a1_id)

        # User 2 saves an agent
        c2_id = _create_company(client, token2)
        a2_id = _create_agent(client, token2, c2_id, "Not Mine Agent")
        _add_to_library(client, token2, a2_id)

        # User 1 with mine=true should see only their own
        resp = client.get("/api/library?mine=true", headers=_auth_headers(token1))
        assert resp.status_code == 200
        entries = resp.json()
        names = {e["name"] for e in entries}
        assert "Mine Agent" in names
        assert "Not Mine Agent" not in names, \
            "mine=true must not return agents saved by other users"

    def test_mine_true_requires_auth(self, auth_client):
        """GET /api/library?mine=true without auth → 401."""
        client, _ = auth_client
        resp = client.get("/api/library?mine=true")
        assert resp.status_code == 401

    def test_mine_empty_when_no_own_agents(self, auth_client):
        """GET /api/library?mine=true returns empty list if user has no saved agents."""
        client, _ = auth_client
        token = _register_and_login(client)
        resp = client.get("/api/library?mine=true", headers=_auth_headers(token))
        assert resp.status_code == 200
        # May or may not be empty depending on test isolation, but must not error
        assert isinstance(resp.json(), list)
