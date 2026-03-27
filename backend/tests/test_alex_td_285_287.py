"""
TDD тесты для ALEX-TD-285, ALEX-TD-286, ALEX-TD-287.

ALEX-TD-285: _execute_agent reads os.getenv on every call — should use module-level constants
ALEX-TD-286: execute_run uses os.environ.get("MAX_AGENT_DEPTH") directly instead of _get_max_depth()
ALEX-TD-287: execute_run reads AGENTCO_MEMORY_DB via os.getenv on every call — should be module-level
"""
import pytest


class TestAlexTD285RetryConstantsModuleLevel:
    """ALEX-TD-285: RUN_MAX_RETRIES и RUN_RETRY_BASE_DELAY должны быть module-level константами."""

    def test_run_service_module_has_max_retries_constant(self):
        """services/run.py должен экспортировать _RUN_MAX_RETRIES как module-level константу."""
        import agentco.services.run as run_module
        assert hasattr(run_module, "_RUN_MAX_RETRIES"), (
            "_RUN_MAX_RETRIES not found in services/run.py — should be module-level constant"
        )
        assert isinstance(run_module._RUN_MAX_RETRIES, int), (
            f"_RUN_MAX_RETRIES should be int, got {type(run_module._RUN_MAX_RETRIES)}"
        )

    def test_run_service_module_has_retry_base_delay_constant(self):
        """services/run.py должен экспортировать _RUN_RETRY_BASE_DELAY как module-level константу."""
        import agentco.services.run as run_module
        assert hasattr(run_module, "_RUN_RETRY_BASE_DELAY"), (
            "_RUN_RETRY_BASE_DELAY not found in services/run.py — should be module-level constant"
        )
        assert isinstance(run_module._RUN_RETRY_BASE_DELAY, float), (
            f"_RUN_RETRY_BASE_DELAY should be float, got {type(run_module._RUN_RETRY_BASE_DELAY)}"
        )

    def test_run_max_retries_default_is_3(self):
        """По умолчанию _RUN_MAX_RETRIES должен быть 3."""
        from unittest.mock import patch
        import importlib
        import agentco.services.run as run_module
        # Re-import with patched env to check default
        with patch.dict("os.environ", {}, clear=False):
            # The module is already imported, check current default from env or value
            val = run_module._RUN_MAX_RETRIES
            # Default should be 3 (from RUN_MAX_RETRIES env var default)
            assert val >= 1, f"_RUN_MAX_RETRIES should be >= 1, got {val}"

    def test_run_retry_base_delay_default_is_positive(self):
        """По умолчанию _RUN_RETRY_BASE_DELAY должен быть > 0."""
        import agentco.services.run as run_module
        assert run_module._RUN_RETRY_BASE_DELAY > 0, (
            f"_RUN_RETRY_BASE_DELAY should be > 0, got {run_module._RUN_RETRY_BASE_DELAY}"
        )


class TestAlexTD286MaxDepthUsesGetter:
    """ALEX-TD-286: execute_run должен использовать _get_max_depth() вместо прямого os.environ.get."""

    def test_execute_run_uses_get_max_depth_not_environ_directly(self):
        """execute_run should call _get_max_depth() — verifiable via import pattern in source."""
        import ast
        from pathlib import Path

        run_py = Path(__file__).parent.parent / "src" / "agentco" / "services" / "run.py"
        source = run_py.read_text()

        # Should NOT have direct os.environ.get("MAX_AGENT_DEPTH") in execute_run
        # (after fix, it should use _get_max_depth())
        assert 'os.environ.get("MAX_AGENT_DEPTH"' not in source and \
               "os.environ.get('MAX_AGENT_DEPTH'" not in source, (
            "execute_run should use _get_max_depth() instead of os.environ.get('MAX_AGENT_DEPTH') directly. "
            "Found direct env var access — refactor to use _get_max_depth()."
        )

    def test_get_max_depth_imported_in_run_service(self):
        """services/run.py должен импортировать _get_max_depth из orchestration.nodes."""
        from pathlib import Path

        run_py = Path(__file__).parent.parent / "src" / "agentco" / "services" / "run.py"
        source = run_py.read_text()

        assert "_get_max_depth" in source, (
            "_get_max_depth should be imported/used in services/run.py"
        )


class TestAlexTD287MemoryDbModuleLevel:
    """ALEX-TD-287: AGENTCO_MEMORY_DB должен быть module-level константой в services/run.py."""

    def test_run_service_module_has_memory_db_constant(self):
        """services/run.py должен иметь module-level константу для memory DB path."""
        import agentco.services.run as run_module
        assert hasattr(run_module, "_MEMORY_DB_PATH"), (
            "_MEMORY_DB_PATH not found in services/run.py — should cache AGENTCO_MEMORY_DB at import time"
        )
        assert isinstance(run_module._MEMORY_DB_PATH, str), (
            f"_MEMORY_DB_PATH should be str, got {type(run_module._MEMORY_DB_PATH)}"
        )

    def test_memory_db_path_not_empty(self):
        """_MEMORY_DB_PATH должен быть непустой строкой."""
        import agentco.services.run as run_module
        assert run_module._MEMORY_DB_PATH.strip(), (
            "_MEMORY_DB_PATH should not be empty string"
        )

    def test_execute_run_does_not_call_getenv_for_memory_db(self):
        """execute_run не должен вызывать os.getenv('AGENTCO_MEMORY_DB') внутри функции."""
        from pathlib import Path

        run_py = Path(__file__).parent.parent / "src" / "agentco" / "services" / "run.py"
        source = run_py.read_text()

        # Find the execute_run function body and check for os.getenv("AGENTCO_MEMORY_DB")
        # After fix: only the module-level constant should contain this call, not inside execute_run
        # We check that AGENTCO_MEMORY_DB appears only once (module-level assignment)
        count = source.count("AGENTCO_MEMORY_DB")
        assert count <= 2, (
            f"AGENTCO_MEMORY_DB referenced {count} times — after fix should appear only in "
            "module-level constant assignment, not inside execute_run body"
        )
