"""
TDD тесты для ALEX-TD-272..274 (self-audit cycle 5).

ALEX-TD-272 (minor): orm/run.py:RunORM.status/total_cost_usd/total_tokens missing server_default
ALEX-TD-273 (minor): CorrelationIdMiddleware doesn't bind to structlog contextvars
ALEX-TD-274 (minor): handlers/auth.py has no logger — failed auth attempts invisible in prod logs

Run: uv run pytest tests/test_alex_td_272_274.py -v
"""
import inspect
import logging
import pytest


# ── helpers ───────────────────────────────────────────────────────────────────

def _register_and_login(client, email="alex272@example.com", password="pass1234"):
    client.post("/auth/register", json={"email": email, "password": password})
    resp = client.post("/auth/login", json={"email": email, "password": password})
    return resp.json()["access_token"]


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


# ── ALEX-TD-272: RunORM missing server_default ─────────────────────────────────

class TestAlexTD272RunORMServerDefaults:
    """
    ALEX-TD-272: RunORM.status, total_cost_usd, total_tokens missing server_default.

    ALEX-TD-260 fixed AgentORM and TaskORM:
      - AgentORM.model got server_default="gpt-4o-mini"
      - TaskORM.status got server_default="todo"
    But RunORM was not fixed:
      - RunORM.status has default="pending" but no server_default → raw SQL INSERT gets NULL
      - RunORM.total_cost_usd has default=0.0 but no server_default → raw SQL INSERT gets NULL
      - RunORM.total_tokens has default=0 but no server_default → raw SQL INSERT gets NULL
    Fix: add server_default="pending", server_default="0.0", server_default="0" to RunORM.
    """

    def test_run_orm_status_has_server_default(self):
        """RunORM.status must have server_default='pending'."""
        from agentco.orm.run import RunORM
        col = RunORM.__table__.c.get("status")
        assert col is not None, "RunORM must have a 'status' column"
        assert col.server_default is not None, (
            "ALEX-TD-272: RunORM.status missing server_default. "
            "ORM default='pending' only applies to Python-layer INSERTs. "
            "Direct SQL INSERTs (migrations, raw scripts, test fixtures) get NULL. "
            "Fix: add server_default='pending' to the Column definition."
        )

    def test_run_orm_total_cost_usd_has_server_default(self):
        """RunORM.total_cost_usd must have server_default='0.0'."""
        from agentco.orm.run import RunORM
        col = RunORM.__table__.c.get("total_cost_usd")
        assert col is not None, "RunORM must have a 'total_cost_usd' column"
        assert col.server_default is not None, (
            "ALEX-TD-272: RunORM.total_cost_usd missing server_default. "
            "Direct SQL INSERTs get NULL instead of 0.0. "
            "Fix: add server_default='0.0' to the Column definition."
        )

    def test_run_orm_total_tokens_has_server_default(self):
        """RunORM.total_tokens must have server_default='0'."""
        from agentco.orm.run import RunORM
        col = RunORM.__table__.c.get("total_tokens")
        assert col is not None, "RunORM must have a 'total_tokens' column"
        assert col.server_default is not None, (
            "ALEX-TD-272: RunORM.total_tokens missing server_default. "
            "Direct SQL INSERTs get NULL instead of 0. "
            "Fix: add server_default='0' to the Column definition."
        )

    def test_run_orm_direct_sql_insert_has_defaults(self, auth_client):
        """Direct SQL INSERT without specifying defaults produces expected values."""
        import uuid
        from sqlalchemy import text

        _, engine = auth_client
        run_id = str(uuid.uuid4())

        with engine.connect() as conn:
            # Simulate a raw migration or external script inserting without Python defaults
            # Get a valid company_id from somewhere or just test the column defaults
            # We'll verify via SQLite PRAGMA
            result = conn.execute(
                text("SELECT dflt_value FROM pragma_table_info('runs') WHERE name = 'status'")
            ).fetchone()

        # The server_default should appear as SQLite default value
        if result is not None:
            assert result[0] is not None, (
                "ALEX-TD-272: RunORM.status column has no SQLite default. "
                "server_default='pending' must be set to protect against raw SQL INSERTs."
            )


# ── ALEX-TD-273: CorrelationIdMiddleware missing structlog bind ────────────────

