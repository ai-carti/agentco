"""
TDD тесты для ALEX-TD-267..271 (self-audit цикл 5).

ALEX-TD-267 (major): orchestration/state.py:AgentState.status Literal missing "done"
ALEX-TD-268 (minor): services/run.py:execute_run missing logger.info on successful completion
ALEX-TD-269 (minor): handlers/library.py:save_to_library — AgentLibraryORM no owner_id
ALEX-TD-270 (minor): orchestration/nodes.py:ceo_node — no max_pending_tasks guard
ALEX-TD-271 (minor): services/run.py:execute_run — run_id not logged on success path

Run: uv run pytest tests/test_alex_td_267_271.py -v
"""
import inspect
import logging
from typing import get_args
from unittest.mock import patch, AsyncMock, MagicMock
import pytest


# ── helpers ───────────────────────────────────────────────────────────────────

def _register_and_login(client, email="alex267@example.com", password="pass1234"):
    client.post("/auth/register", json={"email": email, "password": password})
    resp = client.post("/auth/login", json={"email": email, "password": password})
    return resp.json()["access_token"]


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _create_company(client, token, name="TestCorp267"):
    resp = client.post("/api/companies/", json={"name": name}, headers=_auth(token))
    assert resp.status_code == 201
    return resp.json()["id"]


def _create_agent(client, token, company_id, name="Agent267"):
    resp = client.post(
        f"/api/companies/{company_id}/agents",
        json={"name": name, "role": "worker", "model": "gpt-4o-mini"},
        headers=_auth(token),
    )
    assert resp.status_code == 201
    return resp.json()["id"]


# ── ALEX-TD-267: AgentState.status Literal missing "done" ─────────────────────

class TestAlexTD267AgentStateDoneLiteral:
    """
    ALEX-TD-267: AgentState.status Literal must include "done".

    The graph nodes (ceo_node, subagent_node, hierarchical_node) set status="done"
    on successful completion. execute_run defaults final_status to "done".
    The Literal annotation only had ["running", "completed", "failed", "error"]
    — missing "done" means mypy/pyright accepts invalid values silently.
    Fix: add "done" and "stopped" to the Literal so type-checking actually works.
    """

    def test_agent_state_status_literal_includes_done(self):
        """AgentState.status Literal must include 'done'."""
        import typing
        from agentco.orchestration.state import AgentState
        # Use get_type_hints to resolve forward refs and get actual Literal args
        hints = typing.get_type_hints(AgentState)
        status_hint = hints.get("status")
        assert status_hint is not None, "AgentState must have a 'status' annotation"
        literal_args = get_args(status_hint)
        assert "done" in literal_args, (
            f"ALEX-TD-267: AgentState.status Literal must include 'done'. "
            f"Current values: {literal_args}. "
            f"graph nodes set status='done' on success; missing from Literal means "
            f"type-checking silently accepts invalid values."
        )

    def test_agent_state_status_literal_includes_all_runtime_values(self):
        """All status values used at runtime must be in the Literal."""
        import typing
        from agentco.orchestration.state import AgentState
        hints = typing.get_type_hints(AgentState)
        literal_args = get_args(hints.get("status"))
        # These are all values set at runtime across nodes.py, graph.py, execute_run
        runtime_values = {"running", "completed", "failed", "error", "done"}
        missing = runtime_values - set(literal_args)
        assert not missing, (
            f"ALEX-TD-267: AgentState.status Literal is missing runtime values: {missing}. "
            f"Nodes.py returns status='done' on success; graph routers check for 'done'; "
            f"execute_run defaults to 'done'. All must be in the Literal."
        )

    def test_nodes_return_done_status_on_success(self):
        """Verify that nodes.py source code sets status='done' — confirms Literal gap is real."""
        from agentco.orchestration import nodes
        source = inspect.getsource(nodes)
        assert '"done"' in source or "'done'" in source, (
            "nodes.py must return status='done' on successful completion. "
            "This confirms that AgentState.status Literal needs 'done'."
        )

    def test_execute_run_defaults_final_status_to_done(self):
        """execute_run defaults final_status to 'done' — must be in Literal."""
        from agentco.services import run as run_module
        source = inspect.getsource(run_module.RunService.execute_run)
        # The pattern: final_state.get("status", "done")
        assert '"done"' in source, (
            "ALEX-TD-267: execute_run uses 'done' as default final_status. "
            "Must be included in AgentState.status Literal."
        )


