"""
TDD regression tests for BUG-068 and BUG-069.

BUG-068 (minor): execute_run() success branch — if run_orm is None (run deleted
    while graph was running) — metrics total_tokens/total_cost_usd are silently
    lost without any warning log.
    Fix: add logger.warning(...) in the else-branch of `if run_orm:`.

BUG-069 (minor): _forward_events() in ws_events.py catches only
    (WebSocketDisconnect, RuntimeError) — OSError/ConnectionResetError from anyio
    transport layer are not caught → "Task exception was never retrieved" on some platforms.
    Fix: extend except to (WebSocketDisconnect, RuntimeError, OSError).

Run: uv run pytest tests/test_bug_068_069.py -v
"""
from __future__ import annotations

import inspect
import pytest


# ── BUG-068: execute_run success branch warns when run_orm is None ─────────────

def test_execute_run_warns_when_run_orm_none_in_success_branch():
    """
    BUG-068: If run_orm is None in the success branch of execute_run()
    (run was deleted while graph was running), a logger.warning must be emitted
    so that token/cost metric loss is observable.

    Checks source for the warning message string in the success block (before except).
    """
    from agentco.services.run import RunService

    source = inspect.getsource(RunService.execute_run)
    # The success block is before the except clause
    success_section = source.split("except Exception as exc:")[0]

    # The else branch of `if run_orm:` must contain a warning about metrics being lost
    assert "metrics lost" in success_section, (
        "BUG-068: execute_run() success branch must log a warning when run_orm is None "
        "(run deleted while graph was running) so that token/cost metric loss is visible. "
        "Add: logger.warning('execute_run: run_orm not found for run_id=%s, metrics lost', run_id)"
    )


def test_execute_run_warning_uses_run_id_in_success_branch():
    """
    BUG-068: The warning must include run_id for traceability.
    """
    from agentco.services.run import RunService

    source = inspect.getsource(RunService.execute_run)
    success_section = source.split("except Exception as exc:")[0]

    # The warning must reference run_id as a parameter
    assert "run_orm not found" in success_section, (
        "BUG-068: Warning message must say 'run_orm not found' and include run_id. "
        "Expected: logger.warning('execute_run: run_orm not found for run_id=%s, metrics lost', run_id)"
    )


# ── BUG-069: _forward_events catches OSError ─────────────────────────────────

def test_forward_events_catches_oserror():
    """
    BUG-069: _forward_events() in ws_events.py must catch OSError in addition to
    WebSocketDisconnect and RuntimeError, so that anyio transport-layer errors
    (e.g. ConnectionResetError, which is a subclass of OSError) do not propagate
    as unhandled task exceptions on Linux/macOS.
    """
    from agentco.handlers import ws_events

    source = inspect.getsource(ws_events)

    # Find the _forward_events function source
    # We look for the except tuple that covers the send_json call
    assert "OSError" in source, (
        "BUG-069: _forward_events() must catch OSError (and subclasses like "
        "ConnectionResetError) in addition to WebSocketDisconnect and RuntimeError. "
        "Extend: except (WebSocketDisconnect, RuntimeError, OSError):"
    )


def test_forward_events_oserror_in_except_tuple():
    """
    BUG-069: Verify that OSError appears in the same except tuple as
    WebSocketDisconnect and RuntimeError inside _forward_events.
    """
    from agentco.handlers import ws_events

    source = inspect.getsource(ws_events)

    # The specific pattern we expect after the fix
    assert "WebSocketDisconnect, RuntimeError, OSError" in source, (
        "BUG-069: The except clause in _forward_events() must be: "
        "except (WebSocketDisconnect, RuntimeError, OSError): "
        "Currently only (WebSocketDisconnect, RuntimeError) is caught, missing OSError."
    )
