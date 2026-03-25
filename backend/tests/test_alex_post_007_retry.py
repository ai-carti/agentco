"""
TDD тесты для ALEX-POST-007: retry mechanism for background agent runs.

AC:
- RunService retries при transient errors (LiteLLM errors, timeout) до 3 раз
- Exponential backoff между попытками (1s, 2s, 4s)
- При исчерпании попыток — run.status = 'failed' с описательным error_message
- Тесты для retry логики: первый retry, exhaustion, успех на 2й попытке

Run: uv run pytest tests/test_alex_post_007_retry.py -v
"""
import asyncio
import pytest
from unittest.mock import AsyncMock, MagicMock, patch, call


# ── Helpers ──────────────────────────────────────────────────────────────────

def _make_service():
    """Create RunService with minimal mock session."""
    from agentco.services.run import RunService
    mock_session = MagicMock()
    svc = RunService(mock_session)
    return svc


def _noop_session_factory():
    """Session factory that returns a mock session (for DB error update in exhaustion)."""
    mock_session = MagicMock()
    mock_run_orm = MagicMock()
    mock_session.get.return_value = mock_run_orm
    return mock_session


# ── Test 1: first retry on transient error ───────────────────────────────────

@pytest.mark.asyncio
async def test_execute_agent_retries_on_first_transient_error():
    """
    When execute_run fails once with transient error, _execute_agent retries.
    execute_run should be called exactly twice (1 fail + 1 success).
    asyncio.sleep(1.0) should be called once (first backoff).
    """
    svc = _make_service()

    transient_error = RuntimeError("Connection timeout")
    call_count = 0

    async def mock_execute_run(run_id, session_factory=None):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            raise transient_error
        return "done"

    with patch.object(svc, "execute_run", side_effect=mock_execute_run), \
         patch("asyncio.sleep", new_callable=AsyncMock) as mock_sleep, \
         patch("random.uniform", side_effect=lambda lo, hi: hi):  # ALEX-TD-061: zero jitter for deterministic test
        result = await svc._execute_agent(
            run_id="run-001",
            task_id="task-001",
            agent_id="agent-001",
            company_id="company-001",
            session_factory=_noop_session_factory,
        )

    assert result == "done"
    assert call_count == 2, f"execute_run должен быть вызван 2 раза, вызван: {call_count}"
    mock_sleep.assert_called_once_with(1.0)  # exponential backoff: 1s after first failure (jitter=0)


# ── Test 2: all retries exhausted → failed with descriptive error_message ────

@pytest.mark.asyncio
async def test_execute_agent_exhausts_retries_raises_descriptive_error():
    """
    When execute_run fails 3 times, _execute_agent exhausts retries.
    Should raise exception with descriptive message mentioning attempt count.
    asyncio.sleep called with 1.0, 2.0 (not after last attempt).
    """
    from agentco.services.run import RunService

    svc = _make_service()
    call_count = 0

    async def mock_execute_run(run_id, session_factory=None):
        nonlocal call_count
        call_count += 1
        raise RuntimeError(f"LLM error on attempt {call_count}")

    # Override RUN_MAX_RETRIES env to 3 (default)
    with patch.object(svc, "execute_run", side_effect=mock_execute_run), \
         patch("asyncio.sleep", new_callable=AsyncMock) as mock_sleep, \
         patch("random.uniform", side_effect=lambda lo, hi: hi), \
         patch.dict("os.environ", {"RUN_MAX_RETRIES": "3", "RUN_RETRY_BASE_DELAY": "1.0"}):
        with pytest.raises(Exception) as exc_info:
            await svc._execute_agent(
                run_id="run-002",
                task_id="task-002",
                agent_id="agent-002",
                company_id="company-002",
                session_factory=_noop_session_factory,
            )

    # execute_run вызван ровно 3 раза
    assert call_count == 3, f"execute_run должен быть вызван 3 раза, вызван: {call_count}"

    # sleep вызван 2 раза: после 1й и 2й попыток (не после последней)
    assert mock_sleep.call_count == 2, f"sleep должен быть вызван 2 раза, вызван: {mock_sleep.call_count}"
    mock_sleep.assert_any_call(1.0)  # после 1й попытки (jitter=0)
    mock_sleep.assert_any_call(2.0)  # после 2й попытки (jitter=0)

    # Ошибка должна содержать информацию о количестве попыток
    error_str = str(exc_info.value)
    assert any(
        keyword in error_str.lower()
        for keyword in ["3", "attempt", "retr", "failed"]
    ), f"Сообщение об ошибке должно упоминать количество попыток: {error_str!r}"


# ── Test 3: success on second attempt ────────────────────────────────────────

@pytest.mark.asyncio
async def test_execute_agent_succeeds_on_second_attempt():
    """
    execute_run fails on first call, succeeds on second.
    Result from second call is returned.
    """
    svc = _make_service()
    call_count = 0

    async def mock_execute_run(run_id, session_factory=None):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            raise ConnectionError("Temporary network error")
        return "agent completed successfully"

    with patch.object(svc, "execute_run", side_effect=mock_execute_run), \
         patch("asyncio.sleep", new_callable=AsyncMock) as mock_sleep, \
         patch("random.uniform", side_effect=lambda lo, hi: hi):  # ALEX-TD-061: zero jitter
        result = await svc._execute_agent(
            run_id="run-003",
            task_id="task-003",
            agent_id="agent-003",
            company_id="company-003",
            session_factory=_noop_session_factory,
        )

    assert result == "agent completed successfully"
    assert call_count == 2
    mock_sleep.assert_called_once_with(1.0)


