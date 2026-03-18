"""
TDD тесты для M2-004 — Runs API.

AC:
- POST /companies/{id}/runs → создаёт Run с goal
- GET /companies/{id}/runs → список ранов (id, goal, status, started_at, total_cost_usd)
- GET /companies/{id}/runs/{run_id} → детали (+ events_count)
- POST /companies/{id}/runs/{run_id}/stop → остановить
- GET /companies/{id}/runs/{run_id}/events → список событий
- POST /tasks/{id}/run → legacy create (backward compat)
- Ownership checks, auth checks

Run: uv run pytest tests/test_runs.py -v
"""
import asyncio
import pytest
from unittest.mock import AsyncMock, patch


# ── Helpers ───────────────────────────────────────────────────────────────────

def _register_and_login(client, email="user@example.com", password="pass123"):
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


def _create_agent(client, token, company_id, name="Worker", role="worker"):
    resp = client.post(
        f"/api/companies/{company_id}/agents",
        json={"name": name, "role": role, "system_prompt": "You are a worker", "model": "gpt-4o-mini"},
        headers=_auth_headers(token),
    )
    assert resp.status_code == 201
    return resp.json()["id"]


def _create_task(client, token, company_id, agent_id, title="Test Task"):
    resp = client.post(
        f"/api/companies/{company_id}/agents/{agent_id}/tasks",
        json={"title": title, "description": "Do something"},
        headers=_auth_headers(token),
    )
    assert resp.status_code == 201
    return resp.json()["id"]


def _create_run(client, token, company_id, goal="Build a landing page"):
    resp = client.post(
        f"/api/companies/{company_id}/runs",
        json={"goal": goal},
        headers=_auth_headers(token),
    )
    assert resp.status_code == 201
    return resp.json()["id"]


# ── 1. POST /companies/{id}/runs — create run with goal ─────────────────────

def test_create_run_with_goal(auth_client):
    """POST /runs → 201, returns run with goal and status=pending."""
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
    assert data["company_id"] == company_id
    assert data["id"]


def test_create_run_strips_whitespace(auth_client):
    """POST /runs with whitespace goal → stripped."""
    client, _ = auth_client
    token = _register_and_login(client)
    company_id = _create_company(client, token)

    resp = client.post(
        f"/api/companies/{company_id}/runs",
        json={"goal": "  Build something  "},
        headers=_auth_headers(token),
    )
    assert resp.status_code == 201
    assert resp.json()["goal"] == "Build something"


def test_create_run_empty_goal_rejected(auth_client):
    """POST /runs with empty goal → 422."""
    client, _ = auth_client
    token = _register_and_login(client)
    company_id = _create_company(client, token)

    resp = client.post(
        f"/api/companies/{company_id}/runs",
        json={"goal": ""},
        headers=_auth_headers(token),
    )
    assert resp.status_code == 422


def test_create_run_whitespace_only_goal_rejected(auth_client):
    """POST /runs with whitespace-only goal → 422."""
    client, _ = auth_client
    token = _register_and_login(client)
    company_id = _create_company(client, token)

    resp = client.post(
        f"/api/companies/{company_id}/runs",
        json={"goal": "   "},
        headers=_auth_headers(token),
    )
    assert resp.status_code == 422


def test_create_run_requires_jwt(auth_client):
    """POST /runs without token → 401."""
    client, _ = auth_client
    token = _register_and_login(client)
    company_id = _create_company(client, token)

    resp = client.post(
        f"/api/companies/{company_id}/runs",
        json={"goal": "test"},
    )
    assert resp.status_code == 401


def test_create_run_ownership_check(auth_client):
    """POST /runs by non-owner → 404."""
    client, _ = auth_client
    token1 = _register_and_login(client, "owner@test.com")
    token2 = _register_and_login(client, "other@test.com")
    company_id = _create_company(client, token1)

    resp = client.post(
        f"/api/companies/{company_id}/runs",
        json={"goal": "hack it"},
        headers=_auth_headers(token2),
    )
    assert resp.status_code == 404


# ── 2. GET /runs — list runs ────────────────────────────────────────────────