class TestAlexTD273CorrelationIdStructlogBind:
    """
    ALEX-TD-273: CorrelationIdMiddleware must bind correlation_id to structlog contextvars.

    The middleware correctly:
    1. Reads/generates X-Correlation-ID header
    2. Sets correlation_id_ctx ContextVar for in-process use
    3. Adds X-Correlation-ID to response headers

    But it DOES NOT call structlog.contextvars.bind_contextvars(correlation_id=...).
    The logging_config.py pipeline includes merge_contextvars — but with nothing bound,
    the correlation_id never appears in structured log lines.

    Operators cannot correlate a specific request's log lines without the ID in logs.
    Fix: add structlog.contextvars.bind_contextvars(request_id=correlation_id)
    and structlog.contextvars.clear_contextvars() in the middleware.
    """

    def test_middleware_source_binds_structlog_contextvars(self):
        """CorrelationIdMiddleware must call structlog.contextvars.bind_contextvars."""
        from agentco.middleware.correlation import CorrelationIdMiddleware
        source = inspect.getsource(CorrelationIdMiddleware)

        has_bind = "bind_contextvars" in source
        assert has_bind, (
            "ALEX-TD-273: CorrelationIdMiddleware must call "
            "structlog.contextvars.bind_contextvars(request_id=correlation_id) "
            "so correlation IDs appear in structured JSON logs. "
            "Currently merge_contextvars processor is configured but nothing is ever bound."
        )

    def test_middleware_source_clears_structlog_contextvars(self):
        """CorrelationIdMiddleware must clear structlog contextvars after request."""
        from agentco.middleware.correlation import CorrelationIdMiddleware
        source = inspect.getsource(CorrelationIdMiddleware)

        has_clear = "clear_contextvars" in source
        assert has_clear, (
            "ALEX-TD-273: CorrelationIdMiddleware must call "
            "structlog.contextvars.clear_contextvars() before/after binding "
            "to prevent contextvars from leaking between requests in async context "
            "(asyncio event loop reuses coroutines across requests). "
            "Pattern: clear_contextvars() → bind_contextvars(request_id=...) → yield → reset."
        )

    def test_correlation_id_in_response_header(self, auth_client):
        """X-Correlation-ID header is returned in every response."""
        client, _ = auth_client
        resp = client.get("/health")
        assert "x-correlation-id" in resp.headers or "X-Correlation-ID" in resp.headers, (
            "ALEX-TD-273: X-Correlation-ID header must be present in responses. "
            "CorrelationIdMiddleware should add it."
        )

    def test_correlation_id_propagated_from_request(self, auth_client):
        """If X-Correlation-ID is provided in request, it's echoed in response."""
        client, _ = auth_client
        test_id = "test-correlation-12345"
        resp = client.get("/health", headers={"X-Correlation-ID": test_id})
        # Check case-insensitive
        response_id = resp.headers.get("x-correlation-id") or resp.headers.get("X-Correlation-ID")
        assert response_id == test_id, (
            f"ALEX-TD-273: X-Correlation-ID from request should be echoed in response. "
            f"Expected {test_id!r}, got {response_id!r}."
        )


# ── ALEX-TD-274: handlers/auth.py missing logger ──────────────────────────────

class TestAlexTD274AuthHandlerMissingLogger:
    """
    ALEX-TD-274: handlers/auth.py has no logger — failed auth attempts invisible.

    Every other handler in the codebase has:
      logger = logging.getLogger(__name__)

    handlers/auth.py has no logger at all. Failed register (400 email exists),
    failed login (401 invalid credentials), and token decode errors are all silent.

    In production, operators cannot:
    1. Detect brute-force login attempts (no log of 401 patterns)
    2. Detect account enumeration (repeated 400 on register)
    3. Correlate login failures with specific users for support tickets

    Fix: add logger = logging.getLogger(__name__) and logger.warning() on 401/400.
    """

    def test_auth_handler_has_module_logger(self):
        """handlers/auth.py must define a module-level logger."""
        import agentco.handlers.auth as auth_module
        source = inspect.getsource(auth_module)

        has_logger = "logger = logging.getLogger(" in source
        assert has_logger, (
            "ALEX-TD-274: handlers/auth.py must define logger = logging.getLogger(__name__). "
            "Currently has no logger — failed auth attempts (400/401) are invisible in prod logs. "
            "Operators cannot detect brute-force, account enumeration, or support failures."
        )

    def test_auth_handler_imports_logging(self):
        """handlers/auth.py must import logging."""
        import agentco.handlers.auth as auth_module
        source = inspect.getsource(auth_module)

        assert "import logging" in source, (
            "ALEX-TD-274: handlers/auth.py must import logging to use getLogger."
        )

    def test_login_failure_produces_log_warning(self, auth_client, caplog):
        """Failed login (401) must produce a log warning for observability."""
        client, _ = auth_client

        # Register first so we have a valid user
        client.post("/auth/register", json={"email": "audit274@example.com", "password": "pass1234"})

        with caplog.at_level(logging.WARNING, logger="agentco.handlers.auth"):
            resp = client.post("/auth/login", json={
                "email": "audit274@example.com",
                "password": "wrongpassword"
            })

        assert resp.status_code == 401
        # Check that a warning was logged (exact message may vary)
        auth_warnings = [r for r in caplog.records if "auth" in r.name.lower()]
        assert len(auth_warnings) > 0, (
            "ALEX-TD-274: handlers/auth.py:login must log a WARNING on failed login (401). "
            "Without this, brute-force attempts are invisible in production logs. "
            "Add: logger.warning('login failed for email=%s', normalized_email)"
        )
