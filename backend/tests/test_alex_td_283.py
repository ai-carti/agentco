"""
ALEX-TD-283: execute_run — guard for empty initial_goal.

When a run has no goal AND no resolvable task (or the task lookup fails),
initial_goal ends up as "" — the LLM receives empty input.
Fix: raise ValueError with a clear message before touching the DB status.
"""
import pytest
from unittest.mock import MagicMock


def _make_run_orm(goal=None, task_id=None, company_id="co-1"):
    """Build a minimal run ORM stub."""
    orm = MagicMock()
    orm.goal = goal
    orm.task_id = task_id
    orm.company_id = company_id
    orm.status = "pending"
    return orm


def _make_service_with_session(run_orm):
    """Build a RunService instance whose _session returns the given ORM."""
    from agentco.services.run import RunService

    service = RunService.__new__(RunService)

    fake_session = MagicMock()
    fake_session.get.return_value = run_orm

    # repo mock so _repo.orm_model resolves
    fake_repo = MagicMock()
    service._repo = fake_repo
    service._session = fake_session  # used when session_factory=None

    return service


@pytest.mark.asyncio
async def test_execute_run_raises_on_no_goal_no_task():
    """ALEX-TD-283: run with goal=None, task_id=None → ValueError before LLM."""
    from agentco.services.run import RunService

    run_orm = _make_run_orm(goal=None, task_id=None)
    service = _make_service_with_session(run_orm)

    with pytest.raises(ValueError, match="no goal and no resolvable task"):
        await RunService.execute_run(service, run_id="run-test-283a")


@pytest.mark.asyncio
async def test_execute_run_raises_on_empty_string_goal():
    """ALEX-TD-283: run with goal='   ' (whitespace-only), task_id=None → ValueError."""
    from agentco.services.run import RunService

    run_orm = _make_run_orm(goal="   ", task_id=None)
    service = _make_service_with_session(run_orm)

    with pytest.raises(ValueError, match="no goal and no resolvable task"):
        await RunService.execute_run(service, run_id="run-test-283b")