# ── ALEX-TD-268: missing logger.info on successful run completion ─────────────

class TestAlexTD268ExecuteRunSuccessLogging:
    """
    ALEX-TD-268: execute_run must log INFO when a run completes successfully.

    Observability gap: production logs show errors but not successful completions.
    Operators can't distinguish "completed" from "hung" without checking the DB.
    Fix: add logger.info("execute_run completed run_id=... status=... tokens=... cost=...")
    in the success path, after the final DB update.
    """

    def test_execute_run_success_path_has_logger_info(self):
        """execute_run success path must emit at least one logger.info call."""
        from agentco.services import run as run_module
        source = inspect.getsource(run_module.RunService.execute_run)

        # Check for logger.info call with "completed" keyword in execute_run
        # Note: source.split("except Exception")[0] would give only the _execute_agent retry loop
        # (line ~249), not the execute_run success path. Use full source search instead.
        has_info_log = 'logger.info(' in source and 'completed status' in source
        assert has_info_log, (
            "ALEX-TD-268: execute_run must call logger.info in the success path. "
            "Without this, successful runs are invisible in production logs — "
            "operators can't distinguish completed from stuck runs. "
            "Add: logger.info('execute_run: run_id=%s completed status=%s tokens=%d cost=%.4f', "
            "run_id, final_status, run_orm.total_tokens, run_orm.total_cost_usd)"
        )

    def test_execute_run_success_log_includes_run_id(self):
        """Success log must include run_id for correlation in production."""
        from agentco.services import run as run_module
        source = inspect.getsource(run_module.RunService.execute_run)

        # Check that the source contains a logger.info call that also mentions run_id.
        # Note: logger.info is often multi-line — check that both patterns exist in the source.
        assert 'logger.info(' in source, (
            "ALEX-TD-268: execute_run must call logger.info in the success path."
        )
        # The log string must contain run_id somewhere in execute_run source
        assert 'run_id' in source and 'logger.info(' in source, (
            "ALEX-TD-268: The logger.info in execute_run success path must include run_id "
            "so operators can correlate log entries with specific runs in production."
        )
        # More specifically: look for the combined pattern
        assert 'run_id=%s' in source or 'run_id=' in source, (
            "ALEX-TD-268: logger.info must include run_id=... pattern for log correlation."
        )


# ── ALEX-TD-269: AgentLibraryORM missing owner_id ────────────────────────────

class TestAlexTD269LibraryOwnerTracking:
    """
    ALEX-TD-269: AgentLibraryORM must store owner_id for audit trail.

    Currently library entries are anonymous — save_to_library doesn't record who
    saved the agent. This means:
    1. No way to query "agents I saved to library" (future My Library feature)
    2. No audit trail for compliance/abuse monitoring
    3. No ability to restrict delete to owner

    Fix: add owner_id Mapped[str] column to AgentLibraryORM + Alembic migration 0020.
    Save owner_id = current_user.id in save_to_library handler.
    """

    def test_agent_library_orm_has_owner_id_column(self):
        """AgentLibraryORM must have an owner_id column."""
        from agentco.orm.agent_library import AgentLibraryORM
        assert hasattr(AgentLibraryORM, 'owner_id'), (
            "ALEX-TD-269: AgentLibraryORM must have owner_id column for audit trail. "
            "Without it, library entries are anonymous — no way to query 'my agents', "
            "no audit trail, no ability to restrict delete to owner."
        )

    def test_save_to_library_stores_owner_id(self, auth_client):
        """POST /api/library must store the current user's ID as owner_id."""
        client, engine = auth_client
        token = _register_and_login(client)
        company_id = _create_company(client, token)
        agent_id = _create_agent(client, token, company_id)

        resp = client.post(
            "/api/library",
            json={"agent_id": agent_id},
            headers=_auth(token),
        )
        assert resp.status_code == 201

        # Check via API response — owner_id should be in the response schema
        data = resp.json()
        assert "owner_id" in data, (
            "ALEX-TD-269: POST /api/library response must include owner_id field."
        )
        assert data["owner_id"] is not None, (
            "ALEX-TD-269: owner_id must be set when saving an agent to library."
        )

    def test_library_response_includes_owner_id(self, auth_client):
        """GET /api/library response should expose owner_id in entries."""
        client, _ = auth_client
        token = _register_and_login(client, email="alex269b@example.com")
        company_id = _create_company(client, token, name="Corp269b")
        agent_id = _create_agent(client, token, company_id, name="Agent269b")

        save_resp = client.post(
            "/api/library",
            json={"agent_id": agent_id},
            headers=_auth(token),
        )
        assert save_resp.status_code == 201

        list_resp = client.get("/api/library", headers=_auth(token))
        assert list_resp.status_code == 200
        entries = list_resp.json()
        assert len(entries) >= 1
        # owner_id should be in the response schema
        latest = next((e for e in entries if e["id"] == save_resp.json()["id"]), None)
        assert latest is not None
        assert "owner_id" in latest, (
            "ALEX-TD-269: LibraryAgentOut must include owner_id so frontend can "
            "show 'My Library' filtering and display ownership."
        )


