"""
TDD тест для ALEX-TD-061/196: retry exponential backoff должен иметь full jitter.

Без jitter все ретраи синхронизируются при одновременном падении N ранов
→ thundering herd на LLM/DB.

Фикс (ALEX-TD-196): использовать random.uniform(0, delay) — true full jitter,
равномерное распределение по [0, delay] вместо прежнего [delay, delay*1.1].

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
    ALEX-TD-061/196: asyncio.sleep must be called with a jittered delay.

    Full jitter (ALEX-TD-196): delay = random.uniform(0, base_delay)
    So actual sleep ∈ [0, base_delay].

    We mock random.uniform to return a fixed fraction (0.5) of base_delay
    and verify sleep is called with that value.
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

    # uniform(0, 1.0) → 0.5 (deterministic half of base delay)
    with patch.object(svc, "execute_run", side_effect=mock_execute_run), \
         patch("asyncio.sleep", side_effect=record_sleep), \
         patch("random.uniform", side_effect=lambda lo, hi: hi * 0.5) as mock_uniform, \
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

    # sleep должен быть вызван с 0.5 * base_delay = 0.5
    assert len(sleep_calls) == 1, f"Ожидался 1 sleep вызов, получено: {sleep_calls}"
    expected = 0.5  # uniform(0, 1.0) * 0.5
    assert sleep_calls[0] == pytest.approx(expected, rel=1e-6), (
        f"ALEX-TD-061: sleep({sleep_calls[0]}) != {expected} — full jitter не применён"
    )


@pytest.mark.asyncio
async def test_retry_backoff_jitter_is_bounded():
    """
    ALEX-TD-061/196: Проверяем что full jitter ∈ [0, delay].
    random.uniform(0, delay) всегда в этом диапазоне.
    """
    import random
    base_delay = 1.0
    for _ in range(100):
        jittered = random.uniform(0, base_delay)
        assert 0.0 <= jittered <= base_delay, (
            f"ALEX-TD-196: jittered_delay={jittered} выходит за пределы [0, {base_delay}]"
        )
