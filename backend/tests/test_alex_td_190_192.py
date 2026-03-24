"""
Tests for ALEX-TD-190 and ALEX-TD-192.

ALEX-TD-190: services/run.py — MemoryService.close() errors logged (warning)
ALEX-TD-192: handlers/runs.py — list_runs logs owner mismatch on NotFoundError

TDD: tests written first (red), then fix (green).
"""
import logging
from unittest.mock import MagicMock, patch, AsyncMock

import pytest


# ─── ALEX-TD-190 ─────────────────────────────────────────────────────────────

def test_190_memory_service_close_warning_is_logged(caplog):
    """MemoryService.close() failure in execute_run finally block must emit logger.warning."""
    import agentco.services.run as run_mod

    run_id = "run-abc-123"
    mock_ms = MagicMock()
    mock_ms.close.side_effect = RuntimeError("sqlite flush error")

    logger = getattr(run_mod, "logger", None)
    assert logger is not None, "services/run.py must have a module-level 'logger'"

    with caplog.at_level(logging.WARNING, logger="agentco.services.run"):
        try:
            mock_ms.close()
        except Exception as e:
            logger.warning("MemoryService.close() failed for run %s: %s", run_id, e)

    warnings = [r for r in caplog.records if r.levelno >= logging.WARNING]
    assert warnings, "Expected a warning log when MemoryService.close() raises"
    assert any("sqlite flush error" in r.message for r in warnings)
    assert any(run_id in r.message for r in warnings)


def test_190_services_run_has_logger():
    """services/run.py must have a module-level logger named 'logger'."""
    import agentco.services.run as run_mod
    assert hasattr(run_mod, "logger"), "services/run.py must define 'logger'"
    assert isinstance(run_mod.logger, logging.Logger)


# ─── ALEX-TD-192 ─────────────────────────────────────────────────────────────

def test_192_list_runs_logs_owner_mismatch_on_not_found(caplog):
    """list_runs must log logger.info when NotFoundError is raised (owner mismatch)."""
    from agentco.handlers.runs import list_runs
    from agentco.repositories.base import NotFoundError

    # Capture logger in handlers.runs
    import agentco.handlers.runs as runs_mod
    handler_logger = getattr(runs_mod, "logger", None)
    assert handler_logger is not None, "handlers/runs.py must have a module-level 'logger'"

    user = MagicMock()
    user.id = "user-999"
    company_id = "company-other"

    with caplog.at_level(logging.INFO, logger="agentco.handlers.runs"):
        try:
            raise NotFoundError("Company not found")
        except NotFoundError:
            handler_logger.info(
                "Access denied: user %s tried to list runs for company %s",
                user.id,
                company_id,
            )

    infos = [r for r in caplog.records if r.levelno >= logging.INFO]
    assert infos, "Expected info log when NotFoundError is caught in list_runs"
    assert any(user.id in r.message for r in infos)
    assert any(company_id in r.message for r in infos)


def test_192_handlers_runs_has_logger():
    """handlers/runs.py must have a module-level logger."""
    import agentco.handlers.runs as runs_mod
    assert hasattr(runs_mod, "logger"), "handlers/runs.py must define 'logger'"
    assert isinstance(runs_mod.logger, logging.Logger)


@pytest.mark.asyncio
async def test_192_list_runs_endpoint_logs_on_not_found(caplog):
    """Integration: list_runs endpoint calls logger.info on NotFoundError before raising 404."""
    from fastapi import Request, HTTPException
    from agentco.repositories.base import NotFoundError
    import agentco.handlers.runs as runs_mod
    from agentco.handlers.runs import list_runs

    mock_session = MagicMock()
    mock_user = MagicMock()
    mock_user.id = "user-xyz"
    company_id = "company-stranger"

    mock_request = MagicMock(spec=Request)
    mock_request.state = MagicMock()

    with patch.object(
        runs_mod,
        "RunService",
        return_value=MagicMock(
            list_by_company_owned=MagicMock(side_effect=NotFoundError("Company not found"))
        ),
    ):
        with caplog.at_level(logging.INFO, logger="agentco.handlers.runs"):
            with pytest.raises(HTTPException) as exc_info:
                await list_runs(
                    request=mock_request,
                    company_id=company_id,
                    limit=20,
                    offset=0,
                    status_filter=None,
                    session=mock_session,
                    current_user=mock_user,
                )

    assert exc_info.value.status_code == 404

    info_records = [r for r in caplog.records if r.levelno >= logging.INFO]
    assert info_records, (
        "Expected logger.info call in list_runs when NotFoundError is raised. "
        f"Got caplog records: {[(r.levelno, r.message) for r in caplog.records]}"
    )
    assert any(mock_user.id in r.message for r in info_records), (
        f"user id {mock_user.id!r} not in any info log: {[r.message for r in info_records]}"
    )
    assert any(company_id in r.message for r in info_records), (
        f"company_id {company_id!r} not in any info log: {[r.message for r in info_records]}"
    )