def test_list_runs_returns_fields(auth_client):
    """GET /runs → returns list with expected fields."""
    client, _ = auth_client
    token = _register_and_login(client)
    company_id = _create_company(client, token)
    _create_run(client, token, company_id)

    resp = client.get(
        f"/api/companies/{company_id}/runs",
        headers=_auth_headers(token),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) == 1
    run = data[0]
    for field in ["id", "goal", "status", "started_at", "total_cost_usd"]:
        assert field in run, f"Missing field: {field}"


def test_list_runs_empty(auth_client):
    """GET /runs → empty list when no runs."""
    client, _ = auth_client
    token = _register_and_login(client)
    company_id = _create_company(client, token)

    resp = client.get(
        f"/api/companies/{company_id}/runs",
        headers=_auth_headers(token),
    )
    assert resp.status_code == 200
    assert resp.json() == []


def test_list_runs_pagination(auth_client):
    """GET /runs?limit=1 — pagination works."""
    client, _ = auth_client
    token = _register_and_login(client)
    company_id = _create_company(client, token)
    _create_run(client, token, company_id, "Goal 1")
    _create_run(client, token, company_id, "Goal 2")

    resp_limit = client.get(
        f"/api/companies/{company_id}/runs?limit=1&offset=0",
        headers=_auth_headers(token),
    )
    assert len(resp_limit.json()) == 1

    resp_all = client.get(
        f"/api/companies/{company_id}/runs",
        headers=_auth_headers(token),
    )
    assert len(resp_all.json()) == 2


def test_list_runs_ownership_check(auth_client):
    """GET /runs by non-owner → 404."""
    client, _ = auth_client
    token1 = _register_and_login(client, "owner@test.com")
    token2 = _register_and_login(client, "other@test.com")
    company_id = _create_company(client, token1)

    resp = client.get(
        f"/api/companies/{company_id}/runs",
        headers=_auth_headers(token2),
    )
    assert resp.status_code == 404


def test_list_runs_requires_jwt(auth_client):
    """GET /runs без токена → 401."""
    client, _ = auth_client
    token = _register_and_login(client)
    company_id = _create_company(client, token)

    resp = client.get(f"/api/companies/{company_id}/runs")
    assert resp.status_code == 401


# ── 3. GET /runs/{id} — run details ────────────────────────────────────────

