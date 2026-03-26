"""
Tests for ALEX-TD-262, 263, 264, 265, 266 — self-audit cycle 4 fixes.

ALEX-TD-262: list_credentials le=200 → le=100
ALEX-TD-263: TaskService.update/update_status redundant flush() removed
ALEX-TD-264: /auth/logout rate-limiting (smoke check endpoint returns 200)
ALEX-TD-265: email case-insensitive normalization on register/login
ALEX-TD-266: AgentLibraryORM.use_count has index (schema check)

Run: uv run pytest tests/test_alex_td_262_266.py -v
"""
import pytest
from fastapi.testclient import TestClient


# ── helpers ───────────────────────────────────────────────────────────────────

def _register_and_login(client: TestClient, email: str, password: str = "pass1234") -> str:
    client.post("/auth/register", json={"email": email, "password": password})
    resp = client.post("/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200, resp.text
    return resp.json()["access_token"]


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _create_company(client: TestClient, token: str, name: str = "TestCo") -> str:
    resp = client.post("/api/companies/", json={"name": name}, headers=_auth(token))
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


# ── ALEX-TD-262: list_credentials le=100 policy ───────────────────────────────

class TestAlexTD262CredentialsLimit:
    def test_list_credentials_rejects_limit_over_100(self, auth_client):
        """ALEX-TD-262: limit=101 must return 422 (le=100 constraint)."""
        client, _ = auth_client
        token = _register_and_login(client, "cred262@example.com")
        company_id = _create_company(client, token)
        resp = client.get(
            f"/api/companies/{company_id}/credentials?limit=101",
            headers=_auth(token),
        )
        assert resp.status_code == 422, (
            f"Expected 422 for limit=101, got {resp.status_code}: {resp.text}"
        )

    def test_list_credentials_accepts_limit_100(self, auth_client):
        """ALEX-TD-262: limit=100 must be accepted (at the policy boundary)."""
        client, _ = auth_client
        token = _register_and_login(client, "cred262b@example.com")
        company_id = _create_company(client, token)
        resp = client.get(
            f"/api/companies/{company_id}/credentials?limit=100",
            headers=_auth(token),
        )
        assert resp.status_code == 200, resp.text


# ── ALEX-TD-263: TaskService flush() removed ─────────────────────────────────

class TestAlexTD263TaskFlush:
    """Verify that update() and update_status() still function correctly
    without the redundant flush() — correctness test, not a performance test."""

    def _setup(self, client: TestClient, email: str):
        token = _register_and_login(client, email)
        company_id = _create_company(client, token)
        resp = client.post(
            f"/api/companies/{company_id}/agents",
            json={"name": "TestAgent"},
            headers=_auth(token),
        )
        assert resp.status_code == 201
        agent_id = resp.json()["id"]
        resp = client.post(
            f"/api/companies/{company_id}/agents/{agent_id}/tasks",
            json={"title": "Flush Test Task"},
            headers=_auth(token),
        )
        assert resp.status_code == 201
        task_id = resp.json()["id"]
        return token, company_id, agent_id, task_id

    def test_task_update_persists_after_commit(self, auth_client):
        """ALEX-TD-263: update() without flush() should still persist changes."""
        client, _ = auth_client
        token, company_id, agent_id, task_id = self._setup(client, "flush263a@example.com")
        resp = client.put(
            f"/api/companies/{company_id}/agents/{agent_id}/tasks/{task_id}",
            json={"title": "Updated Title"},
            headers=_auth(token),
        )
        assert resp.status_code == 200
        assert resp.json()["title"] == "Updated Title"
        # Verify via GET
        resp = client.get(
            f"/api/companies/{company_id}/agents/{agent_id}/tasks/{task_id}",
            headers=_auth(token),
        )
        assert resp.json()["title"] == "Updated Title"

    def test_task_update_status_persists_after_commit(self, auth_client):
        """ALEX-TD-263: update_status() without flush() should still persist status."""
        client, _ = auth_client
        token, company_id, agent_id, task_id = self._setup(client, "flush263b@example.com")
        resp = client.patch(
            f"/api/companies/{company_id}/agents/{agent_id}/tasks/{task_id}/status",
            json={"status": "in_progress"},
            headers=_auth(token),
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "in_progress"
        # Verify via GET
        resp = client.get(
            f"/api/companies/{company_id}/agents/{agent_id}/tasks/{task_id}",
            headers=_auth(token),
        )
        assert resp.json()["status"] == "in_progress"


# ── ALEX-TD-264: logout rate limit smoke test ─────────────────────────────────

class TestAlexTD264LogoutRateLimit:
    def test_logout_endpoint_returns_200(self, auth_client):
        """ALEX-TD-264: logout endpoint should still work (returns 200)."""
        client, _ = auth_client
        resp = client.post("/auth/logout")
        assert resp.status_code == 200
        assert resp.json() == {"message": "logged out"}


# ── ALEX-TD-265: email case-insensitive normalization ─────────────────────────

class TestAlexTD265EmailNormalization:
    def test_register_accepts_uppercase_email(self, auth_client):
        """ALEX-TD-265: uppercase email in register should succeed and be normalized."""
        client, _ = auth_client
        resp = client.post(
            "/auth/register",
            json={"email": "UPPER@EXAMPLE.COM", "password": "pass1234"},
        )
        assert resp.status_code == 201

    def test_login_with_original_case_succeeds(self, auth_client):
        """ALEX-TD-265: login with mixed-case email must succeed after registering."""
        client, _ = auth_client
        client.post("/auth/register", json={"email": "MixedCase@Example.Com", "password": "pass1234"})
        resp = client.post("/auth/login", json={"email": "MixedCase@Example.Com", "password": "pass1234"})
        assert resp.status_code == 200
        assert "access_token" in resp.json()

    def test_login_with_lowercase_email_after_uppercase_register(self, auth_client):
        """ALEX-TD-265: after registering with UPPER@EXAMPLE.COM, lowercase login must succeed."""
        client, _ = auth_client
        client.post("/auth/register", json={"email": "ALEXTEST@EXAMPLE.COM", "password": "pass1234"})
        resp = client.post("/auth/login", json={"email": "alextest@example.com", "password": "pass1234"})
        assert resp.status_code == 200
        assert "access_token" in resp.json()

    def test_duplicate_register_different_case_rejected(self, auth_client):
        """ALEX-TD-265: registering same email in different case must fail with 400."""
        client, _ = auth_client
        client.post("/auth/register", json={"email": "dup265@example.com", "password": "pass1234"})
        resp = client.post("/auth/register", json={"email": "DUP265@EXAMPLE.COM", "password": "pass1234"})
        assert resp.status_code == 400
        assert "already registered" in resp.json()["detail"]


# ── ALEX-TD-266: AgentLibraryORM.use_count index ─────────────────────────────

class TestAlexTD266UseCountIndex:
    def test_agent_library_use_count_has_index(self):
        """ALEX-TD-266: use_count column must have an index for ORDER BY use_count queries."""
        from agentco.orm.agent_library import AgentLibraryORM
        use_count_col = AgentLibraryORM.__table__.c.use_count
        table = AgentLibraryORM.__table__
        col_has_index = any(idx.columns.contains_column(use_count_col) for idx in table.indexes)
        assert col_has_index, (
            "AgentLibraryORM.use_count should have an index (ALEX-TD-266). "
            f"Existing indexes: {[idx.name for idx in table.indexes]}"
        )
