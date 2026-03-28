"""
Tests for ALEX-TD-243..247 (self-audit 2026-03-26):
- ALEX-TD-243: agents.parent_agent_id has index
- ALEX-TD-244: list_mcp_servers le=100 (not le=200)
- ALEX-TD-245: list_run_events le=1000 intentional — documented, test verifies comment presence
- ALEX-TD-246: agent service update/delete no longer has flush() before commit()
- ALEX-TD-247: nodes.py has logger + logs real LLM errors with exc_info
"""
import inspect
import logging

import pytest
from sqlalchemy import inspect as sa_inspect


# ── ALEX-TD-243: agents.parent_agent_id has index ─────────────────────────────

def test_agent_parent_agent_id_has_index(auth_client):
    """ALEX-TD-243: parent_agent_id FK must have an index for consistent policy."""
    _client, engine = auth_client
    inspector = sa_inspect(engine)
    indexes = inspector.get_indexes("agents")
    index_cols = [col for idx in indexes for col in idx.get("column_names", idx.get("columns", []))]
    assert "parent_agent_id" in index_cols, (
        "ALEX-TD-243: agents.parent_agent_id must have an index. "
        f"Found columns: {index_cols}"
    )


def test_agent_orm_parent_agent_id_index_attr():
    """ALEX-TD-243: AgentORM.parent_agent_id column should have index=True in ORM def."""
    from agentco.orm.agent import AgentORM
    col = AgentORM.__table__.c["parent_agent_id"]
    # Check that there's an index associated with this column (SQLAlchemy adds it to table.indexes)
    agent_indexes = {idx for idx in AgentORM.__table__.indexes}
    col_indexed = any("parent_agent_id" in [c.name for c in idx.columns] for idx in agent_indexes)
    assert col_indexed, (
        "ALEX-TD-243: AgentORM.parent_agent_id must have index=True. "
        "Add index=True to the mapped_column definition."
    )


# ── ALEX-TD-244: list_mcp_servers le=100 ─────────────────────────────────────

def test_list_mcp_servers_le_is_100():
    """ALEX-TD-244: list_mcp_servers must use le=100, consistent with ALEX-TD-238."""
    from agentco.handlers.mcp_servers import list_mcp_servers
    sig = inspect.signature(list_mcp_servers)
    params = sig.parameters
    assert "limit" in params, "list_mcp_servers must have a 'limit' param"
    limit_param = params["limit"]
    # Query(..., le=100) → default annotation has metadata with le
    # We check the source to ensure le=100 (not le=200)
    import inspect as _inspect
    source = _inspect.getsource(list_mcp_servers)
    assert "le=100" in source or "le = 100" in source, (
        "ALEX-TD-244: list_mcp_servers must use le=100 (not le=200). "
        "ALEX-TD-238 policy: all list endpoints cap at le=100."
    )


# ── ALEX-TD-245: list_run_events le=1000 documented ─────────────────────────

def test_list_run_events_le_1000_is_documented():
    """ALEX-TD-245: list_run_events uses le=1000 — must be documented as intentional."""
    import inspect as _inspect
    from agentco.handlers.runs import list_run_events
    source = _inspect.getsource(list_run_events)
    # le=1000 should be present
    assert "le=1000" in source, (
        "ALEX-TD-245: list_run_events must still have le=1000 (intentional for events)."
    )
    # AND it must be documented
    assert "ALEX-TD-245" in source or "intentional" in source.lower(), (
        "ALEX-TD-245: le=1000 for list_run_events must be documented as intentional "
        "(add a comment explaining the rationale)."
    )


# ── ALEX-TD-246: agent service no flush() before commit() ───────────────────

def test_agent_service_update_no_redundant_flush():
    """ALEX-TD-246: AgentService.update must not call flush() before commit()."""
    import inspect as _inspect
    from agentco.services.agent import AgentService
    source = _inspect.getsource(AgentService.update)
    lines = source.split("\n")
    # Find flush() calls
    flush_lines = [l.strip() for l in lines if "session.flush()" in l and "# ALEX-TD-246" not in l]
    assert not flush_lines, (
        f"ALEX-TD-246: AgentService.update must NOT call flush() before commit(). "
        f"Found redundant flush() at: {flush_lines}"
    )


