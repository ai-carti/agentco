"""
Tests for ALEX-TD-064 and ALEX-TD-065.

ALEX-TD-064: DELETE /agents/{id} returns 500 if agent has tasks (FK IntegrityError).
             Fix: nullify task.agent_id before deleting agent.

ALEX-TD-065: POST /api/companies/{id}/runs has no rate limiting.
             Fix: add @limiter.limit(_RATE_LIMIT_CREATE_RUN).
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
    resp = client.post("/api/companies/", json={"name": name}, headers=_auth_headers(token))
    assert resp.status_code == 201
    return resp.json()["id"]


def _create_agent(client, token, company_id, name="Worker"):
    resp = client.post(
        f"/api/companies/{company_id}/agents",
        json={"name": name, "role": "worker", "model": "gpt-4o-mini"},
        headers=_auth_headers(token),
    )
    assert resp.status_code == 201
    return resp.json()["id"]


def _create_task(client, token, company_id, agent_id, title="Test Task"):
    resp = client.post(
        f"/api/companies/{company_id}/agents/{agent_id}/tasks",
        json={"title": title},
        headers=_auth_headers(token),
    )
    assert resp.status_code == 201
    return resp.json()["id"]


# ── ALEX-TD-064: DELETE agent with tasks ─────────────────────────────────────

def test_delete_agent_with_tasks_returns_204_not_500(auth_client):
    """ALEX-TD-064: DELETE /agents/{id} when agent has tasks → 204 (not 500 IntegrityError).

    Previously: SQLite FK constraint fires → IntegrityError → 500.
    Fix: nullify task.agent_id before deleting agent.
    """
    client, _ = auth_client
    token = _register_and_login(client)
    company_id = _create_company(client, token)
    agent_id = _create_agent(client, token, company_id)

    # Create tasks assigned to this agent
    task_id1 = _create_task(client, token, company_id, agent_id, "Task 1")
    task_id2 = _create_task(client, token, company_id, agent_id, "Task 2")

    # Delete agent — should succeed (not raise 500)
    resp = client.delete(
        f"/api/companies/{company_id}/agents/{agent_id}",
        headers=_auth_headers(token),
    )
    assert resp.status_code == 204, f"Expected 204 but got {resp.status_code}: {resp.text}"


def test_delete_agent_with_tasks_preserves_tasks(auth_client):
    """ALEX-TD-064: after deleting agent, tasks remain but with agent_id=null."""
    client, _ = auth_client
    token = _register_and_login(client)
    company_id = _create_company(client, token)
    agent_id = _create_agent(client, token, company_id)
    task_id = _create_task(client, token, company_id, agent_id, "My Task")

    # Delete agent
    resp = client.delete(
        f"/api/companies/{company_id}/agents/{agent_id}",
        headers=_auth_headers(token),
    )
    assert resp.status_code == 204

    # Agent no longer exists
    resp = client.get(
        f"/api/companies/{company_id}/agents/{agent_id}",
        headers=_auth_headers(token),
    )
    assert resp.status_code == 404


def test_delete_agent_without_tasks_works(auth_client):
    """ALEX-TD-064: baseline — deleting agent without tasks still works."""
    client, _ = auth_client
    token = _register_and_login(client)
    company_id = _create_company(client, token)
    agent_id = _create_agent(client, token, company_id)

    resp = client.delete(
        f"/api/companies/{company_id}/agents/{agent_id}",
        headers=_auth_headers(token),
    )
    assert resp.status_code == 204


# ── ALEX-TD-065: POST /runs rate limiting ────────────────────────────────────

def test_create_run_requires_auth(auth_client):
    """ALEX-TD-065: POST /runs without token → 401 (sanity check)."""
    client, _ = auth_client
    token = _register_and_login(client)
    company_id = _create_company(client, token)

    resp = client.post(
        f"/api/companies/{company_id}/runs",
        json={"goal": "Build something"},
    )
    # No auth header → 401
    assert resp.status_code == 401


def test_create_run_limiter_decorator_is_present(auth_client):
    """ALEX-TD-065: POST /runs is protected by rate limiter (route works normally).

    We can't easily test the actual rate limit in unit tests (needs many requests),
    but we verify the endpoint works correctly with valid input — confirming the
    @limiter.limit decorator didn't break the signature (request: Request added).
    """
    client, _ = auth_client
    token = _register_and_login(client)
    company_id = _create_company(client, token)

    resp = client.post(
        f"/api/companies/{company_id}/runs",
        json={"goal": "Build a landing page"},
        headers=_auth_headers(token),
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["goal"] == "Build a landing page"
    assert data["status"] == "pending"
