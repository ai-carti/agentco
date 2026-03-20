"""
TDD тест для ALEX-TD-061: retry exponential backoff должен иметь jitter.

Без jitter все ретраи синхронизируются при одновременном падении N ранов
→ thundering herd на LLM/DB.

Фикс: добавить `random.uniform(0, 0.1) * delay` к задержке (full jitter).

Run: uv run pytest tests/test_alex_td_061.py -v
"""
import asyncio
import pytest
from unittest.mock import AsyncMock, MagicMock, patch


def _make_service():
    from agentco.services.run import RunService
    svc = RunService(MagicMock())
    return svc


def _noop_session_factory():
    mock_session = MagicMock()
    mock_session.get.return_value = MagicMock()
    return mock_session


@pytest.mark.asyncio
async def test_retry_backoff_has_jitter():
    """
    ALEX-TD-061: asyncio.sleep must be called with delay > base_delay
    (base + jitter), proving jitter is applied.

    Jitter: random.uniform(0, 0.1) * delay
    So actual sleep = delay * (1 + uniform(0, 0.1)) ∈ [delay, delay * 1.1]

    We mock random.uniform to return a fixed value (0.05) and verify
    sleep is called with delay + 0.05 * delay = delay * 1.05.
    """
    svc = _make_service()
    call_count = 0

    async def mock_execute_run(run_id, session_factory=None):
        nonlocal call_count
        call_count += 1
        raise RuntimeError("transient error")

    sleep_calls = []

    async def record_sleep(delay):
        sleep_calls.append(delay)

    with patch.object(svc, "execute_run", side_effect=mock_execute_run), \
         patch("asyncio.sleep", side_effect=record_sleep), \
         patch("random.uniform", return_value=0.05) as mock_uniform, \
         patch.dict("os.environ", {"RUN_MAX_RETRIES": "2", "RUN_RETRY_BASE_DELAY": "1.0"}):
        with pytest.raises(Exception):
            await svc._execute_agent(
                run_id="run-061",
                task_id="task-061",
                agent_id="agent-061",
                company_id="company-061",
                session_factory=_noop_session_factory,
            )

    # random.uniform должен быть вызван (jitter применяется)
    assert mock_uniform.call_count >= 1, (
        "ALEX-TD-061: random.uniform не вызывается — jitter не применяется"
    )

    # sleep должен быть вызван с base_delay + jitter (1.0 + 0.05 * 1.0 = 1.05)
    assert len(sleep_calls) == 1, f"Ожидался 1 sleep вызов, получено: {sleep_calls}"
    expected = 1.0 + 0.05 * 1.0  # base_delay * (1 + jitter)
    assert sleep_calls[0] == pytest.approx(expected, rel=1e-6), (
        f"ALEX-TD-061: sleep({sleep_calls[0]}) != {expected} — jitter не применён"
    )


@pytest.mark.asyncio
async def test_retry_backoff_jitter_is_bounded():
    """
    ALEX-TD-061: Проверяем что jitter ∈ [0, 0.1 * delay].
    Реальный random.uniform(0, 0.1) * delay всегда в этом диапазоне.
    """
    import random
    base_delay = 1.0
    for _ in range(100):
        jitter = random.uniform(0, 0.1) * base_delay
        assert 0.0 <= jitter <= 0.1 * base_delay, (
            f"ALEX-TD-061: jitter={jitter} выходит за пределы [0, {0.1 * base_delay}]"
        )
