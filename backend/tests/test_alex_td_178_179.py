"""
ALEX-TD-178: handlers/tasks.py, handlers/companies.py, handlers/credentials.py,
             handlers/memory.py, handlers/mcp_servers.py, handlers/library.py
             — missing module-level logger (observability gap)

ALEX-TD-179: handlers/agents.py — AgentCreate.parent_agent_id has no max_length constraint.
             An attacker can send a 10KB+ parent_agent_id string that bypasses Pydantic
             validation and hits session.get(AgentORM, parent_agent_id) with a massive buffer.
             Similar to ALEX-TD-172 (library agent_id).

TDD: tests written FIRST (red), then code makes them green.
"""
import inspect
import logging


# ── ALEX-TD-178: Missing loggers in handlers ─────────────────────────────────

class TestALEXTD178HandlersLogging:
    """
    ALEX-TD-178: Six critical handlers lack module-level loggers.

    When DB failures, permission errors, or unexpected exceptions occur in
    production, there's nothing in the logs — the incident is invisible.
    """

    def test_tasks_handler_has_logger(self):
        """handlers/tasks.py must define a module-level logger."""
        import agentco.handlers.tasks as mod
        assert hasattr(mod, "logger"), (
            "handlers/tasks.py is missing a module-level logger. "
            "Add: import logging; logger = logging.getLogger(__name__)"
        )
        assert isinstance(mod.logger, logging.Logger), (
            f"tasks logger is {type(mod.logger)}, expected logging.Logger"
        )

    def test_tasks_handler_imports_logging(self):
        import agentco.handlers.tasks as mod
        source = inspect.getsource(mod)
        assert "import logging" in source, "handlers/tasks.py must import logging"

    def test_companies_handler_has_logger(self):
        """handlers/companies.py must define a module-level logger."""
        import agentco.handlers.companies as mod
        assert hasattr(mod, "logger"), (
            "handlers/companies.py is missing a module-level logger. "
            "Add: import logging; logger = logging.getLogger(__name__)"
        )
        assert isinstance(mod.logger, logging.Logger), (
            f"companies logger is {type(mod.logger)}, expected logging.Logger"
        )

    def test_companies_handler_imports_logging(self):
        import agentco.handlers.companies as mod
        source = inspect.getsource(mod)
        assert "import logging" in source, "handlers/companies.py must import logging"

    def test_credentials_handler_has_logger(self):
        """handlers/credentials.py must define a module-level logger."""
        import agentco.handlers.credentials as mod
        assert hasattr(mod, "logger"), (
            "handlers/credentials.py is missing a module-level logger. "
            "Add: import logging; logger = logging.getLogger(__name__)"
        )
        assert isinstance(mod.logger, logging.Logger), (
            f"credentials logger is {type(mod.logger)}, expected logging.Logger"
        )

    def test_credentials_handler_imports_logging(self):
        import agentco.handlers.credentials as mod
        source = inspect.getsource(mod)
        assert "import logging" in source, "handlers/credentials.py must import logging"

    def test_memory_handler_has_logger(self):
        """handlers/memory.py must define a module-level logger."""
        import agentco.handlers.memory as mod
        assert hasattr(mod, "logger"), (
            "handlers/memory.py is missing a module-level logger. "
            "Add: import logging; logger = logging.getLogger(__name__)"
        )
        assert isinstance(mod.logger, logging.Logger), (
            f"memory logger is {type(mod.logger)}, expected logging.Logger"
        )

    def test_memory_handler_imports_logging(self):
        import agentco.handlers.memory as mod
        source = inspect.getsource(mod)
        assert "import logging" in source, "handlers/memory.py must import logging"

    def test_mcp_servers_handler_has_logger(self):
        """handlers/mcp_servers.py must define a module-level logger."""
        import agentco.handlers.mcp_servers as mod
        assert hasattr(mod, "logger"), (
            "handlers/mcp_servers.py is missing a module-level logger. "
            "Add: import logging; logger = logging.getLogger(__name__)"
        )
        assert isinstance(mod.logger, logging.Logger), (
            f"mcp_servers logger is {type(mod.logger)}, expected logging.Logger"
        )

    def test_mcp_servers_handler_imports_logging(self):
        import agentco.handlers.mcp_servers as mod
        source = inspect.getsource(mod)
        assert "import logging" in source, "handlers/mcp_servers.py must import logging"

    def test_library_handler_has_logger(self):
        """handlers/library.py must define a module-level logger."""
        import agentco.handlers.library as mod
        assert hasattr(mod, "logger"), (
            "handlers/library.py is missing a module-level logger. "
            "Add: import logging; logger = logging.getLogger(__name__)"
        )
        assert isinstance(mod.logger, logging.Logger), (
            f"library logger is {type(mod.logger)}, expected logging.Logger"
        )

    def test_library_handler_imports_logging(self):
        import agentco.handlers.library as mod
        source = inspect.getsource(mod)
        assert "import logging" in source, "handlers/library.py must import logging"


