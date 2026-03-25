"""
ALEX-TD-201: TaskService.list_by_agent called base repo.list() without order_by,
producing non-deterministic task ordering. Fix: delegate to TaskRepository.list_by_agent
which applies ORDER BY created_at ASC.
"""
import pytest
from unittest.mock import MagicMock, patch


def test_list_by_agent_uses_ordered_repo_method():
    """Verify TaskService.list_by_agent delegates to repo.list_by_agent (which has ORDER BY)
    rather than base repo.list() without ordering."""
    import inspect
    import ast
    import agentco.services.task as task_module

    source = inspect.getsource(task_module)
    tree = ast.parse(source)

    # Find the list_by_agent method and confirm it calls self._repo.list_by_agent
    for node in ast.walk(tree):
        if isinstance(node, ast.FunctionDef) and node.name == "list_by_agent":
            method_source = ast.unparse(node)
            # Must NOT use bare .list( without order_by workaround
            assert "self._repo.list_by_agent" in method_source, (
                "TaskService.list_by_agent must call self._repo.list_by_agent "
                "to ensure deterministic ORDER BY created_at ordering"
            )
            assert "self._repo.list(limit" not in method_source or "order_by" in method_source, (
                "If using base .list(), must pass order_by= to ensure deterministic ordering"
            )
            return

    pytest.fail("Could not find list_by_agent method in TaskService — test may be out of sync")


def test_task_repository_list_by_agent_has_order_by():
    """Verify TaskRepository.list_by_agent passes order_by to base list()."""
    import inspect
    import agentco.repositories.task as task_repo_module

    source = inspect.getsource(task_repo_module)
    # list_by_agent should reference order_by and created_at
    assert "order_by=TaskORM.created_at" in source, (
        "TaskRepository.list_by_agent must use order_by=TaskORM.created_at for deterministic ordering"
    )
