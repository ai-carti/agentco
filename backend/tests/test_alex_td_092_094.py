"""
Regression tests for ALEX-TD-092..094 — Backend Audit 2026-03-22.

ALEX-TD-092 (major): asyncio.TimeoutError from wait_for is retried up to 3× in
    _execute_agent — can block for up to 30 min (3 × MAX_RUN_TIMEOUT_SEC).
    Fix: treat asyncio.TimeoutError as permanent (no-retry), like "cancelled".

ALEX-TD-093 (minor): CredentialCreate.api_key has no max_length — allows storing
    multi-MB "API keys" in DB (cost abuse + DoS on encryption).
    Fix: add max_length=512 to api_key field.

ALEX-TD-094 (minor): _extract_tokens() silently returns 0 when provider omits
    usage in streaming chunks — cost tracking is inaccurate with no warning.
    Fix: add a logger.debug() call when usage data is missing (improves observability).

Run: uv run pytest tests/test_alex_td_092_094.py -v
"""
from __future__ import annotations

import asyncio
import inspect
import pytest
from unittest.mock import AsyncMock, MagicMock, patch


# ── ALEX-TD-092: asyncio.TimeoutError must not be retried ────────────────────

def test_execute_agent_no_retry_on_timeout_source_check():
    """
    ALEX-TD-092: _execute_agent() must not retry asyncio.TimeoutError.

    The retry loop catches all exceptions and checks _NO_RETRY_ERRORS. But
    asyncio.TimeoutError().error_code is absent and str(asyncio.TimeoutError()) == ''
    → matches nothing in _NO_RETRY_ERRORS → timeout is retried 3×.

    With MAX_RUN_TIMEOUT_SEC=600 (10 min), 3 retries = 30 min blocked task.
    Fix: add isinstance(exc, asyncio.TimeoutError) check before retry logic.
    """
    from agentco.services.run import RunService
    source = inspect.getsource(RunService._execute_agent)
    # Verify the fix is in place: TimeoutError check exists in the no-retry path
    has_timeout_check = (
        "asyncio.TimeoutError" in source
        or "TimeoutError" in source
    )
    assert has_timeout_check, (
        "ALEX-TD-092: _execute_agent() must check for asyncio.TimeoutError and "
        "not retry it. Add isinstance(exc, asyncio.TimeoutError) to the no-retry guard."
    )


def test_execute_agent_timeout_is_in_no_retry_path():
    """
    ALEX-TD-092: When execute_run raises asyncio.TimeoutError, _execute_agent must
    raise immediately without sleeping or retrying.
    """
    from agentco.services.run import RunService
    source = inspect.getsource(RunService._execute_agent)
    # Check that TimeoutError is handled at the exception-handling level
    # either via isinstance check or by adding it to _NO_RETRY_ERRORS concept
    assert (
        "isinstance(exc, asyncio.TimeoutError)" in source
        or '"TimeoutError"' in source
        or "'TimeoutError'" in source
        or "asyncio.TimeoutError" in source
    ), (
        "ALEX-TD-092: _execute_agent() must explicitly guard asyncio.TimeoutError "
        "from retry. Currently TimeoutError has str() == '' so it doesn't match "
        "anything in _NO_RETRY_ERRORS and gets retried up to 3 times."
    )


@pytest.mark.asyncio
async def test_execute_agent_does_not_retry_timeout():
    """
    ALEX-TD-092: Integration test — when execute_run raises asyncio.TimeoutError,
    _execute_agent should propagate it after 1 attempt (no retry).
    """
    from sqlalchemy.orm import Session
    from agentco.services.run import RunService

    call_count = 0

    async def mock_execute_run(run_id, session_factory=None):
        nonlocal call_count
        call_count += 1
        raise asyncio.TimeoutError()

    mock_session = MagicMock(spec=Session)
    service = RunService(mock_session)

    with patch.object(service, "execute_run", side_effect=mock_execute_run):
        with pytest.raises((asyncio.TimeoutError, Exception)):
            await service._execute_agent(
                run_id="test-run-timeout",
                task_id="task-1",
                agent_id="ceo",
                company_id="company-1",
                session_factory=lambda: mock_session,
            )

    # With the fix: exactly 1 attempt (no retry)
    assert call_count == 1, (
        f"ALEX-TD-092: asyncio.TimeoutError should not be retried — "
        f"expected 1 attempt, got {call_count}. "
        "Fix: add isinstance(exc, asyncio.TimeoutError) check before retry logic."
    )


