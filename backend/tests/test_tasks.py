"""
M1-004: Tasks CRUD + FSM статусов — TDD.

Tests are written first (red), then code makes them green.

FSM: todo → in_progress → done (+ failed). Остальные переходы → 422.

Run: uv run pytest tests/test_tasks.py -v
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
    resp = client.post(
        "/api/companies/",
        json={"name": name},
        headers=_auth_headers(token),
    )
    assert resp.status_code == 201
    return resp.json()["id"]


def _create_agent(client, token, company_id, name="Worker Agent", role="worker"):
    resp = client.post(
        f"/api/companies/{company_id}/agents",
        json={"name": name, "role": role, "system_prompt": "You are a worker", "model": "gpt-4o-mini"},
        headers=_auth_headers(token),
    )
    assert resp.status_code == 201
    return resp.json()["id"]


def _create_task(client, token, company_id, agent_id, title="Test Task", description="Do something"):
    return client.post(
        f"/api/companies/{company_id}/agents/{agent_id}/tasks",
        json={"title": title, "description": description},
        headers=_auth_headers(token),
    )


# ── AC: POST /companies/{company_id}/agents/{agent_id}/tasks ─────────────────

def test_create_task_requires_jwt(auth_client):
    """POST без токена → 401."""
    client, _ = auth_client
    token = _register_and_login(client)
    company_id = _create_company(client, token)
    agent_id = _create_agent(client, token, company_id)

    resp = client.post(
        f"/api/companies/{company_id}/agents/{agent_id}/tasks",
        json={"title": "Task 1"},
    )
    assert resp.status_code == 401


def test_create_task_returns_201(auth_client):
    """POST с JWT → 201."""
    client, _ = auth_client
    token = _register_and_login(client)
    company_id = _create_company(client, token)
    agent_id = _create_agent(client, token, company_id)

    resp = _create_task(client, token, company_id, agent_id)
    assert resp.status_code == 201


def test_create_task_response_schema(auth_client):
    """POST → 201, ответ содержит id, title, description, status=todo, agent_id, company_id."""
    client, _ = auth_client
    token = _register_and_login(client)
    company_id = _create_company(client, token)
    agent_id = _create_agent(client, token, company_id)

    resp = _create_task(client, token, company_id, agent_id, title="My Task", description="Do it")
    assert resp.status_code == 201
    data = resp.json()
    assert "id" in data
    assert data["title"] == "My Task"
    assert data["description"] == "Do it"
    assert data["status"] == "todo"
    assert data["agent_id"] == agent_id
    assert data["company_id"] == company_id


def test_create_task_ownership_check(auth_client):
    """POST в чужую компанию → 404."""
    client, _ = auth_client
    token_alice = _register_and_login(client, email="alice_tc@example.com")
    token_bob = _register_and_login(client, email="bob_tc@example.com")

    company_id = _create_company(client, token_alice, "Alice Corp")
    agent_id = _create_agent(client, token_alice, company_id)

    resp = _create_task(client, token_bob, company_id, agent_id)
    assert resp.status_code == 404


def test_create_task_agent_not_found(auth_client):
    """POST с несуществующим агентом → 404."""
    client, _ = auth_client
    token = _register_and_login(client)
    company_id = _create_company(client, token)

    resp = _create_task(client, token, company_id, "nonexistent-agent")
    assert resp.status_code == 404


# ── AC: GET /companies/{company_id}/agents/{agent_id}/tasks ──────────────────

def test_list_tasks_requires_jwt(auth_client):
    """GET без токена → 401."""
    client, _ = auth_client
    token = _register_and_login(client)
    company_id = _create_company(client, token)
    agent_id = _create_agent(client, token, company_id)

    resp = client.get(f"/api/companies/{company_id}/agents/{agent_id}/tasks")
    assert resp.status_code == 401


def test_list_tasks_returns_200(auth_client):
    """GET с JWT → 200."""
    client, _ = auth_client
    token = _register_and_login(client)
    company_id = _create_company(client, token)
    agent_id = _create_agent(client, token, company_id)

    resp = client.get(
        f"/api/companies/{company_id}/agents/{agent_id}/tasks",
        headers=_auth_headers(token),
    )
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


def test_list_tasks_returns_agent_tasks(auth_client):
    """GET → список задач агента."""
    client, _ = auth_client
    token = _register_and_login(client)
    company_id = _create_company(client, token)
    agent_id = _create_agent(client, token, company_id)

    _create_task(client, token, company_id, agent_id, title="Task A")
    _create_task(client, token, company_id, agent_id, title="Task B")

    resp = client.get(
        f"/api/companies/{company_id}/agents/{agent_id}/tasks",
        headers=_auth_headers(token),
    )
    assert resp.status_code == 200
    titles = [t["title"] for t in resp.json()]
    assert "Task A" in titles
    assert "Task B" in titles


def test_list_tasks_ownership_check(auth_client):
    """GET чужого агента → 404."""
    client, _ = auth_client
    token_alice = _register_and_login(client, email="alice_lt@example.com")
    token_bob = _register_and_login(client, email="bob_lt@example.com")

    company_id = _create_company(client, token_alice, "Alice Corp")
    agent_id = _create_agent(client, token_alice, company_id)

    resp = client.get(
        f"/api/companies/{company_id}/agents/{agent_id}/tasks",
        headers=_auth_headers(token_bob),
    )
    assert resp.status_code == 404


# ── AC: GET /companies/{company_id}/agents/{agent_id}/tasks/{task_id} ────────

def test_get_task_requires_jwt(auth_client):
    """GET /{task_id} без токена → 401."""
    client, _ = auth_client
    token = _register_and_login(client)
    company_id = _create_company(client, token)
    agent_id = _create_agent(client, token, company_id)
    task_id = _create_task(client, token, company_id, agent_id).json()["id"]

    resp = client.get(f"/api/companies/{company_id}/agents/{agent_id}/tasks/{task_id}")
    assert resp.status_code == 401


def test_get_task_returns_200(auth_client):
    """GET /{task_id} с JWT → 200."""
    client, _ = auth_client
    token = _register_and_login(client)
    company_id = _create_company(client, token)
    agent_id = _create_agent(client, token, company_id)
    task_id = _create_task(client, token, company_id, agent_id).json()["id"]

    resp = client.get(
        f"/api/companies/{company_id}/agents/{agent_id}/tasks/{task_id}",
        headers=_auth_headers(token),
    )
    assert resp.status_code == 200
    assert resp.json()["id"] == task_id


def test_get_task_returns_404_unknown(auth_client):
    """GET /unknown → 404."""
    client, _ = auth_client
    token = _register_and_login(client)
    company_id = _create_company(client, token)
    agent_id = _create_agent(client, token, company_id)

    resp = client.get(
        f"/api/companies/{company_id}/agents/{agent_id}/tasks/nonexistent-task",
        headers=_auth_headers(token),
    )
    assert resp.status_code == 404


def test_get_task_ownership_check(auth_client):
    """GET чужой задачи → 404."""
    client, _ = auth_client
    token_alice = _register_and_login(client, email="alice_gt@example.com")
    token_bob = _register_and_login(client, email="bob_gt@example.com")

    company_id = _create_company(client, token_alice, "Alice Corp")
    agent_id = _create_agent(client, token_alice, company_id)
    task_id = _create_task(client, token_alice, company_id, agent_id).json()["id"]

    resp = client.get(
        f"/api/companies/{company_id}/agents/{agent_id}/tasks/{task_id}",
        headers=_auth_headers(token_bob),
    )
    assert resp.status_code == 404


# ── AC: PUT /companies/{company_id}/agents/{agent_id}/tasks/{task_id} ────────

def test_update_task_requires_jwt(auth_client):
    """PUT без токена → 401."""
    client, _ = auth_client
    token = _register_and_login(client)
    company_id = _create_company(client, token)
    agent_id = _create_agent(client, token, company_id)
    task_id = _create_task(client, token, company_id, agent_id).json()["id"]

    resp = client.put(
        f"/api/companies/{company_id}/agents/{agent_id}/tasks/{task_id}",
        json={"title": "Updated"},
    )
    assert resp.status_code == 401


def test_update_task_returns_200(auth_client):
    """PUT с JWT → 200 с обновлённой задачей."""
    client, _ = auth_client
    token = _register_and_login(client)
    company_id = _create_company(client, token)
    agent_id = _create_agent(client, token, company_id)
    task_id = _create_task(client, token, company_id, agent_id, title="Old Title").json()["id"]

    resp = client.put(
        f"/api/companies/{company_id}/agents/{agent_id}/tasks/{task_id}",
        json={"title": "New Title", "description": "Updated desc"},
        headers=_auth_headers(token),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["title"] == "New Title"
    assert data["description"] == "Updated desc"


def test_update_task_returns_404_unknown(auth_client):
    """PUT /unknown → 404."""
    client, _ = auth_client
    token = _register_and_login(client)
    company_id = _create_company(client, token)
    agent_id = _create_agent(client, token, company_id)

    resp = client.put(
        f"/api/companies/{company_id}/agents/{agent_id}/tasks/nonexistent",
        json={"title": "X"},
        headers=_auth_headers(token),
    )
    assert resp.status_code == 404


def test_update_task_ownership_check(auth_client):
    """PUT чужой задачи → 404."""
    client, _ = auth_client
    token_alice = _register_and_login(client, email="alice_ut@example.com")
    token_bob = _register_and_login(client, email="bob_ut@example.com")

    company_id = _create_company(client, token_alice, "Alice Corp")
    agent_id = _create_agent(client, token_alice, company_id)
    task_id = _create_task(client, token_alice, company_id, agent_id).json()["id"]

    resp = client.put(
        f"/api/companies/{company_id}/agents/{agent_id}/tasks/{task_id}",
        json={"title": "Hacked"},
        headers=_auth_headers(token_bob),
    )
    assert resp.status_code == 404


# ── AC: PATCH /.../{task_id}/status — FSM ────────────────────────────────────

def test_patch_status_requires_jwt(auth_client):
    """PATCH /status без токена → 401."""
    client, _ = auth_client
    token = _register_and_login(client)
    company_id = _create_company(client, token)
    agent_id = _create_agent(client, token, company_id)
    task_id = _create_task(client, token, company_id, agent_id).json()["id"]

    resp = client.patch(
        f"/api/companies/{company_id}/agents/{agent_id}/tasks/{task_id}/status",
        json={"status": "in_progress"},
    )
    assert resp.status_code == 401


def test_patch_status_todo_to_in_progress(auth_client):
    """todo → in_progress валидный переход → 200."""
    client, _ = auth_client
    token = _register_and_login(client)
    company_id = _create_company(client, token)
    agent_id = _create_agent(client, token, company_id)
    task_id = _create_task(client, token, company_id, agent_id).json()["id"]

    resp = client.patch(
        f"/api/companies/{company_id}/agents/{agent_id}/tasks/{task_id}/status",
        json={"status": "in_progress"},
        headers=_auth_headers(token),
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "in_progress"


def test_patch_status_in_progress_to_done(auth_client):
    """in_progress → done валидный переход → 200."""
    client, _ = auth_client
    token = _register_and_login(client)
    company_id = _create_company(client, token)
    agent_id = _create_agent(client, token, company_id)
    task_id = _create_task(client, token, company_id, agent_id).json()["id"]

    client.patch(
        f"/api/companies/{company_id}/agents/{agent_id}/tasks/{task_id}/status",
        json={"status": "in_progress"},
        headers=_auth_headers(token),
    )
    resp = client.patch(
        f"/api/companies/{company_id}/agents/{agent_id}/tasks/{task_id}/status",
        json={"status": "done"},
        headers=_auth_headers(token),
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "done"


def test_patch_status_in_progress_to_failed(auth_client):
    """in_progress → failed валидный переход → 200."""
    client, _ = auth_client
    token = _register_and_login(client)
    company_id = _create_company(client, token)
    agent_id = _create_agent(client, token, company_id)
    task_id = _create_task(client, token, company_id, agent_id).json()["id"]

    client.patch(
        f"/api/companies/{company_id}/agents/{agent_id}/tasks/{task_id}/status",
        json={"status": "in_progress"},
        headers=_auth_headers(token),
    )
    resp = client.patch(
        f"/api/companies/{company_id}/agents/{agent_id}/tasks/{task_id}/status",
        json={"status": "failed"},
        headers=_auth_headers(token),
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "failed"


def test_patch_status_invalid_todo_to_done(auth_client):
    """todo → done невалидный переход → 422."""
    client, _ = auth_client
    token = _register_and_login(client)
    company_id = _create_company(client, token)
    agent_id = _create_agent(client, token, company_id)
    task_id = _create_task(client, token, company_id, agent_id).json()["id"]

    resp = client.patch(
        f"/api/companies/{company_id}/agents/{agent_id}/tasks/{task_id}/status",
        json={"status": "done"},
        headers=_auth_headers(token),
    )
    assert resp.status_code == 422


def test_patch_status_invalid_todo_to_failed(auth_client):
    """todo → failed невалидный переход → 422."""
    client, _ = auth_client
    token = _register_and_login(client)
    company_id = _create_company(client, token)
    agent_id = _create_agent(client, token, company_id)
    task_id = _create_task(client, token, company_id, agent_id).json()["id"]

    resp = client.patch(
        f"/api/companies/{company_id}/agents/{agent_id}/tasks/{task_id}/status",
        json={"status": "failed"},
        headers=_auth_headers(token),
    )
    assert resp.status_code == 422


def test_patch_status_invalid_done_to_anything(auth_client):
    """done → * невалидный переход → 422."""
    client, _ = auth_client
    token = _register_and_login(client)
    company_id = _create_company(client, token)
    agent_id = _create_agent(client, token, company_id)
    task_id = _create_task(client, token, company_id, agent_id).json()["id"]

    # Move to done
    client.patch(
        f"/api/companies/{company_id}/agents/{agent_id}/tasks/{task_id}/status",
        json={"status": "in_progress"},
        headers=_auth_headers(token),
    )
    client.patch(
        f"/api/companies/{company_id}/agents/{agent_id}/tasks/{task_id}/status",
        json={"status": "done"},
        headers=_auth_headers(token),
    )
    resp = client.patch(
        f"/api/companies/{company_id}/agents/{agent_id}/tasks/{task_id}/status",
        json={"status": "in_progress"},
        headers=_auth_headers(token),
    )
    assert resp.status_code == 422


def test_patch_status_ownership_check(auth_client):
    """PATCH чужой задачи → 404."""
    client, _ = auth_client
    token_alice = _register_and_login(client, email="alice_ps@example.com")
    token_bob = _register_and_login(client, email="bob_ps@example.com")

    company_id = _create_company(client, token_alice, "Alice Corp")
    agent_id = _create_agent(client, token_alice, company_id)
    task_id = _create_task(client, token_alice, company_id, agent_id).json()["id"]

    resp = client.patch(
        f"/api/companies/{company_id}/agents/{agent_id}/tasks/{task_id}/status",
        json={"status": "in_progress"},
        headers=_auth_headers(token_bob),
    )
    assert resp.status_code == 404


# ── AC: DELETE /companies/{company_id}/agents/{agent_id}/tasks/{task_id} ─────

def test_delete_task_requires_jwt(auth_client):
    """DELETE без токена → 401."""
    client, _ = auth_client
    token = _register_and_login(client)
    company_id = _create_company(client, token)
    agent_id = _create_agent(client, token, company_id)
    task_id = _create_task(client, token, company_id, agent_id).json()["id"]

    resp = client.delete(
        f"/api/companies/{company_id}/agents/{agent_id}/tasks/{task_id}"
    )
    assert resp.status_code == 401


def test_delete_task_returns_204(auth_client):
    """DELETE с JWT → 204."""
    client, _ = auth_client
    token = _register_and_login(client)
    company_id = _create_company(client, token)
    agent_id = _create_agent(client, token, company_id)
    task_id = _create_task(client, token, company_id, agent_id).json()["id"]

    resp = client.delete(
        f"/api/companies/{company_id}/agents/{agent_id}/tasks/{task_id}",
        headers=_auth_headers(token),
    )
    assert resp.status_code == 204


def test_delete_task_actually_deletes(auth_client):
    """После DELETE задача не находится."""
    client, _ = auth_client
    token = _register_and_login(client)
    company_id = _create_company(client, token)
    agent_id = _create_agent(client, token, company_id)
    task_id = _create_task(client, token, company_id, agent_id).json()["id"]

    client.delete(
        f"/api/companies/{company_id}/agents/{agent_id}/tasks/{task_id}",
        headers=_auth_headers(token),
    )
    resp = client.get(
        f"/api/companies/{company_id}/agents/{agent_id}/tasks/{task_id}",
        headers=_auth_headers(token),
    )
    assert resp.status_code == 404


def test_delete_task_ownership_check(auth_client):
    """DELETE чужой задачи → 404."""
    client, _ = auth_client
    token_alice = _register_and_login(client, email="alice_dt@example.com")
    token_bob = _register_and_login(client, email="bob_dt@example.com")

    company_id = _create_company(client, token_alice, "Alice Corp")
    agent_id = _create_agent(client, token_alice, company_id)
    task_id = _create_task(client, token_alice, company_id, agent_id).json()["id"]

    resp = client.delete(
        f"/api/companies/{company_id}/agents/{agent_id}/tasks/{task_id}",
        headers=_auth_headers(token_bob),
    )
    assert resp.status_code == 404


# ── BUG-006: TaskCreate.title min_length=1 ────────────────────────────────────

def test_create_task_empty_title_returns_422(auth_client):
    """BUG-006: POST с title="" должен вернуть 422, а не 201."""
    client, _ = auth_client
    token = _register_and_login(client, email="bug006@example.com")
    company_id = _create_company(client, token)
    agent_id = _create_agent(client, token, company_id)

    resp = client.post(
        f"/api/companies/{company_id}/agents/{agent_id}/tasks",
        json={"title": ""},
        headers=_auth_headers(token),
    )
    assert resp.status_code == 422


def test_create_task_whitespace_title_returns_422(auth_client):
    """BUG-008: POST с title="   " (только пробелы) должен вернуть 422."""
    client, _ = auth_client
    token = _register_and_login(client, email="bug008@example.com")
    company_id = _create_company(client, token)
    agent_id = _create_agent(client, token, company_id)

    resp = client.post(
        f"/api/companies/{company_id}/agents/{agent_id}/tasks",
        json={"title": "   "},
        headers=_auth_headers(token),
    )
    assert resp.status_code == 422


# ── ALEX-TD-013: TaskUpdate.title whitespace validation ──────────────────────

def test_update_task_whitespace_title_returns_422(auth_client):
    """ALEX-TD-013: PUT с title='   ' (только пробелы) должен вернуть 422."""
    client, _ = auth_client
    token = _register_and_login(client, email="td013@example.com")
    company_id = _create_company(client, token)
    agent_id = _create_agent(client, token, company_id)
    task_resp = _create_task(client, token, company_id, agent_id, title="Valid Title")
    task_id = task_resp.json()["id"]

    resp = client.put(
        f"/api/companies/{company_id}/agents/{agent_id}/tasks/{task_id}",
        json={"title": "   "},
        headers=_auth_headers(token),
    )
    assert resp.status_code == 422