def test_get_run_details_with_events_count(auth_client):
    """GET /runs/{id} → includes events_count."""
    client, _ = auth_client
    token = _register_and_login(client)
    company_id = _create_company(client, token)
    run_id = _create_run(client, token, company_id)

    resp = client.get(
        f"/api/companies/{company_id}/runs/{run_id}",
        headers=_auth_headers(token),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == run_id
    assert data["events_count"] == 0
    assert "goal" in data
    assert "total_cost_usd" in data


def test_get_run_404(auth_client):
    """GET /runs/nonexistent → 404."""
    client, _ = auth_client
    token = _register_and_login(client)
    company_id = _create_company(client, token)

    resp = client.get(
        f"/api/companies/{company_id}/runs/nonexistent-run-id",
        headers=_auth_headers(token),
    )
    assert resp.status_code == 404


def test_get_run_ownership_check(auth_client):
    """GET /runs/{id} by non-owner → 404."""
    client, _ = auth_client
    token1 = _register_and_login(client, "owner@test.com")
    token2 = _register_and_login(client, "other@test.com")
    company_id = _create_company(client, token1)
    run_id = _create_run(client, token1, company_id)

    resp = client.get(
        f"/api/companies/{company_id}/runs/{run_id}",
        headers=_auth_headers(token2),
    )
    assert resp.status_code == 404


# ── 4. POST /runs/{id}/stop — stop run ───────────────────────────────────────

def test_stop_run_changes_status_to_stopped(auth_client):
    """POST /runs/{id}/stop → status becomes stopped."""
    client, _ = auth_client
    token = _register_and_login(client)
    company_id = _create_company(client, token)
    run_id = _create_run(client, token, company_id)

    resp = client.post(
        f"/api/companies/{company_id}/runs/{run_id}/stop",
        headers=_auth_headers(token),
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "stopped"


def test_stop_nonexistent_run_returns_404(auth_client):
    """POST /runs/nonexistent/stop → 404."""
    client, _ = auth_client
    token = _register_and_login(client)
    company_id = _create_company(client, token)

    resp = client.post(
        f"/api/companies/{company_id}/runs/nonexistent-run/stop",
        headers=_auth_headers(token),
    )
    assert resp.status_code == 404


def test_stop_run_ownership_check(auth_client):
    """POST /runs/{id}/stop by non-owner → 404."""
    client, _ = auth_client
    token1 = _register_and_login(client, "owner@test.com")
    token2 = _register_and_login(client, "other@test.com")
    company_id = _create_company(client, token1)
    run_id = _create_run(client, token1, company_id)

    resp = client.post(
        f"/api/companies/{company_id}/runs/{run_id}/stop",
        headers=_auth_headers(token2),
    )
    assert resp.status_code == 404


# ── 5. GET /runs/{id}/events — run events ────────────────────────────────────

def test_list_events_empty(auth_client):
    """GET /runs/{id}/events → empty list for new run."""
    client, _ = auth_client
    token = _register_and_login(client)
    company_id = _create_company(client, token)
    run_id = _create_run(client, token, company_id)

    resp = client.get(
        f"/api/companies/{company_id}/runs/{run_id}/events",
        headers=_auth_headers(token),
    )
    assert resp.status_code == 200
    assert resp.json() == []


def test_list_events_404_run_not_found(auth_client):
    """GET /runs/nonexistent/events → 404."""
    client, _ = auth_client
    token = _register_and_login(client)
    company_id = _create_company(client, token)

    resp = client.get(
        f"/api/companies/{company_id}/runs/nonexistent/events",
        headers=_auth_headers(token),
    )
    assert resp.status_code == 404


def test_list_events_ownership_check(auth_client):
    """GET /runs/{id}/events by non-owner → 404."""
    client, _ = auth_client
    token1 = _register_and_login(client, "owner@test.com")
    token2 = _register_and_login(client, "other@test.com")
    company_id = _create_company(client, token1)
    run_id = _create_run(client, token1, company_id)

    resp = client.get(
        f"/api/companies/{company_id}/runs/{run_id}/events",
        headers=_auth_headers(token2),
    )
    assert resp.status_code == 404


# ── 6. Legacy: POST /tasks/{task_id}/run — backward compat ──────────────────

def test_legacy_post_run_creates_run_returns_run_id(auth_client):
    """POST /tasks/{id}/run → 201 + run_id."""
    client, _ = auth_client
    token = _register_and_login(client)
    company_id = _create_company(client, token)
    agent_id = _create_agent(client, token, company_id)
    task_id = _create_task(client, token, company_id, agent_id)

    with patch("agentco.services.run.RunService._execute_agent", new_callable=AsyncMock):
        resp = client.post(
            f"/api/companies/{company_id}/tasks/{task_id}/run",
            headers=_auth_headers(token),
        )
    assert resp.status_code == 201
    assert "run_id" in resp.json()


def test_legacy_post_run_404_task_not_found(auth_client):
    """POST /tasks/nonexistent/run → 404."""
    client, _ = auth_client
    token = _register_and_login(client)
    company_id = _create_company(client, token)

    resp = client.post(
        f"/api/companies/{company_id}/tasks/nonexistent-task-id/run",
        headers=_auth_headers(token),
    )
    assert resp.status_code == 404


def test_legacy_cannot_create_second_running_run_for_same_task(auth_client):
    """POST /tasks/{id}/run при уже running ране → 409 Conflict."""
    client, _ = auth_client
    token = _register_and_login(client)
    company_id = _create_company(client, token)
    agent_id = _create_agent(client, token, company_id)
    task_id = _create_task(client, token, company_id, agent_id)

    async def _hanging_agent(*args, **kwargs):
        await asyncio.sleep(100)

    with patch("agentco.services.run.RunService._execute_agent", side_effect=_hanging_agent):
        resp1 = client.post(
            f"/api/companies/{company_id}/tasks/{task_id}/run",
            headers=_auth_headers(token),
        )
        assert resp1.status_code == 201

        resp2 = client.post(
            f"/api/companies/{company_id}/tasks/{task_id}/run",
            headers=_auth_headers(token),
        )
    assert resp2.status_code == 409


# ── 7. Ticket M2-004: RunResponse fields ─────────────────────────────────────

def test_run_response_has_total_cost_usd_and_total_tokens(auth_client):
    """RunResponse must include total_cost_usd and total_tokens per ticket spec."""
    client, _ = auth_client
    token = _register_and_login(client)
    company_id = _create_company(client, token)
    run_id = _create_run(client, token, company_id)

    resp = client.get(
        f"/api/companies/{company_id}/runs/{run_id}",
        headers=_auth_headers(token),
    )
    data = resp.json()
    assert "total_cost_usd" in data
    assert "total_tokens" in data
    assert data["total_cost_usd"] == 0.0
    assert data["total_tokens"] == 0


def test_run_response_has_created_at_and_completed_at(auth_client):
    """RunResponse must include created_at and completed_at per ticket spec."""
    client, _ = auth_client
    token = _register_and_login(client)
    company_id = _create_company(client, token)
    run_id = _create_run(client, token, company_id)

    resp = client.get(
        f"/api/companies/{company_id}/runs/{run_id}",
        headers=_auth_headers(token),
    )
    data = resp.json()
    assert "created_at" in data
    assert "completed_at" in data
    assert data["created_at"] is not None  # should be set on creation


def test_list_runs_has_total_cost_usd_field(auth_client):
    """GET /runs list items must include total_cost_usd per ticket spec."""
    client, _ = auth_client
    token = _register_and_login(client)
    company_id = _create_company(client, token)
    _create_run(client, token, company_id)

    resp = client.get(
        f"/api/companies/{company_id}/runs",
        headers=_auth_headers(token),
    )
    run = resp.json()[0]
    assert "total_cost_usd" in run
    assert "total_tokens" in run


# ── 8. PATCH /runs/{id}/stop — ticket requires PATCH method ──────────────────

def test_patch_stop_run(auth_client):
    """PATCH /runs/{id}/stop → 200 + status=stopped (ticket requires PATCH)."""
    client, _ = auth_client
    token = _register_and_login(client)
    company_id = _create_company(client, token)
    run_id = _create_run(client, token, company_id)

    resp = client.patch(
        f"/api/companies/{company_id}/runs/{run_id}/stop",
        headers=_auth_headers(token),
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "stopped"


def test_patch_stop_nonexistent_run_404(auth_client):
    """PATCH /runs/nonexistent/stop → 404."""
    client, _ = auth_client
    token = _register_and_login(client)
    company_id = _create_company(client, token)

    resp = client.patch(
        f"/api/companies/{company_id}/runs/nonexistent/stop",
        headers=_auth_headers(token),
    )
    assert resp.status_code == 404


# ── 9. RunEvent schema: agent_id, task_id ─────────────────────────────────────

def test_run_event_has_agent_id_and_task_id(auth_client):
    """RunEvent response must include agent_id and task_id per ticket spec."""
    client, _ = auth_client
    token = _register_and_login(client)
    company_id = _create_company(client, token)
    run_id = _create_run(client, token, company_id)

    # Insert event via ORM
    from agentco.orm.run import RunEventORM
    from agentco.db.session import get_session
    from agentco.main import app
    session_gen = app.dependency_overrides[get_session]()
    session = next(session_gen)
    session.add(RunEventORM(
        run_id=run_id,
        event_type="agent_started",
        agent_id="agent-abc",
        task_id="task-xyz",
        payload='{"msg": "hello"}',
    ))
    session.commit()

    resp = client.get(
        f"/api/companies/{company_id}/runs/{run_id}/events",
        headers=_auth_headers(token),
    )
    assert resp.status_code == 200
    events = resp.json()
    assert len(events) == 1
    ev = events[0]
    assert ev["agent_id"] == "agent-abc"
    assert ev["task_id"] == "task-xyz"
    assert ev["event_type"] == "agent_started"


# ── 10. Required test names per M2-004 spec ──────────────────────────────────

def test_create_run_returns_201(auth_client):
    """POST /tasks/{task_id}/run → 201, returns run_id."""
    client, _ = auth_client
    token = _register_and_login(client)
    company_id = _create_company(client, token)
    agent_id = _create_agent(client, token, company_id)
    task_id = _create_task(client, token, company_id, agent_id)

    with patch("agentco.services.run.RunService._execute_agent", new_callable=AsyncMock):
        resp = client.post(
            f"/api/companies/{company_id}/tasks/{task_id}/run",
            headers=_auth_headers(token),
        )
    assert resp.status_code == 201
    assert "run_id" in resp.json()


def test_create_run_duplicate_running_returns_409(auth_client):
    """POST /tasks/{task_id}/run дважды → 409 Conflict."""
    client, _ = auth_client
    token = _register_and_login(client)
    company_id = _create_company(client, token)
    agent_id = _create_agent(client, token, company_id)
    task_id = _create_task(client, token, company_id, agent_id)

    async def _hanging_agent(*args, **kwargs):
        await asyncio.sleep(100)

    with patch("agentco.services.run.RunService._execute_agent", side_effect=_hanging_agent):
        resp1 = client.post(
            f"/api/companies/{company_id}/tasks/{task_id}/run",
            headers=_auth_headers(token),
        )
        assert resp1.status_code == 201

        resp2 = client.post(
            f"/api/companies/{company_id}/tasks/{task_id}/run",
            headers=_auth_headers(token),
        )
    assert resp2.status_code == 409


def test_list_runs_for_task(auth_client):
    """GET /tasks/{task_id}/runs → список ранов задачи."""
    client, _ = auth_client
    token = _register_and_login(client)
    company_id = _create_company(client, token)
    agent_id = _create_agent(client, token, company_id)
    task_id = _create_task(client, token, company_id, agent_id)

    with patch("agentco.services.run.RunService._execute_agent", new_callable=AsyncMock):
        resp = client.post(
            f"/api/companies/{company_id}/tasks/{task_id}/run",
            headers=_auth_headers(token),
        )
    assert resp.status_code == 201

    resp = client.get(
        f"/api/companies/{company_id}/tasks/{task_id}/runs",
        headers=_auth_headers(token),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) == 1
    assert data[0]["task_id"] == task_id


def test_get_run_by_id(auth_client):
    """GET /tasks/{task_id}/runs/{run_id} → детали рана."""
    client, _ = auth_client
    token = _register_and_login(client)
    company_id = _create_company(client, token)
    agent_id = _create_agent(client, token, company_id)
    task_id = _create_task(client, token, company_id, agent_id)

    with patch("agentco.services.run.RunService._execute_agent", new_callable=AsyncMock):
        resp = client.post(
            f"/api/companies/{company_id}/tasks/{task_id}/run",
            headers=_auth_headers(token),
        )
    run_id = resp.json()["run_id"]

    resp = client.get(
        f"/api/companies/{company_id}/tasks/{task_id}/runs/{run_id}",
        headers=_auth_headers(token),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == run_id
    assert data["task_id"] == task_id
    assert "events_count" in data


def test_run_unauthorized_returns_401(auth_client):
    """POST /tasks/{task_id}/run без токена → 401."""
    client, _ = auth_client
    token = _register_and_login(client)
    company_id = _create_company(client, token)
    agent_id = _create_agent(client, token, company_id)
    task_id = _create_task(client, token, company_id, agent_id)

    resp = client.post(
        f"/api/companies/{company_id}/tasks/{task_id}/run",
    )
    assert resp.status_code == 401


# ── ALEX-TD-014: limit upper bound on GET /runs ───────────────────────────────

def test_runs_limit_capped_at_500(auth_client):
    """ALEX-TD-014: GET /runs?limit=999999 → 422 (limit exceeds max)."""
    client, _ = auth_client
    token = _register_and_login(client, email="td014@example.com")
    company_id = _create_company(client, token)

    resp = client.get(
        f"/api/companies/{company_id}/runs?limit=999999",
        headers=_auth_headers(token),
    )
    assert resp.status_code == 422
