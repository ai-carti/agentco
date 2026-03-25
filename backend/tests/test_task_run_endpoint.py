"""
BUG-041 — Integration test: POST /api/companies/{company_id}/tasks/{task_id}/run

Верификация что эндпоинт существует, возвращает 200/201 и { run_id: str }.
Эндпоинт реализован в: src/agentco/handlers/runs.py (router prefix /api/companies/{company_id})

Run: uv run pytest tests/test_task_run_endpoint.py -v
"""
import uuid
import pytest
from unittest.mock import AsyncMock, patch


# ── Helpers ───────────────────────────────────────────────────────────────────

def _register_and_login(client, email="user@example.com", password="pass1234"):
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


def _create_agent(client, token, company_id, name="Worker"):
    resp = client.post(
        f"/api/companies/{company_id}/agents",
        json={"name": name, "role": "worker", "system_prompt": "You are a worker", "model": "gpt-4o-mini"},
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


# ── Tests ─────────────────────────────────────────────────────────────────────

def test_task_run_endpoint_returns_201_and_run_id(auth_client):
    """POST /api/companies/{id}/tasks/{id}/run → 201, { run_id: str }."""
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

    assert resp.status_code in (200, 201)
    data = resp.json()
    assert "run_id" in data
    assert isinstance(data["run_id"], str)
    assert data["run_id"]  # non-empty


def test_task_run_endpoint_run_id_is_string(auth_client):
    """run_id в ответе — строка (не None, не число)."""
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

    assert resp.status_code in (200, 201)
    run_id = resp.json()["run_id"]
    assert type(run_id) is str
    assert len(run_id) > 0


def test_task_run_endpoint_requires_auth(auth_client):
    """POST /api/companies/{id}/tasks/{id}/run без токена → 401."""
    client, _ = auth_client
    token = _register_and_login(client)
    company_id = _create_company(client, token)
    agent_id = _create_agent(client, token, company_id)
    task_id = _create_task(client, token, company_id, agent_id)

    resp = client.post(
        f"/api/companies/{company_id}/tasks/{task_id}/run",
    )
    assert resp.status_code == 401


def test_task_run_endpoint_404_unknown_task(auth_client):
    """POST /api/companies/{id}/tasks/nonexistent/run → 404."""
    client, _ = auth_client
    token = _register_and_login(client)
    company_id = _create_company(client, token)

    resp = client.post(
        f"/api/companies/{company_id}/tasks/{str(uuid.uuid4())}/run",
        headers=_auth_headers(token),
    )
    assert resp.status_code == 404


def test_task_run_endpoint_status_started(auth_client):
    """Созданный ран имеет статус 'started' или 'pending' (не error/failed)."""
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

    assert resp.status_code in (200, 201)
    run_id = resp.json()["run_id"]

    # Verify run was actually created and has expected status
    run_resp = client.get(
        f"/api/companies/{company_id}/tasks/{task_id}/runs/{run_id}",
        headers=_auth_headers(token),
    )
    assert run_resp.status_code == 200
    status = run_resp.json()["status"]
    assert status not in ("failed", "error"), f"Unexpected run status: {status}"
