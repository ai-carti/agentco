"""
TDD тесты для ALEX-TD-205, 206, 207.

ALEX-TD-205 (minor): orchestration/agent_node.py:_build_messages_with_memory —
    memory inject ignores total_tokens limit.
ALEX-TD-206 (minor): services/run.py:_execute_agent — retry strategy не задокументирована в .env.example.
ALEX-TD-207 (minor): handlers/runs.py:list_runs — company_id URL param не проверяется на UUID.

Run: uv run pytest tests/test_alex_td_205_206_207.py -v
"""
from __future__ import annotations

import inspect
import uuid
from unittest.mock import AsyncMock, patch

import pytest


# ─── Helpers ─────────────────────────────────────────────────────────────────

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


# ─── ALEX-TD-205: memory inject ignores total_tokens limit ───────────────────

@pytest.mark.asyncio
async def test_build_messages_skips_memory_inject_when_token_limit_reached():
    """
    ALEX-TD-205: _build_messages_with_memory must skip memory injection
    when state.get("total_tokens", 0) >= _get_max_tokens().
    This prevents an expensive LLM call that will immediately fail the limit check.
    """
    from agentco.orchestration.agent_node import _build_messages_with_memory, _memory_service_var
    from agentco.orchestration.nodes import _get_max_tokens

    max_tokens = _get_max_tokens()

    # Mock memory service — inject_memories should NOT be called
    mock_memory = AsyncMock()
    mock_memory.inject_memories = AsyncMock(return_value="injected prompt")

    token = _memory_service_var.set(mock_memory)
    try:
        state = {
            "system_prompt": "You are a CEO.",
            "agent_id": "ceo",
            "input": "Build a product",
            "messages": [{"role": "user", "content": "Start"}],
            "total_tokens": max_tokens,  # exactly at limit
        }
        messages = await _build_messages_with_memory(state)
    finally:
        _memory_service_var.reset(token)

    # inject_memories must NOT have been called
    mock_memory.inject_memories.assert_not_called()
    # system_prompt should be base (not injected)
    assert messages[0]["content"] == "You are a CEO."


@pytest.mark.asyncio
async def test_build_messages_skips_memory_inject_when_token_limit_exceeded():
    """
    ALEX-TD-205: skip inject when total_tokens > _get_max_tokens() (exceeded, not just reached).
    """
    from agentco.orchestration.agent_node import _build_messages_with_memory, _memory_service_var
    from agentco.orchestration.nodes import _get_max_tokens

    max_tokens = _get_max_tokens()

    mock_memory = AsyncMock()
    mock_memory.inject_memories = AsyncMock(return_value="injected prompt")

    token = _memory_service_var.set(mock_memory)
    try:
        state = {
            "system_prompt": "You are a CEO.",
            "agent_id": "ceo",
            "input": "Build a product",
            "messages": [],
            "total_tokens": max_tokens + 1000,  # well over the limit
        }
        messages = await _build_messages_with_memory(state)
    finally:
        _memory_service_var.reset(token)

    mock_memory.inject_memories.assert_not_called()


@pytest.mark.asyncio
async def test_build_messages_injects_memory_when_under_token_limit():
    """
    ALEX-TD-205: inject_memories IS called when total_tokens < _get_max_tokens().
    Normal path must still work.
    """
    from agentco.orchestration.agent_node import _build_messages_with_memory, _memory_service_var
    from agentco.orchestration.nodes import _get_max_tokens

    max_tokens = _get_max_tokens()

    mock_memory = AsyncMock()
    mock_memory.inject_memories = AsyncMock(return_value="injected: You are a CEO.")

    token = _memory_service_var.set(mock_memory)
    try:
        state = {
            "system_prompt": "You are a CEO.",
            "agent_id": "ceo",
            "input": "Build a product",
            "messages": [],
            "total_tokens": max_tokens - 1000,  # well under the limit
        }
        messages = await _build_messages_with_memory(state)
    finally:
        _memory_service_var.reset(token)

    # inject_memories MUST have been called
    mock_memory.inject_memories.assert_called_once()
    # system_prompt should be the injected version
    assert messages[0]["content"] == "injected: You are a CEO."


@pytest.mark.asyncio
async def test_build_messages_skips_inject_when_no_tokens_key():
    """
    ALEX-TD-205: when total_tokens not in state (defaults to 0), inject happens normally.
    Verify the default-0 path doesn't accidentally skip injection.
    """
    from agentco.orchestration.agent_node import _build_messages_with_memory, _memory_service_var
    from agentco.orchestration.nodes import _get_max_tokens

    mock_memory = AsyncMock()
    mock_memory.inject_memories = AsyncMock(return_value="injected prompt")

    token = _memory_service_var.set(mock_memory)
    try:
        state = {
            "system_prompt": "Base prompt",
            "agent_id": "worker",
            "input": "Do stuff",
            "messages": [],
            # total_tokens not set → defaults to 0 → well under limit
        }
        await _build_messages_with_memory(state)
    finally:
        _memory_service_var.reset(token)

    # Under limit → inject should be called
    mock_memory.inject_memories.assert_called_once()


