"""
ALEX-TD-191: agent_node LLM failure должен логировать exc_info=True.

TDD: RED → проверяем что logger.error вызывается с exc_info=True при LLM-ошибке.
"""
import logging
import pytest
from unittest.mock import AsyncMock, MagicMock, patch, call


@pytest.mark.asyncio
async def test_agent_node_logs_exc_info_on_llm_failure():
    """
    ALEX-TD-191: когда acompletion бросает исключение в agent_node,
    logger.error должен вызываться с exc_info=True, чтобы traceback попадал в логи.
    """
    from agentco.orchestration.agent_node import agent_node

    state = {
        "company_id": "co-1",
        "run_id": "run-1",
        "agent_id": "agent-1",
        "task": "test task",
        "system_prompt": "You are a test agent.",
        "messages": [],
        "total_tokens": 0,
        "total_cost_usd": 0.0,
    }

    error = RuntimeError("LLM API exploded")

    with patch("agentco.orchestration.agent_node.litellm.acompletion", new_callable=AsyncMock) as mock_acomp, \
         patch("agentco.orchestration.agent_node.logger") as mock_logger:

        mock_acomp.side_effect = error

        with pytest.raises(RuntimeError, match="LLM API exploded"):
            await agent_node(state)

        # ALEX-TD-191: должен быть вызов logger.error с exc_info=True
        error_calls = mock_logger.error.call_args_list
        assert len(error_calls) >= 1, "logger.error should be called at least once"

        # Проверяем, что хотя бы один вызов содержит exc_info=True
        has_exc_info = any(
            c.kwargs.get("exc_info") is True
            for c in error_calls
        )
        assert has_exc_info, (
            "logger.error must be called with exc_info=True so traceback appears in logs. "
            f"Got calls: {error_calls}"
        )