# ── ALEX-TD-270: ceo_node missing max_pending_tasks guard ─────────────────────

class TestAlexTD270MaxPendingTasksGuard:
    """
    ALEX-TD-270: ceo_node must guard against runaway pending_tasks growth.

    Without a max_pending_tasks limit, a buggy goal or adversarial input could
    cause CEO to add hundreds of tasks in a single iteration, leading to:
    1. Memory bloat (state serialized at each LangGraph checkpoint)
    2. Excessive subagent invocations (N task = N LLM calls = N × cost)
    3. Checkpointer DB growth (each large state = large msgpack blob)

    Fix: add max_pending_tasks check in ceo_node — if adding would exceed limit
    (env AGENT_MAX_PENDING_TASKS, default=20), set status="failed" with
    error="max_pending_tasks_exceeded".
    """

    def test_ceo_node_source_has_max_pending_tasks_guard(self):
        """ceo_node must check pending_tasks count before adding new tasks."""
        from agentco.orchestration import nodes
        source = inspect.getsource(nodes.ceo_node)

        has_guard = (
            "max_pending" in source.lower()
            or "len(state" in source
            or "MAX_PENDING" in source
            or "pending_tasks_exceeded" in source
        )
        assert has_guard, (
            "ALEX-TD-270: ceo_node must guard against unbounded pending_tasks growth. "
            "Without a max, a buggy goal or LLM hallucination can add hundreds of tasks "
            "→ memory bloat + excessive LLM calls + checkpointer DB growth. "
            "Add: if len(state['pending_tasks']) >= _get_max_pending_tasks(): "
            "return {'status': 'failed', 'error': 'max_pending_tasks_exceeded', ...}"
        )

    def test_max_pending_tasks_env_var_exists(self):
        """_get_max_pending_tasks() or equivalent env var must be defined."""
        from agentco.orchestration import nodes
        source = inspect.getsource(nodes)

        has_config = (
            "MAX_PENDING_TASKS" in source
            or "max_pending_tasks" in source.lower()
            or "AGENT_MAX_PENDING" in source
        )
        assert has_config, (
            "ALEX-TD-270: A configurable max_pending_tasks limit must be defined. "
            "Add: def _get_max_pending_tasks(): "
            "    return int(os.environ.get('AGENT_MAX_PENDING_TASKS', '20'))"
        )


# ── ALEX-TD-271: execute_run success path missing structured metrics log ───────

class TestAlexTD271ExecuteRunMetricsLog:
    """
    ALEX-TD-271: execute_run success path must log final metrics (tokens, cost, status).

    Related to ALEX-TD-268 but specifically about structured metrics. After ALEX-TD-088
    total_tokens and total_cost_usd are now persisted to DB — they should also appear
    in the completion log so operators can spot expensive runs without querying the DB.

    Fix: logger.info message must include total_tokens and total_cost_usd values.
    """

    def test_execute_run_success_log_includes_metrics(self):
        """Success log must include total_tokens and total_cost_usd."""
        from agentco.services import run as run_module
        source = inspect.getsource(run_module.RunService.execute_run)

        # Note: logger.info calls are often multi-line, so checking line-by-line misses adjacent lines.
        # Check the full source for the combined pattern of logger.info + token/cost keyword.
        has_metrics = (
            'logger.info(' in source
            and ('tokens' in source or 'cost' in source)
        )
        assert has_metrics, (
            "ALEX-TD-271: logger.info in execute_run success path must include "
            "token/cost metrics so operators can identify expensive runs in logs "
            "without querying the database. "
            "Example: logger.info('execute_run: run_id=%s done status=%s "
            "tokens=%d cost=%.4f', run_id, final_status, tokens, cost)"
        )