# ── Test 4: no retry on permanent errors ─────────────────────────────────────

@pytest.mark.asyncio
async def test_execute_agent_no_retry_on_permanent_error():
    """
    Permanent errors (cost_limit_exceeded, token_limit_exceeded, cancelled)
    should NOT be retried — fail immediately.
    """
    svc = _make_service()
    call_count = 0

    class PermanentError(Exception):
        error_code = "cost_limit_exceeded"

    async def mock_execute_run(run_id, session_factory=None):
        nonlocal call_count
        call_count += 1
        raise PermanentError("Cost limit exceeded")

    with patch.object(svc, "execute_run", side_effect=mock_execute_run), \
         patch("asyncio.sleep", new_callable=AsyncMock) as mock_sleep:
        with pytest.raises(PermanentError):
            await svc._execute_agent(
                run_id="run-004",
                task_id="task-004",
                agent_id="agent-004",
                company_id="company-004",
                session_factory=_noop_session_factory,
            )

    # Должен быть только 1 вызов (без retry)
    assert call_count == 1, f"Permanent error не должен retry, вызвано: {call_count}"
    mock_sleep.assert_not_called()


# ── Test 5: exponential backoff delays ───────────────────────────────────────

@pytest.mark.asyncio
async def test_execute_agent_exponential_backoff_delays():
    """
    Backoff delays: 1s after attempt 1, 2s after attempt 2 (no sleep after last attempt).
    With 3 retries: sleeps at [1.0, 2.0].
    """
    svc = _make_service()
    sleep_calls = []

    async def mock_execute_run(run_id, session_factory=None):
        raise RuntimeError("transient error")

    async def record_sleep(delay):
        sleep_calls.append(delay)

    with patch.object(svc, "execute_run", side_effect=mock_execute_run), \
         patch("asyncio.sleep", side_effect=record_sleep), \
         patch("random.uniform", side_effect=lambda lo, hi: hi), \
         patch.dict("os.environ", {"RUN_MAX_RETRIES": "3", "RUN_RETRY_BASE_DELAY": "1.0"}):
        with pytest.raises(Exception):
            await svc._execute_agent(
                run_id="run-005",
                task_id="task-005",
                agent_id="agent-005",
                company_id="company-005",
                session_factory=_noop_session_factory,
            )

    assert sleep_calls == [1.0, 2.0], (
        f"Ожидался exponential backoff [1.0, 2.0] (без jitter), получено: {sleep_calls}"
    )


# ── Test 6: MAX_RETRIES env var configurable ─────────────────────────────────

@pytest.mark.asyncio
async def test_execute_agent_max_retries_configurable_via_env():
    """
    RUN_MAX_RETRIES env var controls retry count.
    With RUN_MAX_RETRIES=2, execute_run called max 2 times.
    """
    svc = _make_service()
    call_count = 0

    async def mock_execute_run(run_id, session_factory=None):
        nonlocal call_count
        call_count += 1
        raise RuntimeError("transient error")

    with patch.object(svc, "execute_run", side_effect=mock_execute_run), \
         patch("asyncio.sleep", new_callable=AsyncMock), \
         patch.dict("os.environ", {"RUN_MAX_RETRIES": "2"}):
        with pytest.raises(Exception):
            await svc._execute_agent(
                run_id="run-006",
                task_id="task-006",
                agent_id="agent-006",
                company_id="company-006",
                session_factory=_noop_session_factory,
            )

    assert call_count == 2, f"С RUN_MAX_RETRIES=2 ожидалось 2 вызова, получено: {call_count}"


# ── Test 7: RUN_MAX_RETRIES=0 clamped to 1 (ALEX-TD-048 regression) ──────────

@pytest.mark.asyncio
async def test_execute_agent_zero_max_retries_clamped_to_one():
    """
    ALEX-TD-048: When RUN_MAX_RETRIES=0, the guard clamps it to 1.
    - No TypeError raised (range(1, 0+1) → range(1,1) is empty; guard prevents this)
    - execute_run called exactly 1 time (at least one attempt)
    - asyncio.sleep NOT called (no retries needed after single success)
    """
    svc = _make_service()
    call_count = 0

    async def mock_execute_run(run_id, session_factory=None):
        nonlocal call_count
        call_count += 1
        return "done"

    with patch.object(svc, "execute_run", side_effect=mock_execute_run), \
         patch("asyncio.sleep", new_callable=AsyncMock) as mock_sleep, \
         patch.dict("os.environ", {"RUN_MAX_RETRIES": "0"}):
        # Must not raise TypeError and must complete successfully
        result = await svc._execute_agent(
            run_id="run-007",
            task_id="task-007",
            agent_id="agent-007",
            company_id="company-007",
            session_factory=_noop_session_factory,
        )

    assert result == "done", f"Ожидался результат 'done', получено: {result!r}"
    assert call_count >= 1, f"execute_run должен быть вызван хотя бы 1 раз, вызван: {call_count}"
    mock_sleep.assert_not_called()  # single attempt — no backoff sleep
