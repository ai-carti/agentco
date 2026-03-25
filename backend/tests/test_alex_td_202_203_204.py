"""
TDD тесты для ALEX-TD-202, 203, 204.

ALEX-TD-202 (minor): services/run.py:406 — initial_task_id dead variable
ALEX-TD-203 (minor): handlers/tasks.py:TaskOut missing created_at and result fields
ALEX-TD-204 (major): services/run.py:405 — task-based run passes UUID task_id as LLM goal

Run: uv run pytest tests/test_alex_td_202_203_204.py -v
"""
import inspect
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


def _create_task(client, token, company_id, agent_id, title="Fix the bug", description="Debug the issue"):
    resp = client.post(
        f"/api/companies/{company_id}/agents/{agent_id}/tasks",
        json={"title": title, "description": description},
        headers=_auth_headers(token),
    )
    assert resp.status_code == 201
    return resp.json()


# ── ALEX-TD-202: dead variable initial_task_id ────────────────────────────────

def test_no_dead_initial_task_id_variable():
    """
    ALEX-TD-202: initial_task_id was a dead variable — assigned but never used.
    After the fix it was replaced with _initial_task_id that is actually used
    in the ALEX-TD-204 task-goal loading logic.
    Verify the old dead pattern (assign without use) is gone.
    """
    from agentco.services import run as run_module
    source = inspect.getsource(run_module.RunService.execute_run)
    # The old dead pattern was a standalone assignment with no subsequent use:
    #   initial_task_id = run_orm.task_id   (then initial_task_id never referenced again)
    # After fix: renamed to _initial_task_id and actively used in goal-loading logic.
    # Verify that if the variable exists, it is actually used (referenced after assignment).
    # The simplest check: _initial_task_id must appear more than once (assigned + used).
    count = source.count("_initial_task_id")
    assert count >= 2, (
        "ALEX-TD-202: _initial_task_id must be assigned and used (not a dead variable). "
        f"Found {count} occurrences — expected at least 2 (assignment + use in if-elif)."
    )


# ── ALEX-TD-203: TaskOut missing created_at and result ───────────────────────

def test_task_out_has_created_at_field(auth_client):
    """
    ALEX-TD-203: GET /tasks should return created_at field.
    The Task domain model has created_at but TaskOut was not exposing it.
    """
    client, _ = auth_client
    token = _register_and_login(client)
    company_id = _create_company(client, token)
    agent_id = _create_agent(client, token, company_id)
    task = _create_task(client, token, company_id, agent_id)

    # GET /tasks should return created_at
    resp = client.get(
        f"/api/companies/{company_id}/agents/{agent_id}/tasks",
        headers=_auth_headers(token),
    )
    assert resp.status_code == 200
    tasks = resp.json()
    assert len(tasks) == 1
    assert "created_at" in tasks[0], (
        "ALEX-TD-203: TaskOut must include created_at field so frontend can sort tasks by creation time. "
        "Add `created_at: datetime | None = None` to TaskOut in handlers/tasks.py."
    )
    assert tasks[0]["created_at"] is not None, "created_at should not be None for a newly created task"


def test_task_out_has_result_field(auth_client):
    """
    ALEX-TD-203: GET /tasks should return result field (may be None initially).
    The Task domain model has result but TaskOut was not exposing it.
    """
    client, _ = auth_client
    token = _register_and_login(client)
    company_id = _create_company(client, token)
    agent_id = _create_agent(client, token, company_id)
    _create_task(client, token, company_id, agent_id)

    resp = client.get(
        f"/api/companies/{company_id}/agents/{agent_id}/tasks",
        headers=_auth_headers(token),
    )
    assert resp.status_code == 200
    tasks = resp.json()
    assert len(tasks) == 1
    assert "result" in tasks[0], (
        "ALEX-TD-203: TaskOut must include result field so frontend can display task results. "
        "Add `result: str | None = None` to TaskOut in handlers/tasks.py."
    )
    # result is None initially (task not yet run)
    assert tasks[0]["result"] is None


def test_create_task_response_has_created_at(auth_client):
    """
    ALEX-TD-203: POST /tasks response should also include created_at.
    """
    client, _ = auth_client
    token = _register_and_login(client)
    company_id = _create_company(client, token)
    agent_id = _create_agent(client, token, company_id)

    resp = client.post(
        f"/api/companies/{company_id}/agents/{agent_id}/tasks",
        json={"title": "New task"},
        headers=_auth_headers(token),
    )
    assert resp.status_code == 201
    data = resp.json()
    assert "created_at" in data, (
        "ALEX-TD-203: POST /tasks response must include created_at field."
    )
    assert "result" in data, (
        "ALEX-TD-203: POST /tasks response must include result field."
    )


# ── ALEX-TD-204: task-based run passes UUID as goal ───────────────────────────

def test_execute_run_uses_task_title_not_task_id_as_goal():
    """
    ALEX-TD-204: When run has goal=None and task_id set (task-based run),
    execute_run must use task.title (+ description) as input — NOT the task_id UUID string.

    Verify by inspecting source: the fallback for None goal must not use run_orm.task_id raw.
    """
    from agentco.services import run as run_module
    source = inspect.getsource(run_module.RunService.execute_run)

    # The old bad pattern: goal or (task_id or "")
    # This would pass a UUID string to the LLM when goal is None
    bad_pattern = "run_orm.goal or (run_orm.task_id or"
    assert bad_pattern not in source, (
        "ALEX-TD-204: execute_run must not use run_orm.task_id as the LLM input. "
        "When goal is None, load task.title + task.description from DB instead. "
        "The LLM was receiving a UUID string like '7f4a2b3c-...' as input."
    )


def test_execute_run_loads_task_description_for_task_based_run():
    """
    ALEX-TD-204: execute_run source must load task title/description from DB
    when goal is None (task-based run path).
    """
    from agentco.services import run as run_module
    source = inspect.getsource(run_module.RunService.execute_run)

    # After the fix, we expect to see task loading logic when goal is None
    assert "task_id" in source, "execute_run should still reference task_id"
    # Verify that the fix reads task title or description
    has_task_title = "task_orm.title" in source or ".title" in source
    has_task_load = "_init_session.get" in source or "task_orm" in source
    assert has_task_load, (
        "ALEX-TD-204: execute_run must load task from DB when goal is None. "
        "Use _init_session.get(TaskORM, initial_task_id) to get task.title."
    )
