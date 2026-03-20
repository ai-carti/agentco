"""
Tests for ALEX-POST-003 — Rate limiting.

Tests:
- POST .../tasks/{task_id}/run: 10/minute limit (11th → 429)
- POST .../agents: 20/hour limit
- POST .../companies: 5/hour limit
- 429 response body: {"error": "rate_limit_exceeded", "retry_after": N}
"""
import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient

from agentco.main import app
from agentco.core.rate_limiting import limiter


@pytest.fixture
def rate_limited_client(auth_client):
    """auth_client with rate limiting using a fresh in-memory storage per test."""
    client, engine = auth_client
    # Reset limiter storage between tests to avoid state leakage
    limiter._storage.reset()
    yield client, engine
    try:
        limiter._storage.reset()
    except Exception:
        pass


def _register_and_login(client, email="rl_test@example.com"):
    """Register + login, return token."""
    client.post("/auth/register", json={"email": email, "password": "Secret123!", "name": "RL Test"})
    resp = client.post("/auth/login", json={"email": email, "password": "Secret123!"})
    assert resp.status_code == 200, f"Login failed: {resp.text}"
    return resp.json()["access_token"]


def _create_company(client, token, name="RL Co"):
    """Create company, return id."""
    resp = client.post(
        "/api/companies/",
        json={"name": name},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 201, f"Company creation failed: {resp.text}"
    return resp.json()["id"]


def _create_agent(client, token, company_id, name="RL Agent"):
    """Create agent, return id."""
    resp = client.post(
        f"/api/companies/{company_id}/agents",
        json={"name": name, "role": "tester"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 201, f"Agent creation failed: {resp.text}"
    return resp.json()["id"]


def _create_task(client, token, company_id, agent_id, name="RL Task"):
    """Create task, return id."""
    resp = client.post(
        f"/api/companies/{company_id}/agents/{agent_id}/tasks",
        json={"title": name},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 201, f"Task creation failed: {resp.text}"
    return resp.json()["id"]


class TestRateLimitRunTask:
    """POST /api/companies/{id}/tasks/{task_id}/run — 10/minute."""

    def test_rate_limit_429_on_11th_request(self, rate_limited_client):
        """First 10 requests succeed (201 or other non-429), 11th → 429."""
        client, _ = rate_limited_client
        # Reset limiter to clean state
        limiter._storage.reset()

        token = _register_and_login(client, "rl_run@example.com")
        company_id = _create_company(client, token, "RL Run Co")
        agent_id = _create_agent(client, token, company_id, "RL Run Agent")
        task_id = _create_task(client, token, company_id, agent_id, "RL Run Task")

        headers = {"Authorization": f"Bearer {token}"}
        url = f"/api/companies/{company_id}/tasks/{task_id}/run"

        responses = []
        for _ in range(11):
            resp = client.post(url, headers=headers)
            responses.append(resp.status_code)

        # All but last should be non-429 (201 or 409 if run already running)
        non_429 = [s for s in responses[:10] if s != 429]
        assert len(non_429) == 10, f"Expected 10 non-429, got: {responses}"
        assert responses[10] == 429, f"Expected 429 on 11th, got: {responses[10]}"

    def test_429_response_body(self, rate_limited_client):
        """429 body must contain error + retry_after."""
        client, _ = rate_limited_client
        limiter._storage.reset()

        token = _register_and_login(client, "rl_body@example.com")
        company_id = _create_company(client, token, "RL Body Co")
        agent_id = _create_agent(client, token, company_id, "RL Body Agent")
        task_id = _create_task(client, token, company_id, agent_id, "RL Body Task")

        headers = {"Authorization": f"Bearer {token}"}
        url = f"/api/companies/{company_id}/tasks/{task_id}/run"

        # Send 11 requests
        last_resp = None
        for _ in range(11):
            last_resp = client.post(url, headers=headers)

        assert last_resp.status_code == 429
        body = last_resp.json()
        assert body.get("error") == "rate_limit_exceeded"
        assert "retry_after" in body
        assert isinstance(body["retry_after"], int)
        assert body["retry_after"] > 0


class TestRateLimitCreateAgent:
    """POST /api/companies/{id}/agents — 20/hour (smoke test for limiter attachment)."""

    def test_limiter_applied_to_create_agent(self, rate_limited_client):
        """Endpoint has limiter decorator — verify it doesn't break normal requests."""
        client, _ = rate_limited_client
        limiter._storage.reset()

        token = _register_and_login(client, "rl_agent@example.com")
        company_id = _create_company(client, token, "RL Agent Co")
        headers = {"Authorization": f"Bearer {token}"}

        # First request should succeed
        resp = client.post(
            f"/api/companies/{company_id}/agents",
            json={"name": "Test Agent 1"},
            headers=headers,
        )
        assert resp.status_code == 201


class TestRateLimitCreateCompany:
    """POST /api/companies — 5/hour."""

    def test_limiter_applied_to_create_company(self, rate_limited_client):
        """Endpoint has limiter decorator — verify it doesn't break normal requests."""
        client, _ = rate_limited_client
        limiter._storage.reset()

        token = _register_and_login(client, "rl_co@example.com")
        headers = {"Authorization": f"Bearer {token}"}

        resp = client.post(
            "/api/companies/",
            json={"name": "RL Test Company"},
            headers=headers,
        )
        assert resp.status_code == 201

    def test_rate_limit_exceeded_returns_429(self, rate_limited_client):
        """After 5 requests, 6th → 429."""
        client, _ = rate_limited_client
        limiter._storage.reset()

        token = _register_and_login(client, "rl_co2@example.com")
        headers = {"Authorization": f"Bearer {token}"}

        responses = []
        for i in range(6):
            resp = client.post(
                "/api/companies/",
                json={"name": f"Co {i}"},
                headers=headers,
            )
            responses.append(resp.status_code)

        # First 5 should pass (201)
        assert all(s == 201 for s in responses[:5]), f"Responses: {responses}"
        # 6th should be 429
        assert responses[5] == 429, f"Expected 429 on 6th, got: {responses[5]}"
        body = client.post(
            "/api/companies/",
            json={"name": "Co extra"},
            headers=headers,
        ).json()
        assert body.get("error") == "rate_limit_exceeded"