# ─── ALEX-TD-206: RUN_MAX_RETRIES documented in .env.example ─────────────────

def test_env_example_documents_run_max_retries_scope():
    """
    ALEX-TD-206: .env.example must include a comment explaining that RUN_MAX_RETRIES
    applies per-execute_run call (not per-agent-step).
    """
    import os
    env_example_path = os.path.join(
        os.path.dirname(__file__), "..", ".env.example"
    )
    with open(env_example_path) as f:
        content = f.read()

    assert "RUN_MAX_RETRIES" in content, ".env.example must mention RUN_MAX_RETRIES"

    # The comment must explain the scope: per-execute_run, not per-agent-step
    assert "per-execute_run" in content or "per execute_run" in content, (
        "ALEX-TD-206: .env.example must document that RUN_MAX_RETRIES is per-execute_run call, "
        "not per-agent-step. Add a comment explaining this."
    )


# ─── ALEX-TD-207: UUID validation for path params ────────────────────────────

def test_list_runs_invalid_company_id_returns_422(auth_client):
    """
    ALEX-TD-207: GET /api/companies/{company_id}/runs with invalid UUID
    must return 422 (not 404 or 200).
    FastAPI auto-validates uuid.UUID path params and returns 422 for invalid input.
    """
    client, _ = auth_client
    token = _register_and_login(client)

    invalid_company_id = "'; DROP TABLE companies;--"
    resp = client.get(
        f"/api/companies/{invalid_company_id}/runs",
        headers=_auth_headers(token),
    )
    assert resp.status_code == 422, (
        f"ALEX-TD-207: Expected 422 for invalid UUID company_id, got {resp.status_code}. "
        "Change company_id path param type to uuid.UUID in runs handler."
    )


def test_list_runs_valid_uuid_but_nonexistent_returns_404(auth_client):
    """
    ALEX-TD-207: GET /runs with a valid UUID format (but nonexistent company)
    must return 404, NOT 422.
    """
    client, _ = auth_client
    token = _register_and_login(client)

    valid_uuid = str(uuid.uuid4())
    resp = client.get(
        f"/api/companies/{valid_uuid}/runs",
        headers=_auth_headers(token),
    )
    assert resp.status_code == 404, (
        f"ALEX-TD-207: Valid UUID with nonexistent company should return 404, got {resp.status_code}."
    )


def test_create_run_invalid_company_id_returns_422(auth_client):
    """
    ALEX-TD-207: POST /api/companies/{company_id}/runs with invalid UUID returns 422.
    """
    client, _ = auth_client
    token = _register_and_login(client)

    resp = client.post(
        "/api/companies/not-a-uuid/runs",
        json={"goal": "Build something"},
        headers=_auth_headers(token),
    )
    assert resp.status_code == 422, (
        f"ALEX-TD-207: Expected 422 for invalid UUID, got {resp.status_code}."
    )


def test_get_run_invalid_run_id_returns_422(auth_client):
    """
    ALEX-TD-207: GET /api/companies/{company_id}/runs/{run_id} with invalid run_id returns 422.
    """
    client, _ = auth_client
    token = _register_and_login(client)

    valid_company = str(uuid.uuid4())
    resp = client.get(
        f"/api/companies/{valid_company}/runs/not-a-uuid",
        headers=_auth_headers(token),
    )
    assert resp.status_code == 422, (
        f"ALEX-TD-207: Expected 422 for invalid run_id UUID, got {resp.status_code}."
    )


def test_list_agents_invalid_company_id_returns_422(auth_client):
    """
    ALEX-TD-207: GET /api/companies/{company_id}/agents with invalid UUID returns 422.
    """
    client, _ = auth_client
    token = _register_and_login(client)

    resp = client.get(
        "/api/companies/not-a-uuid/agents",
        headers=_auth_headers(token),
    )
    assert resp.status_code == 422, (
        f"ALEX-TD-207: Expected 422 for invalid UUID company_id in agents, got {resp.status_code}."
    )


def test_list_tasks_invalid_agent_id_returns_422(auth_client):
    """
    ALEX-TD-207: GET /api/companies/{company_id}/agents/{agent_id}/tasks
    with invalid agent_id returns 422.
    """
    client, _ = auth_client
    token = _register_and_login(client)

    valid_company = str(uuid.uuid4())
    resp = client.get(
        f"/api/companies/{valid_company}/agents/not-a-uuid/tasks",
        headers=_auth_headers(token),
    )
    assert resp.status_code == 422, (
        f"ALEX-TD-207: Expected 422 for invalid UUID agent_id in tasks, got {resp.status_code}."
    )


def test_get_company_invalid_id_returns_422(auth_client):
    """
    ALEX-TD-207: GET /api/companies/{company_id} with invalid UUID returns 422.
    """
    client, _ = auth_client
    token = _register_and_login(client)

    resp = client.get(
        "/api/companies/not-a-uuid",
        headers=_auth_headers(token),
    )
    assert resp.status_code == 422, (
        f"ALEX-TD-207: Expected 422 for invalid UUID company_id in companies, got {resp.status_code}."
    )