# ── ALEX-TD-179: parent_agent_id max_length ───────────────────────────────────

class TestALEXTD179ParentAgentIdMaxLength:
    """
    ALEX-TD-179: AgentCreate.parent_agent_id must have max_length constraint.

    Without max_length, a client can send a 10KB+ parent_agent_id string.
    It bypasses Pydantic validation and hits session.get(AgentORM, parent_agent_id)
    with a huge buffer — unnecessarily allocating memory and hitting the DB.

    UUIDs are 36 chars. max_length=100 allows generous headroom for future
    ID formats while still rejecting obvious abuse.
    """

    def _get_parent_agent_id_max_length(self):
        """Extract maxLength from parent_agent_id field schema.

        For Optional[str] Pydantic generates anyOf: [{type: string, maxLength: N}, {type: null}].
        We need to look inside anyOf to find the maxLength.
        """
        from agentco.handlers.agents import AgentCreate

        schema = AgentCreate.model_json_schema()
        parent_prop = schema.get("properties", {}).get("parent_agent_id", {})

        # Direct maxLength (non-Optional)
        if "maxLength" in parent_prop:
            return parent_prop["maxLength"]

        # Optional[str] → anyOf: [{type: string, maxLength: N}, {type: null}]
        for variant in parent_prop.get("anyOf", []):
            if "maxLength" in variant:
                return variant["maxLength"]

        return None

    def test_agent_create_parent_agent_id_has_max_length(self):
        """AgentCreate.parent_agent_id must have max_length set."""
        max_length = self._get_parent_agent_id_max_length()
        assert max_length is not None, (
            "AgentCreate.parent_agent_id is missing maxLength in JSON schema. "
            "Add: parent_agent_id: str | None = Field(default=None, max_length=100)"
        )

    def test_agent_create_parent_agent_id_max_length_value(self):
        """AgentCreate.parent_agent_id maxLength should be at most 100."""
        max_length = self._get_parent_agent_id_max_length()
        assert max_length is not None, "maxLength not set on parent_agent_id"
        assert max_length <= 100, (
            f"parent_agent_id maxLength={max_length} is too large. "
            "UUIDs are 36 chars; use max_length=100 for headroom."
        )

    def test_agent_create_rejects_oversized_parent_agent_id(self):
        """AgentCreate must reject parent_agent_id longer than max_length."""
        from pydantic import ValidationError
        from agentco.handlers.agents import AgentCreate

        oversized = "x" * 200  # 200 chars >> 100 max
        try:
            AgentCreate(name="Test Agent", parent_agent_id=oversized)
            assert False, (
                "AgentCreate accepted a 200-char parent_agent_id — "
                "max_length validation is not enforced"
            )
        except ValidationError:
            pass  # expected

    def test_agent_create_accepts_valid_uuid_parent_agent_id(self):
        """AgentCreate must accept a normal UUID parent_agent_id."""
        import uuid
        from agentco.handlers.agents import AgentCreate

        valid_uuid = str(uuid.uuid4())  # 36 chars
        obj = AgentCreate(name="Test Agent", parent_agent_id=valid_uuid)
        assert obj.parent_agent_id == valid_uuid

    def test_agent_create_accepts_none_parent_agent_id(self):
        """AgentCreate must still accept None parent_agent_id (root agent)."""
        from agentco.handlers.agents import AgentCreate

        obj = AgentCreate(name="Root Agent", parent_agent_id=None)
        assert obj.parent_agent_id is None
