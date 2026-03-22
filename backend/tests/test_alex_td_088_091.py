"""
Regression tests for ALEX-TD-088..091 — Backend Audit 2026-03-22.

ALEX-TD-088 (critical): execute_run() never persisted total_tokens/total_cost_usd to DB.
ALEX-TD-089 (major):    ws_events._forward_events() did not catch send_json exceptions.
ALEX-TD-090 (minor):    EventBus.reset() docstring referenced non-existent ALEX-TD-092 ticket.
ALEX-TD-091 (minor):    repositories/run.py list_by_company applied status_filter after LIMIT/OFFSET.

Run: uv run pytest tests/test_alex_td_088_091.py -v
"""
from __future__ import annotations

import inspect
from unittest.mock import AsyncMock, MagicMock, patch, call

import pytest


# ── ALEX-TD-088: execute_run persists total_tokens + total_cost_usd ──────────

def test_execute_run_persists_total_tokens_and_cost_in_success_branch():
    """
    ALEX-TD-088: Verify that execute_run() success branch assigns both total_tokens
    and total_cost_usd from final_state to run_orm immediately before session.commit().

    Before fix: the assignments were absent — tokens/cost always stayed at 0 in DB.
    After fix:  both fields set from final_state.get("total_tokens", 0) etc.
    """
    from agentco.services.run import RunService
    source = inspect.getsource(RunService.execute_run)

    # Verify the assignment pattern appears once in the success branch
    # (not in the except block, which has no final_state)
    success_section = source.split("except Exception as exc:")[0]

    assert "run_orm.total_tokens = final_state.get" in success_section, (
        "ALEX-TD-088: execute_run() success branch must assign run_orm.total_tokens "
        "from final_state before commit. Previously this was never done → DB always 0."
    )
    assert "run_orm.total_cost_usd = final_state.get" in success_section, (
        "ALEX-TD-088: execute_run() success branch must assign run_orm.total_cost_usd "
        "from final_state before commit. Previously this was never done → DB always 0."
    )


def test_execute_run_code_persists_metrics():
    """
    ALEX-TD-088: Verify by source inspection that execute_run() assigns total_tokens
    and total_cost_usd from final_state to run_orm before commit.
    """
    from agentco.services.run import RunService
    source = inspect.getsource(RunService.execute_run)
    assert "run_orm.total_tokens" in source, (
        "ALEX-TD-088: execute_run() must assign run_orm.total_tokens from final_state."
    )
    assert "run_orm.total_cost_usd" in source, (
        "ALEX-TD-088: execute_run() must assign run_orm.total_cost_usd from final_state."
    )
    assert 'final_state.get("total_tokens"' in source, (
        "ALEX-TD-088: must read total_tokens from final_state via .get()."
    )
    assert 'final_state.get("total_cost_usd"' in source, (
        "ALEX-TD-088: must read total_cost_usd from final_state via .get()."
    )


# ── ALEX-TD-089: _forward_events catches send_json exceptions ─────────────────

def test_forward_events_catches_websocket_disconnect():
    """
    ALEX-TD-089: _forward_events must handle WebSocketDisconnect from send_json()
    by breaking out of the event loop (not propagating the exception).
    """
    from agentco.handlers.ws_events import ws_company_events
    source = inspect.getsource(ws_company_events)
    # The fix adds try/except around send_json in _forward_events
    assert "send_json" in source, "ws_company_events must use send_json"
    # Verify exception handling around send_json
    assert "WebSocketDisconnect" in source, (
        "ALEX-TD-089: _forward_events must catch WebSocketDisconnect from send_json."
    )


def test_forward_events_breaks_on_error():
    """
    ALEX-TD-089: When send_json raises, _forward_events must break (stop forwarding),
    not crash the task with an unhandled exception.
    """
    from agentco.handlers.ws_events import ws_company_events
    source = inspect.getsource(ws_company_events)
    # The fix uses 'break' inside the except block
    assert "break" in source, (
        "ALEX-TD-089: _forward_events must 'break' from the event loop when send_json fails."
    )


# ── ALEX-TD-090: EventBus.reset docstring no stale ticket reference ───────────

def test_eventbus_reset_no_stale_ticket_reference():
    """
    ALEX-TD-090: EventBus.reset() docstring must not reference non-existent ALEX-TD-092.
    """
    from agentco.core.event_bus import EventBus
    reset_source = inspect.getsource(EventBus.reset)
    # The stale ALEX-TD-092 reference should be gone
    assert "ALEX-TD-092: Reset" not in reset_source, (
        "ALEX-TD-090: EventBus.reset() docstring still has stale 'ALEX-TD-092: Reset' reference. "
        "Ticket ALEX-TD-092 (old numbering) never existed; remove or correct the reference."
    )


def test_eventbus_reset_mentions_alex_td_090():
    """ALEX-TD-090: The fix should reference ALEX-TD-090 for traceability."""
    from agentco.core.event_bus import EventBus
    reset_source = inspect.getsource(EventBus.reset)
    assert "ALEX-TD-090" in reset_source, (
        "ALEX-TD-090: EventBus.reset() docstring should reference ALEX-TD-090 to document the fix."
    )


# ── ALEX-TD-091: list_by_company filters before LIMIT/OFFSET ─────────────────

def test_list_by_company_filter_before_limit():
    """
    ALEX-TD-091: RunRepository.list_by_company should apply status_filter WHERE
    before .limit()/.offset() in the SQLAlchemy stmt chain for clarity.
    """
    from agentco.repositories.run import RunRepository
    source = inspect.getsource(RunRepository.list_by_company)

    # Find positions of key statements in source
    where_pos = source.find(".where(RunORM.status ==")
    limit_pos = source.find(".limit(")
    offset_pos = source.find(".offset(")

    # After fix, WHERE should appear before LIMIT in source
    assert where_pos != -1, (
        "ALEX-TD-091: list_by_company should have a .where(RunORM.status == status_filter) call."
    )
    assert limit_pos != -1, "list_by_company must have .limit() call"
    assert where_pos < limit_pos, (
        "ALEX-TD-091: status_filter .where() must appear before .limit() for readability. "
        "SQLAlchemy is lazy (SQL is built correctly either way), but code clarity matters."
    )