# ── ALEX-TD-093: api_key max_length ──────────────────────────────────────────

def test_credential_create_api_key_has_max_length():
    """
    ALEX-TD-093: CredentialCreate.api_key must have max_length to prevent
    multi-MB payloads from being accepted, encrypted, and stored in DB.
    """
    from agentco.handlers.credentials import CredentialCreate
    import pydantic
    # Inspect field schema
    schema = CredentialCreate.model_json_schema()
    api_key_schema = schema.get("properties", {}).get("api_key", {})
    assert "maxLength" in api_key_schema, (
        "ALEX-TD-093: CredentialCreate.api_key must have max_length constraint. "
        "Without it, users can POST multi-MB 'API keys' that are encrypted and stored. "
        "Fix: api_key: str = Field(max_length=512)"
    )


def test_credential_create_api_key_max_length_value():
    """ALEX-TD-093: max_length for api_key should be reasonable (≤ 1024 chars)."""
    from agentco.handlers.credentials import CredentialCreate
    schema = CredentialCreate.model_json_schema()
    api_key_schema = schema.get("properties", {}).get("api_key", {})
    max_len = api_key_schema.get("maxLength", float("inf"))
    assert max_len <= 1024, (
        f"ALEX-TD-093: api_key max_length={max_len} is too large. "
        "Real API keys (OpenAI, Anthropic, Gemini) are ≤ 200 chars. "
        "Set max_length=512 to block abuse while allowing all legitimate keys."
    )


def test_credential_create_rejects_oversized_api_key():
    """ALEX-TD-093: CredentialCreate should reject api_key > max_length with ValidationError."""
    import pydantic
    from agentco.handlers.credentials import CredentialCreate
    oversized_key = "sk-" + "x" * 600  # > 512 chars

    with pytest.raises(pydantic.ValidationError) as exc_info:
        CredentialCreate(provider="openai", api_key=oversized_key)

    errors = exc_info.value.errors()
    api_key_errors = [e for e in errors if "api_key" in str(e.get("loc", ""))]
    assert api_key_errors, (
        "ALEX-TD-093: CredentialCreate must reject api_key longer than max_length. "
        "Got no validation error for 600-char key."
    )


# ── ALEX-TD-094: _extract_tokens observability ────────────────────────────────

def test_extract_tokens_logs_missing_usage():
    """
    ALEX-TD-094: _extract_tokens() silently returns 0 when chunk.usage is None
    (common with some providers in streaming mode). This makes total_tokens=0
    for the entire run, which propagates to cost_usd=0 → WarRoom shows $0 cost.

    The fix: add a logger.debug() when usage is missing so developers can diagnose
    why cost tracking shows 0 for a specific provider.

    This test verifies that _extract_tokens source has at least minimal observability
    (logger.debug or a comment documenting the known limitation).
    """
    from agentco.orchestration.agent_node import _extract_tokens
    source = inspect.getsource(_extract_tokens)
    has_observability = (
        "logger.debug" in source
        or "logger.warning" in source
        or "# NOTE" in source
        or "# Some providers" in source
        or "# streaming" in source
    )
    assert has_observability, (
        "ALEX-TD-094: _extract_tokens() returns 0 silently when chunk.usage is None. "
        "Add logger.debug() or a comment documenting when/why usage data is missing "
        "so developers can diagnose zero-cost runs. "
        "Many providers (Gemini, Anthropic streaming) don't include usage in every chunk — "
        "only in the final chunk. Without this, debugging is guesswork."
    )


def test_extract_tokens_returns_zero_for_no_usage():
    """ALEX-TD-094: _extract_tokens returns 0 when usage is None — baseline behavior preserved."""
    from agentco.orchestration.agent_node import _extract_tokens

    # Chunk with no usage
    chunk = MagicMock()
    chunk.usage = None
    assert _extract_tokens(chunk) == 0


def test_extract_tokens_returns_value_when_present():
    """ALEX-TD-094: _extract_tokens returns correct value when usage is present."""
    from agentco.orchestration.agent_node import _extract_tokens

    chunk = MagicMock()
    chunk.usage = MagicMock()
    chunk.usage.total_tokens = 150
    assert _extract_tokens(chunk) == 150
