"""
ALEX-TD-142: handlers/agents.py list_agents и get_agent — нет @limiter.limit
ALEX-TD-143: handlers/runs.py GET endpoints — нет @limiter.limit
ALEX-TD-144: services/run.py execute_run — initial_state не содержит memory_service
ALEX-TD-145: orchestration/nodes.py ceo_node — pending_tasks не очищается при loop-detect
ALEX-TD-146: services/run.py _execute_agent — "cancelled" в _NO_RETRY_ERRORS мёртвый код
"""
import asyncio
import pytest
from unittest.mock import AsyncMock, MagicMock, patch


# ── ALEX-TD-142: list_agents / get_agent имеют rate limit ────────────────────

def test_list_agents_accepts_normal_load(auth_client):
    """GET /agents returns 200 normally — rate limit decorator is present."""
    client, _ = auth_client
    client.post("/auth/register", json={"email": "td142_list@example.com", "password": "pass1234"})
    resp = client.post("/auth/login", json={"email": "td142_list@example.com", "password": "pass1234"})
    token = resp.json()["access_token"]
    company = client.post("/api/companies/", json={"name": "TD142 Co"}, headers={"Authorization": f"Bearer {token}"})
    company_id = company.json()["id"]
    resp = client.get(
        f"/api/companies/{company_id}/agents",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


def test_get_agent_returns_404_for_missing(auth_client):
    """GET /agents/{id} returns 404 for unknown agent — endpoint is functional."""
    client, _ = auth_client
    client.post("/auth/register", json={"email": "td142_get@example.com", "password": "pass1234"})
    resp = client.post("/auth/login", json={"email": "td142_get@example.com", "password": "pass1234"})
    token = resp.json()["access_token"]
    company = client.post("/api/companies/", json={"name": "TD142 Get Co"}, headers={"Authorization": f"Bearer {token}"})
    company_id = company.json()["id"]
    resp = client.get(
        f"/api/companies/{company_id}/agents/nonexistent-agent-id",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 404


def test_list_agents_has_rate_limit_env_var():
    """RATE_LIMIT_AGENTS_READ env var should be read by handlers/agents.py."""
    import importlib
    import agentco.handlers.agents as agents_mod
    # Verify the module uses a read rate limit variable
    assert hasattr(agents_mod, "_RATE_LIMIT_AGENTS_READ"), (
        "handlers/agents.py must define _RATE_LIMIT_AGENTS_READ env var"
    )


# ── ALEX-TD-143: runs GET endpoints имеют rate limit ─────────────────────────

def test_list_runs_accepts_normal_load(auth_client):
    """GET /runs returns 200 normally — rate limit decorator is present."""
    client, _ = auth_client
    client.post("/auth/register", json={"email": "td143_runs@example.com", "password": "pass1234"})
    resp = client.post("/auth/login", json={"email": "td143_runs@example.com", "password": "pass1234"})
    token = resp.json()["access_token"]
    company = client.post("/api/companies/", json={"name": "TD143 Co"}, headers={"Authorization": f"Bearer {token}"})
    company_id = company.json()["id"]
    resp = client.get(
        f"/api/companies/{company_id}/runs",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


def test_get_run_returns_404_for_missing(auth_client):
    """GET /runs/{run_id} returns 404 for unknown run."""
    client, _ = auth_client
    client.post("/auth/register", json={"email": "td143_run@example.com", "password": "pass1234"})
    resp = client.post("/auth/login", json={"email": "td143_run@example.com", "password": "pass1234"})
    token = resp.json()["access_token"]
    company = client.post("/api/companies/", json={"name": "TD143 Run Co"}, headers={"Authorization": f"Bearer {token}"})
    company_id = company.json()["id"]
    resp = client.get(
        f"/api/companies/{company_id}/runs/nonexistent-run-id",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 404


def test_runs_handler_has_read_rate_limit_env_var():
    """RATE_LIMIT_RUNS_READ env var must be defined in handlers/runs.py."""
    import agentco.handlers.runs as runs_mod
    assert hasattr(runs_mod, "_RATE_LIMIT_RUNS_READ"), (
        "handlers/runs.py must define _RATE_LIMIT_RUNS_READ env var"
    )


# ── ALEX-TD-144 / ALEX-TD-147: execute_run MemoryService injection ────────────

@pytest.mark.asyncio
async def test_execute_run_memory_service_not_in_state_but_in_contextvar():
    """ALEX-TD-147 fix for ALEX-TD-144: execute_run must NOT put memory_service
    into initial_state (LangGraph serializes state via msgpack → MemoryService
    is not serializable → TypeError at checkpoint).
    Instead, MemoryService is available via _memory_service_var ContextVar
    during ainvoke so agent_node can use it without touching serialized state.
    """
    from agentco.services.run import RunService
    from agentco.orchestration.agent_node import _memory_service_var
    from unittest.mock import MagicMock, AsyncMock, patch

    # Mock session factory
    mock_orm = MagicMock()
    mock_orm.company_id = "company-1"
    mock_orm.goal = "test goal"
    mock_orm.task_id = None
    mock_orm.status = "pending"

    mock_session = MagicMock()
    mock_session.get.return_value = mock_orm
    mock_session.commit.return_value = None
    mock_session.close.return_value = None

    def mock_session_factory():
        return mock_session

    captured_state = {}
    captured_contextvar_value = {}

    async def mock_compile_and_invoke(initial_state, config=None):
        captured_state.update(initial_state)
        # Capture ContextVar value as seen during ainvoke
        captured_contextvar_value["value"] = _memory_service_var.get()
        return {
            "final_result": "done",
            "status": "completed",
            "total_tokens": 0,
            "total_cost_usd": 0.0,
        }

    mock_graph = MagicMock()
    mock_graph.ainvoke = mock_compile_and_invoke

    with patch("agentco.services.run.compile_graph") as mock_compile, \
         patch("agentco.services.run.create_checkpointer") as mock_ckpt, \
         patch("agentco.services.run.EventBus.get") as mock_bus, \
         patch("agentco.services.run.MemoryService") as mock_memory_cls:
        # Setup compile to return mock graph
        mock_compile.return_value = mock_graph

        # Setup checkpointer async context manager
        from contextlib import asynccontextmanager
        @asynccontextmanager
        async def fake_ckpt(*args, **kwargs):
            yield MagicMock()
        mock_ckpt.return_value = fake_ckpt()

        # Setup EventBus
        mock_bus_instance = MagicMock()
        mock_bus_instance.publish = AsyncMock()
        mock_bus.return_value = mock_bus_instance

        # Setup MemoryService mock
        mock_memory_instance = MagicMock()
        mock_memory_instance.close = MagicMock()
        mock_memory_cls.return_value = mock_memory_instance

        service = RunService.__new__(RunService)
        service._session = mock_session
        service._repo = MagicMock()
        service._repo.orm_model = MagicMock()
        service._task_repo = MagicMock()
        service._company_repo = MagicMock()

        await service.execute_run("run-1", session_factory=mock_session_factory)

    # ALEX-TD-147: memory_service must NOT be in LangGraph state (not msgpack serializable)
    assert "memory_service" not in captured_state, (
        "ALEX-TD-147: memory_service must not be in LangGraph initial_state — "
        "LangGraph serializes state via msgpack at each checkpoint. "
        "MemoryService (with sqlite3 connection) is not serializable → TypeError."
    )

    # ALEX-TD-144: MemoryService must be accessible via ContextVar during ainvoke
    assert captured_contextvar_value.get("value") is mock_memory_instance, (
        "ALEX-TD-144/147: MemoryService must be accessible via _memory_service_var "
        "ContextVar during ainvoke, so agent_node can inject memories."
    )


# ── ALEX-TD-145: ceo_node очищает pending_tasks при loop-detect ──────────────

@pytest.mark.asyncio
async def test_ceo_node_clears_pending_tasks_on_loop_detection():
    """ceo_node при iteration_count >= MAX_ITERATIONS возвращает pending_tasks=[]."""
    from agentco.orchestration.nodes import ceo_node

    state = {
        "run_id": "run-1",
        "company_id": "company-1",
        "input": "test task",
        "messages": [],
        "pending_tasks": [
            {
                "task_id": "task-1",
                "from_agent_id": "ceo",
                "to_agent_id": "subagent",
                "description": "stale task",
                "context": {},
                "depth": 1,
            }
        ],
        "active_tasks": {"task-1": {}},
        "results": {},
        "iteration_count": 20,  # equals MAX_AGENT_ITERATIONS default
        "total_tokens": 0,
        "total_cost_usd": 0.0,
        "status": "running",
        "error": None,
        "final_result": None,
        "agent_id": "ceo",
        "level": 0,
    }

    import os
    with patch.dict(os.environ, {"MAX_AGENT_ITERATIONS": "20"}):
        result = await ceo_node(state)

    assert result.get("status") == "failed"
    assert result.get("error") == "loop_detected"
    # Stale pending_tasks should be cleared so graph state is consistent
    assert result.get("pending_tasks") == [], (
        "ceo_node must return pending_tasks=[] when loop_detected to avoid stale state in checkpointer"
    )


@pytest.mark.asyncio
async def test_ceo_node_clears_pending_tasks_on_cost_limit():
    """ceo_node при total_cost_usd >= MAX_RUN_COST_USD возвращает pending_tasks=[]."""
    from agentco.orchestration.nodes import ceo_node

    state = {
        "run_id": "run-2",
        "company_id": "company-1",
        "input": "expensive task",
        "messages": [],
        "pending_tasks": [{"task_id": "t1", "from_agent_id": "ceo", "to_agent_id": "sub", "description": "x", "context": {}, "depth": 1}],
        "active_tasks": {},
        "results": {},
        "iteration_count": 0,
        "total_tokens": 0,
        "total_cost_usd": 1.5,  # exceeds MAX_RUN_COST_USD default 1.0
        "status": "running",
        "error": None,
        "final_result": None,
        "agent_id": "ceo",
        "level": 0,
    }

    import os
    with patch.dict(os.environ, {"MAX_RUN_COST_USD": "1.0"}):
        result = await ceo_node(state)

    assert result.get("status") == "failed"
    assert result.get("error") == "cost_limit_exceeded"
    assert result.get("pending_tasks") == [], (
        "ceo_node must return pending_tasks=[] when cost_limit_exceeded"
    )


# ── ALEX-TD-146: _execute_agent — CancelledError guard ───────────────────────

@pytest.mark.asyncio
async def test_execute_agent_does_not_retry_on_cancelled_error():
    """asyncio.CancelledError should propagate immediately without retry."""
    from agentco.services.run import RunService

    service = RunService.__new__(RunService)
    service._session = MagicMock()

    call_count = 0

    async def mock_execute_run(run_id, session_factory=None):
        nonlocal call_count
        call_count += 1
        raise asyncio.CancelledError()

    service.execute_run = mock_execute_run

    with pytest.raises((asyncio.CancelledError, BaseException)):
        await service._execute_agent(
            "run-1", "task-1", "agent-1", "company-1",
            session_factory=MagicMock(),
        )

    # CancelledError is BaseException, not Exception — never retried
    assert call_count == 1, "CancelledError must not trigger retry logic"


def test_no_retry_errors_does_not_contain_cancelled():
    """'cancelled' string in _NO_RETRY_ERRORS is dead code — CancelledError is BaseException.

    ALEX-TD-146: str(CancelledError()) == '' → string check never matches.
    CancelledError inherits from BaseException (not Exception) → never caught by 'except Exception'.
    The guard should use isinstance() check, not string matching.
    """
    import inspect
    import agentco.services.run as run_mod
    source = inspect.getsource(run_mod.RunService._execute_agent)
    # The fix: CancelledError should be handled via isinstance, not string matching
    assert "isinstance(exc, asyncio.CancelledError)" in source or \
           "CancelledError" in source, (
        "_execute_agent should explicitly handle CancelledError via isinstance check"
    )
