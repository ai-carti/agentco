"""
Tests for ALEX-POST-004: Structured logging + tracing

AC:
- structlog installed, all print() replaced by structured logging
- Middleware adds correlation_id (UUID) to every request
- Correlation ID is propagated through LangGraph run log events
- .env.example updated: OTLP_ENDPOINT (optional)
- Tests pass without breaking existing 400+ tests
"""
import uuid
import pytest
import structlog
from fastapi.testclient import TestClient

from agentco.main import app
from agentco.middleware.correlation import correlation_id_ctx


# ─── Test: structlog is importable and configured ──────────────────────────

def test_structlog_importable():
    """structlog must be installed."""
    import structlog  # noqa: F401


def test_structlog_logger_works():
    """structlog.get_logger() returns a bound logger."""
    logger = structlog.get_logger("test")
    assert logger is not None
    # Should not raise
    logger.info("test_event", key="value")


# ─── Test: correlation_id middleware ───────────────────────────────────────

def test_correlation_id_in_response_header(auth_client):
    """Every response must include X-Correlation-ID header."""
    client, _ = auth_client
    response = client.get("/health")
    assert response.status_code == 200
    assert "x-correlation-id" in response.headers


def test_correlation_id_is_valid_uuid(auth_client):
    """X-Correlation-ID header must be a valid UUID."""
    client, _ = auth_client
    response = client.get("/health")
    correlation_id = response.headers.get("x-correlation-id")
    assert correlation_id is not None
    # Must be a valid UUID
    parsed = uuid.UUID(correlation_id)
    assert str(parsed) == correlation_id


def test_correlation_id_unique_per_request(auth_client):
    """Each request gets a unique correlation ID."""
    client, _ = auth_client
    ids = set()
    for _ in range(5):
        response = client.get("/health")
        ids.add(response.headers.get("x-correlation-id"))
    assert len(ids) == 5


def test_client_supplied_correlation_id_is_forwarded(auth_client):
    """If client sends X-Correlation-ID, it is echoed back."""
    client, _ = auth_client
    custom_id = str(uuid.uuid4())
    response = client.get("/health", headers={"X-Correlation-ID": custom_id})
    assert response.headers.get("x-correlation-id") == custom_id


# ─── Test: correlation_id context var ──────────────────────────────────────

def test_correlation_id_ctx_var():
    """correlation_id_ctx is a ContextVar accessible from middleware."""
    from agentco.middleware.correlation import correlation_id_ctx
    token = correlation_id_ctx.set("test-corr-id")
    assert correlation_id_ctx.get() == "test-corr-id"
    correlation_id_ctx.reset(token)


# ─── Test: logging_config module exists ────────────────────────────────────

def test_logging_config_module():
    """logging_config module must be importable and have setup_logging."""
    from agentco.logging_config import setup_logging
    assert callable(setup_logging)


def test_setup_logging_does_not_raise():
    """setup_logging() must not raise."""
    from agentco.logging_config import setup_logging
    setup_logging()  # Should be idempotent


# ─── Test: no raw print() calls in src ─────────────────────────────────────

def test_no_print_in_source(tmp_path):
    """There should be no bare print() calls in src/agentco/*.py (not in tests)."""
    import ast
    import os

    src_dir = os.path.join(
        os.path.dirname(__file__), "..", "src", "agentco"
    )
    violations = []

    for root, dirs, files in os.walk(src_dir):
        # Skip .venv
        dirs[:] = [d for d in dirs if d != ".venv" and d != "__pycache__"]
        for fname in files:
            if not fname.endswith(".py"):
                continue
            fpath = os.path.join(root, fname)
            with open(fpath) as f:
                source = f.read()
            try:
                tree = ast.parse(source, filename=fpath)
            except SyntaxError:
                continue
            for node in ast.walk(tree):
                if isinstance(node, ast.Call):
                    func = node.func
                    if isinstance(func, ast.Name) and func.id == "print":
                        violations.append(f"{fpath}:{node.lineno}")

    assert violations == [], f"Found raw print() calls:\n" + "\n".join(violations)
