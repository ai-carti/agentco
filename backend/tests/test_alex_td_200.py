"""
ALEX-TD-200: logger.error in dead-letter path missing exc_info=True.
Without exc_info, the traceback is lost in logs, making post-mortem debugging impossible.
"""
import logging
import pytest
from unittest.mock import patch, MagicMock, AsyncMock


def test_dead_letter_logger_has_exc_info():
    """Verify that logger.error call in the dead-letter branch uses exc_info=True."""
    import inspect
    import ast
    import agentco.services.run as run_module

    source = inspect.getsource(run_module)
    tree = ast.parse(source)

    found_dead_letter_error = False
    for node in ast.walk(tree):
        # Look for logger.error calls that log run_dead_letter
        if isinstance(node, ast.Call):
            func = node.func
            if not (isinstance(func, ast.Attribute) and func.attr == "error"):
                continue
            # Check if first string arg contains "run_dead_letter"
            if not node.args:
                continue
            first_arg = node.args[0]
            if not (isinstance(first_arg, ast.Constant) and "run_dead_letter" in str(first_arg.value)):
                continue
            # Check for exc_info keyword argument
            has_exc_info = any(
                kw.arg == "exc_info" and (
                    isinstance(kw.value, ast.Constant) and kw.value.value is True
                )
                for kw in node.keywords
            )
            assert has_exc_info, (
                "logger.error for run_dead_letter must include exc_info=True "
                "so tracebacks are not silently lost"
            )
            found_dead_letter_error = True

    assert found_dead_letter_error, (
        "Could not find logger.error('run_dead_letter ...') call in run.py — "
        "test may be out of sync with source"
    )
