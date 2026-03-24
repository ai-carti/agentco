"""
ALEX-TD-176: handlers/runs.py — no structured logging (observability gap)
ALEX-TD-177: handlers/agents.py — no structured logging (observability gap)

TDD: tests written FIRST (red), then code makes them green.

Both handlers are the most critical HTTP endpoints in the system, but have ZERO logging.
When unexpected errors occur in prod (DB failures, unexpected state), there's nothing in the logs.
Fix: add `import logging; logger = logging.getLogger(__name__)` to both handlers, and use
logger.error() for unexpected 5xx-class exceptions.
"""
import logging
import sys


class TestALEXTD176RunsHandlerLogging:
    """
    ALEX-TD-176: handlers/runs.py must have a module-level logger.

    The runs handler manages the most critical lifecycle events in AgentCo:
    run creation, listing, stopping, events. Without logging, unexpected
    errors (DB failures, concurrent access issues) are invisible in prod.
    """

    def test_runs_handler_has_module_level_logger(self):
        """handlers/runs.py must define a module-level logger."""
        import agentco.handlers.runs as runs_mod

        assert hasattr(runs_mod, "logger"), (
            "handlers/runs.py is missing a module-level logger. "
            "Add: logger = logging.getLogger(__name__)"
        )

    def test_runs_handler_logger_is_logging_logger(self):
        """The logger in handlers/runs.py must be a standard logging.Logger instance."""
        import agentco.handlers.runs as runs_mod

        assert hasattr(runs_mod, "logger"), "handlers/runs.py has no logger attribute"
        assert isinstance(runs_mod.logger, logging.Logger), (
            f"runs_mod.logger is {type(runs_mod.logger)}, expected logging.Logger. "
            "Use: logger = logging.getLogger(__name__)"
        )

    def test_runs_handler_logger_name_is_module_path(self):
        """Logger name should reflect module path for easy filtering in prod logs."""
        import agentco.handlers.runs as runs_mod

        assert hasattr(runs_mod, "logger"), "handlers/runs.py has no logger attribute"
        assert "runs" in runs_mod.logger.name, (
            f"Logger name '{runs_mod.logger.name}' doesn't contain 'runs'. "
            "Expected name like 'agentco.handlers.runs'. "
            "Use: logger = logging.getLogger(__name__)"
        )

    def test_runs_handler_imports_logging(self):
        """handlers/runs.py must import the logging module."""
        import agentco.handlers.runs as runs_mod
        import inspect

        source = inspect.getsource(runs_mod)
        assert "import logging" in source, (
            "handlers/runs.py does not import logging. "
            "Add: import logging"
        )


class TestALEXTD177AgentsHandlerLogging:
    """
    ALEX-TD-177: handlers/agents.py must have a module-level logger.

    Agents are a critical resource: create/update/delete with ownership checks.
    Without logging, DB failures, permission errors, and race conditions
    during concurrent agent modifications are invisible in prod.
    """

    def test_agents_handler_has_module_level_logger(self):
        """handlers/agents.py must define a module-level logger."""
        import agentco.handlers.agents as agents_mod

        assert hasattr(agents_mod, "logger"), (
            "handlers/agents.py is missing a module-level logger. "
            "Add: logger = logging.getLogger(__name__)"
        )

    def test_agents_handler_logger_is_logging_logger(self):
        """The logger in handlers/agents.py must be a standard logging.Logger instance."""
        import agentco.handlers.agents as agents_mod

        assert hasattr(agents_mod, "logger"), "handlers/agents.py has no logger attribute"
        assert isinstance(agents_mod.logger, logging.Logger), (
            f"agents_mod.logger is {type(agents_mod.logger)}, expected logging.Logger. "
            "Use: logger = logging.getLogger(__name__)"
        )

    def test_agents_handler_logger_name_is_module_path(self):
        """Logger name should reflect module path for easy filtering in prod logs."""
        import agentco.handlers.agents as agents_mod

        assert hasattr(agents_mod, "logger"), "handlers/agents.py has no logger attribute"
        assert "agents" in agents_mod.logger.name, (
            f"Logger name '{agents_mod.logger.name}' doesn't contain 'agents'. "
            "Expected name like 'agentco.handlers.agents'. "
            "Use: logger = logging.getLogger(__name__)"
        )

    def test_agents_handler_imports_logging(self):
        """handlers/agents.py must import the logging module."""
        import agentco.handlers.agents as agents_mod
        import inspect

        source = inspect.getsource(agents_mod)
        assert "import logging" in source, (
            "handlers/agents.py does not import logging. "
            "Add: import logging"
        )