def test_agent_service_delete_no_redundant_flush():
    """ALEX-TD-246: AgentService.delete must not call flush() before commit()."""
    import inspect as _inspect
    from agentco.services.agent import AgentService
    source = _inspect.getsource(AgentService.delete)
    lines = source.split("\n")
    # The bulk UPDATE flush is intentional (before delete to ensure referential integrity)
    # But explicit session.flush() after the bulk update is redundant
    flush_lines = [l.strip() for l in lines if "session.flush()" in l and "# ALEX-TD-246" not in l]
    assert not flush_lines, (
        f"ALEX-TD-246: AgentService.delete must NOT call explicit flush() before commit(). "
        f"Found: {flush_lines}"
    )


# ── ALEX-TD-247: nodes.py has logger ─────────────────────────────────────────

def test_nodes_has_logger():
    """ALEX-TD-247: orchestration/nodes.py must have a module-level logger."""
    import agentco.orchestration.nodes as nodes_module
    assert hasattr(nodes_module, "logger"), (
        "ALEX-TD-247: nodes.py must have a module-level `logger = logging.getLogger(__name__)`."
    )
    assert isinstance(nodes_module.logger, logging.Logger), (
        "ALEX-TD-247: nodes.logger must be a logging.Logger instance."
    )


def test_nodes_ceo_node_logs_entry(caplog):
    """ALEX-TD-247: ceo_node must log a debug entry on entry."""
    import asyncio
    from unittest.mock import patch
    import agentco.orchestration.nodes as nodes_mod
    from agentco.orchestration.nodes import ceo_node

    state = {
        "run_id": "test-run-id",
        "iteration_count": 0,
        "total_tokens": 0,
        "total_cost_usd": 0.0,
        "total_cost": 0.0,
        "input": "test goal",
        "messages": [],
        "pending_tasks": [],
        "active_tasks": {},
        "results": {},
        "status": "running",
        "error": None,
        "final_result": None,
    }

    # BUG-NEW-001: Ensure mock LLM path to avoid real API calls
    with patch.object(nodes_mod, "_USE_REAL_LLM", False):
        with caplog.at_level(logging.DEBUG, logger="agentco.orchestration.nodes"):
            asyncio.run(ceo_node(state))

    assert any("ceo_node" in rec.message for rec in caplog.records), (
        "ALEX-TD-247: ceo_node must log a DEBUG message on entry containing 'ceo_node'."
    )


def test_nodes_llm_error_logged_with_exc_info(monkeypatch, caplog):
    """ALEX-TD-247: _mock_llm_call with real LLM path must log errors with exc_info=True."""
    import asyncio
    from unittest.mock import patch
    import agentco.orchestration.nodes as nodes_mod

    # Patch litellm.acompletion to raise an error
    async def _fail_completion(*args, **kwargs):
        raise RuntimeError("simulated LLM provider error")

    # ALEX-TD-279: _USE_REAL_LLM is now a module-level cached bool — patch via patch.object
    with patch.object(nodes_mod, "_USE_REAL_LLM", True), \
         patch.object(nodes_mod, "litellm") as mock_litellm:
        mock_litellm.acompletion = _fail_completion

        with caplog.at_level(logging.WARNING, logger="agentco.orchestration.nodes"):
            with pytest.raises(RuntimeError, match="simulated LLM provider error"):
                asyncio.run(nodes_mod._mock_llm_call("sys", "user", "mock"))

    # Must have a warning log with exc_info
    warning_records = [r for r in caplog.records if r.levelno == logging.WARNING]
    assert warning_records, "ALEX-TD-247: LLM error in _mock_llm_call must be logged as WARNING."
    # exc_info should be present (exc_info=True means record.exc_info is not None)
    has_exc_info = any(r.exc_info is not None for r in warning_records)
    assert has_exc_info, (
        "ALEX-TD-247: LLM error log must include exc_info=True for proper traceback in prod logs."
    )
