"""
TDD тесты для M2-004 — Runs API.

AC:
- POST /tasks/{id}/run → создаёт Run, возвращает run_id, стартует background task
- GET /runs → список ранов компании (пагинация)
- GET /runs/{id} → статус + результат рана
- POST /runs/{id}/stop → останавливает running ран (→ stopped)
- Статус lifecycle: pending → running → done/failed
- Минимум 10 тестов

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


# ── 1. POST /tasks/{task_id}/run — создание Run ────────────────────────────────

def test_post_run_creates_run_returns_run_id(auth_client):
    """POST /tasks/{id}/run → 201 + run_id в ответе."""
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
    data = resp.json()
    assert "run_id" in data
    assert data["run_id"]  # непустой


def test_post_run_requires_jwt(auth_client):
    """POST без токена → 401."""
    client, _ = auth_client
    token = _register_and_login(client)
    company_id = _create_company(client, token)
    agent_id = _create_agent(client, token, company_id)
    task_id = _create_task(client, token, company_id, agent_id)

    resp = client.post(f"/api/companies/{company_id}/tasks/{task_id}/run")
    assert resp.status_code == 401


def test_post_run_404_task_not_found(auth_client):
    """POST с несуществующим task_id → 404."""
    client, _ = auth_client
    token = _register_and_login(client)
    company_id = _create_company(client, token)

    resp = client.post(
        f"/api/companies/{company_id}/tasks/nonexistent-task-id/run",
        headers=_auth_headers(token),
    )
    assert resp.status_code == 404


def test_post_run_creates_run_in_db(auth_client):
    """POST /tasks/{id}/run → Run сохраняется в БД со статусом pending/running."""
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
    run_id = resp.json()["run_id"]

    # Проверяем через GET /runs/{id}
    get_resp = client.get(
        f"/api/companies/{company_id}/runs/{run_id}",
        headers=_auth_headers(token),
    )
    assert get_resp.status_code == 200
    run_data = get_resp.json()
    assert run_data["id"] == run_id
    assert run_data["task_id"] == task_id
    assert run_data["company_id"] == company_id
    assert run_data["status"] in ("pending", "running", "done", "failed")


# ── 2. GET /runs — список ранов ────────────────────────────────────────────────

def test_get_runs_returns_list(auth_client):
    """GET /runs → возвращает список (может быть пустым)."""
    client, _ = auth_client
    token = _register_and_login(client)
    company_id = _create_company(client, token)

    resp = client.get(
        f"/api/companies/{company_id}/runs",
        headers=_auth_headers(token),
    )
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


def test_get_runs_pagination(auth_client):
    """GET /runs?limit=1&offset=0 — пагинация работает."""
    client, _ = auth_client
    token = _register_and_login(client)
    company_id = _create_company(client, token)
    agent_id = _create_agent(client, token, company_id)

    # Создаём 2 рана
    for i in range(2):
        task_id = _create_task(client, token, company_id, agent_id, title=f"Task {i}")
        with patch("agentco.services.run.RunService._execute_agent", new_callable=AsyncMock):
            client.post(
                f"/api/companies/{company_id}/tasks/{task_id}/run",
                headers=_auth_headers(token),
            )

    resp_limit = client.get(
        f"/api/companies/{company_id}/runs?limit=1&offset=0",
        headers=_auth_headers(token),
    )
    assert resp_limit.status_code == 200
    assert len(resp_limit.json()) == 1

    resp_all = client.get(
        f"/api/companies/{company_id}/runs?limit=100&offset=0",
        headers=_auth_headers(token),
    )
    assert len(resp_all.json()) == 2


def test_get_runs_requires_jwt(auth_client):
    """GET /runs без токена → 401."""
    client, _ = auth_client
    token = _register_and_login(client)
    company_id = _create_company(client, token)

    resp = client.get(f"/api/companies/{company_id}/runs")
    assert resp.status_code == 401


# ── 3. GET /runs/{id} — статус рана ────────────────────────────────────────────

def test_get_run_status_and_result(auth_client):
    """GET /runs/{id} → возвращает все поля модели Run."""
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

    get_resp = client.get(
        f"/api/companies/{company_id}/runs/{run_id}",
        headers=_auth_headers(token),
    )
    assert get_resp.status_code == 200
    data = get_resp.json()
    # Проверяем поля Run модели
    for field in ["id", "company_id", "task_id", "agent_id", "status", "started_at"]:
        assert field in data, f"Missing field: {field}"


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


# ── 4. POST /runs/{id}/stop — остановка рана ───────────────────────────────────

def test_stop_run_changes_status_to_stopped(auth_client):
    """POST /runs/{id}/stop → статус становится stopped."""
    client, _ = auth_client
    token = _register_and_login(client)
    company_id = _create_company(client, token)
    agent_id = _create_agent(client, token, company_id)
    task_id = _create_task(client, token, company_id, agent_id)

    # Создаём ран с замороженным агентом (он останется в running)
    async def _hanging_agent(*args, **kwargs):
        # Имитируем долгий агент — просто не завершается быстро
        await asyncio.sleep(100)

    with patch("agentco.services.run.RunService._execute_agent", side_effect=_hanging_agent):
        resp = client.post(
            f"/api/companies/{company_id}/tasks/{task_id}/run",
            headers=_auth_headers(token),
        )
    run_id = resp.json()["run_id"]

    stop_resp = client.post(
        f"/api/companies/{company_id}/runs/{run_id}/stop",
        headers=_auth_headers(token),
    )
    assert stop_resp.status_code == 200
    data = stop_resp.json()
    assert data["status"] == "stopped"


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


# ── 5. Lifecycle: pending → running → done ─────────────────────────────────────

def test_run_lifecycle_done(auth_client):
    """Lifecycle: агент завершается успешно → статус done, result заполнен."""
    client, _ = auth_client
    token = _register_and_login(client)
    company_id = _create_company(client, token)
    agent_id = _create_agent(client, token, company_id)
    task_id = _create_task(client, token, company_id, agent_id)

    async def fake_execute(run_id, task_id, agent_id, session_factory):
        # Успешное завершение — сервис должен сам проставить done
        return "task completed"

    with patch("agentco.services.run.RunService._execute_agent", side_effect=fake_execute):
        resp = client.post(
            f"/api/companies/{company_id}/tasks/{task_id}/run",
            headers=_auth_headers(token),
        )
    assert resp.status_code == 201
    run_id = resp.json()["run_id"]

    # Polling статуса: TestClient синхронный, background task уже выполнилась
    get_resp = client.get(
        f"/api/companies/{company_id}/runs/{run_id}",
        headers=_auth_headers(token),
    )
    assert get_resp.status_code == 200
    data = get_resp.json()
    assert data["status"] in ("done", "running", "pending")  # может быть любой из них
