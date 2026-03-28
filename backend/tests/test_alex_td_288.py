"""
ALEX-TD-288: tools=[] не должен передаваться в LiteLLM вызов.

Пустой [] вызывает 400 Bad Request у Anthropic/Gemini.
Guard: if tools: — передавать tools только если список непустой.
"""
from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


def _make_chunk(content: str = "", finish_reason: str | None = None, tokens: int = 0):
    """Helper: create a mock streaming chunk."""
    chunk = MagicMock()
    delta = MagicMock()
    delta.content = content
    delta.tool_calls = None
    choice = MagicMock()
    choice.delta = delta
    choice.finish_reason = finish_reason
    chunk.choices = [choice]
    usage = MagicMock()
    usage.total_tokens = tokens
    chunk.usage = usage
    return chunk


async def _mock_stream(chunks):
    for c in chunks:
        yield c


@pytest.mark.asyncio
async def test_empty_tools_not_passed_to_litellm():
    """When tools=[], the 'tools' key must NOT appear in acompletion kwargs."""
    from agentco.orchestration.agent_node import agent_node

    chunks = [
        _make_chunk(content="hello"),
        _make_chunk(finish_reason="stop", tokens=10),
    ]

    captured_kwargs = {}

    async def mock_acompletion(**kwargs):
        captured_kwargs.update(kwargs)
        return _mock_stream(chunks)

    state = {
        "model": "gpt-4o",
        "system_prompt": "You are helpful.",
        "messages": [{"role": "user", "content": "Hi"}],
        "tools": [],  # <-- empty list!
        "tool_handlers": {},
        "agent_id": "test",
        "company_id": "test-co",
    }

    with patch("agentco.orchestration.agent_node.litellm.acompletion", side_effect=mock_acompletion):
        with patch("agentco.orchestration.agent_node._publish_chunk", new_callable=AsyncMock):
            with patch("agentco.orchestration.agent_node._publish_completion", new_callable=AsyncMock):
                with patch("agentco.orchestration.agent_node._save_result_to_memory", new_callable=AsyncMock):
                    result = await agent_node(state)

    # tools key must NOT be in the call kwargs
    assert "tools" not in captured_kwargs, (
        f"Empty tools=[] should not be passed to LiteLLM, but got tools={captured_kwargs.get('tools')}"
    )
    assert result["messages"][0]["content"] == "hello"


@pytest.mark.asyncio
async def test_nonempty_tools_passed_to_litellm():
    """When tools is non-empty, the 'tools' key MUST appear in acompletion kwargs."""
    from agentco.orchestration.agent_node import agent_node, get_delegate_task_tool

    chunks = [
        _make_chunk(content="sure"),
        _make_chunk(finish_reason="stop", tokens=15),
    ]

    captured_kwargs = {}

    async def mock_acompletion(**kwargs):
        captured_kwargs.update(kwargs)
        return _mock_stream(chunks)

    tool_def = get_delegate_task_tool()
    state = {
        "model": "gpt-4o",
        "system_prompt": "You are helpful.",
        "messages": [{"role": "user", "content": "Delegate something"}],
        "tools": [tool_def],
        "tool_handlers": {},
        "agent_id": "test",
        "company_id": "test-co",
    }

    with patch("agentco.orchestration.agent_node.litellm.acompletion", side_effect=mock_acompletion):
        with patch("agentco.orchestration.agent_node._publish_chunk", new_callable=AsyncMock):
            with patch("agentco.orchestration.agent_node._publish_completion", new_callable=AsyncMock):
                with patch("agentco.orchestration.agent_node._save_result_to_memory", new_callable=AsyncMock):
                    result = await agent_node(state)

    assert "tools" in captured_kwargs, "Non-empty tools should be passed to LiteLLM"
    assert captured_kwargs["tools"] == [tool_def]


@pytest.mark.asyncio
async def test_none_tools_not_passed_to_litellm():
    """When tools is None (or missing), 'tools' key must NOT appear in kwargs."""
    from agentco.orchestration.agent_node import agent_node

    chunks = [
        _make_chunk(content="ok"),
        _make_chunk(finish_reason="stop", tokens=5),
    ]

    captured_kwargs = {}

    async def mock_acompletion(**kwargs):
        captured_kwargs.update(kwargs)
        return _mock_stream(chunks)

    state = {
        "model": "gpt-4o",
        "system_prompt": "You are helpful.",
        "messages": [{"role": "user", "content": "Hi"}],
        # tools not set at all
        "tool_handlers": {},
        "agent_id": "test",
        "company_id": "test-co",
    }

    with patch("agentco.orchestration.agent_node.litellm.acompletion", side_effect=mock_acompletion):
        with patch("agentco.orchestration.agent_node._publish_chunk", new_callable=AsyncMock):
            with patch("agentco.orchestration.agent_node._publish_completion", new_callable=AsyncMock):
                with patch("agentco.orchestration.agent_node._save_result_to_memory", new_callable=AsyncMock):
                    result = await agent_node(state)

    assert "tools" not in captured_kwargs
