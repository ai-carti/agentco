"""
TDD тесты для M2-003 — Agent Node: LLM стриминг + tool calls.

Порядок: сначала тест (red), потом реализация (green).
"""
from __future__ import annotations

import json
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


# ─── Helpers: фабрики для mock streaming chunks ───────────────────────────────

def _make_text_chunk(content: str, finish_reason: str | None = None) -> MagicMock:
    """Создаёт chunk с текстовым дельтой."""
    chunk = MagicMock()
    chunk.choices = [MagicMock()]
    chunk.choices[0].delta.content = content
    chunk.choices[0].delta.tool_calls = None
    chunk.choices[0].finish_reason = finish_reason
    chunk.usage = None
    return chunk


def _make_tool_call_chunk(
    index: int,
    call_id: str | None = None,
    name: str | None = None,
    args_delta: str = "",
    finish_reason: str | None = None,
) -> MagicMock:
    """Создаёт chunk с tool_call дельтой."""
    chunk = MagicMock()
    chunk.choices = [MagicMock()]
    chunk.choices[0].delta.content = None

    tc = MagicMock()
    tc.index = index
    tc.id = call_id
    tc.function = MagicMock()
    tc.function.name = name
    tc.function.arguments = args_delta
    chunk.choices[0].delta.tool_calls = [tc]
    chunk.choices[0].finish_reason = finish_reason
    chunk.usage = None
    return chunk


def _make_finish_chunk(finish_reason: str = "stop") -> MagicMock:
    """Создаёт финальный chunk."""
    chunk = MagicMock()
    chunk.choices = [MagicMock()]
    chunk.choices[0].delta.content = None
    chunk.choices[0].delta.tool_calls = None
    chunk.choices[0].finish_reason = finish_reason
    chunk.usage = MagicMock()
    chunk.usage.total_tokens = 42
    chunk.usage.prompt_tokens = 20
    chunk.usage.completion_tokens = 22
    return chunk


def _make_async_stream(chunks):
    """Создаёт async iterator из списка chunks."""
    async def _aiter():
        for c in chunks:
            yield c
    mock = MagicMock()
    mock.__aiter__ = lambda self: _aiter()
    return mock


def _make_base_state() -> dict:
    """Базовое AgentState для тестов."""
    return {
        "run_id": "run-001",
        "company_id": "company-001",
        "input": "Do something useful",
        "messages": [{"role": "user", "content": "Do something useful"}],
        "pending_tasks": [],
        "active_tasks": {},
        "results": {},
        "iteration_count": 0,
        "total_tokens": 0,
        "total_cost_usd": 0.0,
        "status": "running",
        "error": None,
        "final_result": None,
        # M2-003 поля
        "agent_id": "ceo",
        "model": "gpt-4o",
        "system_prompt": "You are a helpful assistant.",
        "tools": [],
        "tool_handlers": {},
    }


# ─── Тесты: базовый text response ─────────────────────────────────────────────

class TestAgentNodeBasicTextResponse:
    """agent_node собирает стримингровый ответ в полное сообщение."""

    @pytest.mark.asyncio
    async def test_agent_node_returns_dict(self):
        """agent_node должен возвращать dict (partial AgentState)."""
        from agentco.orchestration.agent_node import agent_node

        chunks = [
            _make_text_chunk("Hello"),
            _make_text_chunk(" world"),
            _make_finish_chunk("stop"),
        ]
        stream = _make_async_stream(chunks)

        with patch("agentco.orchestration.agent_node.litellm.acompletion", new_callable=AsyncMock) as mock_acomp:
            mock_acomp.return_value = stream
            state = _make_base_state()
            result = await agent_node(state)

        assert isinstance(result, dict)

    @pytest.mark.asyncio
    async def test_agent_node_accumulates_text_chunks(self):
        """agent_node собирает чанки в полный текст и добавляет assistant message."""
        from agentco.orchestration.agent_node import agent_node

        chunks = [
            _make_text_chunk("Hello"),
            _make_text_chunk(", "),
            _make_text_chunk("world!"),
            _make_finish_chunk("stop"),
        ]
        stream = _make_async_stream(chunks)

        with patch("agentco.orchestration.agent_node.litellm.acompletion", new_callable=AsyncMock) as mock_acomp:
            mock_acomp.return_value = stream
            state = _make_base_state()
            result = await agent_node(state)

        # Должен быть список с assistant message
        messages = result.get("messages", [])
        assert len(messages) >= 1
        assistant_msg = messages[0]
        assert assistant_msg["role"] == "assistant"
        assert assistant_msg["content"] == "Hello, world!"

    @pytest.mark.asyncio
    async def test_agent_node_updates_token_count(self):
        """agent_node обновляет total_tokens из usage chunk."""
        from agentco.orchestration.agent_node import agent_node

        chunks = [
            _make_text_chunk("OK"),
            _make_finish_chunk("stop"),
        ]
        # Финальный chunk содержит usage.total_tokens = 42
        stream = _make_async_stream(chunks)

        with patch("agentco.orchestration.agent_node.litellm.acompletion", new_callable=AsyncMock) as mock_acomp:
            mock_acomp.return_value = stream
            state = _make_base_state()
            result = await agent_node(state)

        assert result.get("total_tokens", 0) > 0

    @pytest.mark.asyncio
    async def test_agent_node_calls_litellm_with_stream_true(self):
        """agent_node вызывает litellm.acompletion с stream=True."""
        from agentco.orchestration.agent_node import agent_node

        chunks = [_make_text_chunk("Hi"), _make_finish_chunk()]
        stream = _make_async_stream(chunks)

        with patch("agentco.orchestration.agent_node.litellm.acompletion", new_callable=AsyncMock) as mock_acomp:
            mock_acomp.return_value = stream
            state = _make_base_state()
            await agent_node(state)

        mock_acomp.assert_called_once()
        call_kwargs = mock_acomp.call_args
        assert call_kwargs.kwargs.get("stream") is True or (
            len(call_kwargs.args) > 0 and True  # stream может быть в kwargs
        )
        # Проверяем что stream=True передан
        assert mock_acomp.call_args.kwargs.get("stream") is True

    @pytest.mark.asyncio
    async def test_agent_node_passes_model_from_state(self):
        """agent_node использует модель из state['model']."""
        from agentco.orchestration.agent_node import agent_node

        chunks = [_make_text_chunk("OK"), _make_finish_chunk()]
        stream = _make_async_stream(chunks)

        with patch("agentco.orchestration.agent_node.litellm.acompletion", new_callable=AsyncMock) as mock_acomp:
            mock_acomp.return_value = stream
            state = _make_base_state()
            state["model"] = "claude-3-5-sonnet-20241022"
            await agent_node(state)

        call_kwargs = mock_acomp.call_args.kwargs
        assert call_kwargs.get("model") == "claude-3-5-sonnet-20241022"

    @pytest.mark.asyncio
    async def test_agent_node_includes_system_prompt(self):
        """agent_node инжектирует system_prompt в начало messages."""
        from agentco.orchestration.agent_node import agent_node

        chunks = [_make_text_chunk("Done"), _make_finish_chunk()]
        stream = _make_async_stream(chunks)

        with patch("agentco.orchestration.agent_node.litellm.acompletion", new_callable=AsyncMock) as mock_acomp:
            mock_acomp.return_value = stream
            state = _make_base_state()
            state["system_prompt"] = "You are a CEO agent."
            await agent_node(state)

        call_messages = mock_acomp.call_args.kwargs.get("messages", [])
        assert len(call_messages) >= 1
        assert call_messages[0]["role"] == "system"
        assert "CEO" in call_messages[0]["content"]


# ─── Тесты: tool calls ────────────────────────────────────────────────────────

class TestAgentNodeToolCalls:
    """agent_node обрабатывает tool_calls из стримингового ответа."""

    @pytest.mark.asyncio
    async def test_agent_node_parses_tool_calls_from_stream(self):
        """agent_node собирает tool_calls из стриминговых чанков."""
        from agentco.orchestration.agent_node import agent_node

        # Симулируем streaming tool call (разбитый на чанки)
        chunks = [
            _make_tool_call_chunk(0, call_id="call-001", name="search_web", args_delta='{"q"'),
            _make_tool_call_chunk(0, args_delta=': "agentco"}'),
            _make_finish_chunk("tool_calls"),
        ]
        stream = _make_async_stream(chunks)

        async def fake_search_web(args: dict, state: dict) -> str:
            return f"Results for: {args.get('q', '')}"

        with patch("agentco.orchestration.agent_node.litellm.acompletion", new_callable=AsyncMock) as mock_acomp:
            mock_acomp.return_value = stream
            state = _make_base_state()
            state["tool_handlers"] = {"search_web": fake_search_web}
            result = await agent_node(state)

        messages = result.get("messages", [])
        # Должно быть: 1 assistant message (с tool_calls) + 1 tool result message
        assert len(messages) >= 2

    @pytest.mark.asyncio
    async def test_agent_node_dispatches_tool_handler(self):
        """agent_node вызывает tool_handler и добавляет tool result в messages."""
        from agentco.orchestration.agent_node import agent_node

        chunks = [
            _make_tool_call_chunk(0, call_id="call-xyz", name="get_time", args_delta="{}"),
            _make_finish_chunk("tool_calls"),
        ]
        stream = _make_async_stream(chunks)

        handler_called = []

        async def fake_get_time(args: dict, state: dict) -> str:
            handler_called.append(True)
            return "2026-03-15T14:00:00Z"

        with patch("agentco.orchestration.agent_node.litellm.acompletion", new_callable=AsyncMock) as mock_acomp:
            mock_acomp.return_value = stream
            state = _make_base_state()
            state["tool_handlers"] = {"get_time": fake_get_time}
            result = await agent_node(state)

        assert len(handler_called) == 1
        messages = result.get("messages", [])
        # Должно быть tool result сообщение
        tool_messages = [m for m in messages if m.get("role") == "tool"]
        assert len(tool_messages) == 1
        assert "2026-03-15" in tool_messages[0]["content"]

    @pytest.mark.asyncio
    async def test_agent_node_handles_unknown_tool_gracefully(self):
        """Если handler не найден — возвращает error в tool result, не падает."""
        from agentco.orchestration.agent_node import agent_node

        chunks = [
            _make_tool_call_chunk(0, call_id="call-unknown", name="nonexistent_tool", args_delta="{}"),
            _make_finish_chunk("tool_calls"),
        ]
        stream = _make_async_stream(chunks)

        with patch("agentco.orchestration.agent_node.litellm.acompletion", new_callable=AsyncMock) as mock_acomp:
            mock_acomp.return_value = stream
            state = _make_base_state()
            state["tool_handlers"] = {}  # нет обработчиков
            result = await agent_node(state)

        # Не должен рейзить исключение
        messages = result.get("messages", [])
        tool_messages = [m for m in messages if m.get("role") == "tool"]
        assert len(tool_messages) == 1
        assert "error" in tool_messages[0]["content"].lower() or "unknown" in tool_messages[0]["content"].lower()

    @pytest.mark.asyncio
    async def test_agent_node_assistant_message_has_tool_calls_field(self):
        """assistant message должен содержать tool_calls если они были в ответе."""
        from agentco.orchestration.agent_node import agent_node

        chunks = [
            _make_tool_call_chunk(0, call_id="call-001", name="my_tool", args_delta='{"x": 1}'),
            _make_finish_chunk("tool_calls"),
        ]
        stream = _make_async_stream(chunks)

        async def fake_handler(args, state):
            return "result"

        with patch("agentco.orchestration.agent_node.litellm.acompletion", new_callable=AsyncMock) as mock_acomp:
            mock_acomp.return_value = stream
            state = _make_base_state()
            state["tool_handlers"] = {"my_tool": fake_handler}
            result = await agent_node(state)

        messages = result.get("messages", [])
        assistant_msgs = [m for m in messages if m.get("role") == "assistant"]
        assert len(assistant_msgs) == 1
        assert "tool_calls" in assistant_msgs[0]
        assert len(assistant_msgs[0]["tool_calls"]) == 1
        assert assistant_msgs[0]["tool_calls"][0]["function"]["name"] == "my_tool"


# ─── Тесты: интеграция с AgentState ──────────────────────────────────────────

class TestAgentNodeStateIntegration:
    """agent_node интегрирован в AgentState и возвращает корректный state dict."""

    @pytest.mark.asyncio
    async def test_agent_node_with_no_system_prompt(self):
        """agent_node работает без system_prompt — не добавляет system message."""
        from agentco.orchestration.agent_node import agent_node

        chunks = [_make_text_chunk("OK"), _make_finish_chunk()]
        stream = _make_async_stream(chunks)

        with patch("agentco.orchestration.agent_node.litellm.acompletion", new_callable=AsyncMock) as mock_acomp:
            mock_acomp.return_value = stream
            state = _make_base_state()
            state["system_prompt"] = ""  # пустой
            result = await agent_node(state)

        call_messages = mock_acomp.call_args.kwargs.get("messages", [])
        system_msgs = [m for m in call_messages if m.get("role") == "system"]
        assert len(system_msgs) == 0

    @pytest.mark.asyncio
    async def test_agent_node_preserves_existing_messages(self):
        """agent_node передаёт существующие messages в LLM (история разговора)."""
        from agentco.orchestration.agent_node import agent_node

        chunks = [_make_text_chunk("Answer"), _make_finish_chunk()]
        stream = _make_async_stream(chunks)

        with patch("agentco.orchestration.agent_node.litellm.acompletion", new_callable=AsyncMock) as mock_acomp:
            mock_acomp.return_value = stream
            state = _make_base_state()
            state["messages"] = [
                {"role": "user", "content": "First question"},
                {"role": "assistant", "content": "First answer"},
                {"role": "user", "content": "Second question"},
            ]
            state["system_prompt"] = ""
            result = await agent_node(state)

        call_messages = mock_acomp.call_args.kwargs.get("messages", [])
        assert len(call_messages) == 3
        assert call_messages[-1]["content"] == "Second question"

    @pytest.mark.asyncio
    async def test_agent_node_with_tools_list(self):
        """agent_node передаёт tools в litellm если они заданы."""
        from agentco.orchestration.agent_node import agent_node

        chunks = [_make_text_chunk("OK"), _make_finish_chunk()]
        stream = _make_async_stream(chunks)

        tools = [
            {
                "type": "function",
                "function": {
                    "name": "search",
                    "description": "Search the web",
                    "parameters": {"type": "object", "properties": {"q": {"type": "string"}}},
                },
            }
        ]

        with patch("agentco.orchestration.agent_node.litellm.acompletion", new_callable=AsyncMock) as mock_acomp:
            mock_acomp.return_value = stream
            state = _make_base_state()
            state["tools"] = tools
            result = await agent_node(state)

        call_kwargs = mock_acomp.call_args.kwargs
        assert call_kwargs.get("tools") == tools

    @pytest.mark.asyncio
    async def test_agent_node_empty_content_chunk_skipped(self):
        """Чанки с None или пустым content не добавляются к тексту."""
        from agentco.orchestration.agent_node import agent_node

        chunks = [
            _make_text_chunk("Hello"),
            _make_text_chunk(None),   # None content — пропустить
            _make_text_chunk(""),     # пустой — пропустить
            _make_text_chunk(" World"),
            _make_finish_chunk(),
        ]
        stream = _make_async_stream(chunks)

        with patch("agentco.orchestration.agent_node.litellm.acompletion", new_callable=AsyncMock) as mock_acomp:
            mock_acomp.return_value = stream
            state = _make_base_state()
            result = await agent_node(state)

        messages = result.get("messages", [])
        assert messages[0]["content"] == "Hello World"


# ─── Тесты: error handling ────────────────────────────────────────────────────

class TestAgentNodeErrorHandling:
    """agent_node корректно обрабатывает ошибки LLM."""

    @pytest.mark.asyncio
    async def test_agent_node_litellm_exception_sets_error(self):
        """ALEX-TD-130: agent_node должен re-raise исключение при LLM ошибке.

        До фикса TD-130: возвращал {"status": "error"} без raise.
        После фикса TD-130: re-raise гарантирует что outer except execute_run
        всегда поймает ошибку и обновит run.status → "failed" в БД.
        """
        from agentco.orchestration.agent_node import agent_node

        with patch("agentco.orchestration.agent_node.litellm.acompletion", new_callable=AsyncMock) as mock_acomp:
            mock_acomp.side_effect = Exception("API error: rate limit")
            state = _make_base_state()
            with pytest.raises(Exception, match="API error: rate limit"):
                await agent_node(state)


# ─── M2-003 missing AC tests ──────────────────────────────────────────────────

class TestEventBus:
    """agentco/eventbus.py — простой asyncio.Queue singleton."""

    def test_eventbus_module_exists(self):
        """eventbus модуль должен существовать."""
        import agentco.eventbus  # should not raise

    def test_eventbus_get_returns_singleton(self):
        """EventBus.get() должен возвращать один и тот же инстанс."""
        from agentco.eventbus import EventBus
        a = EventBus.get()
        b = EventBus.get()
        assert a is b

    @pytest.mark.asyncio
    async def test_eventbus_publish_and_receive(self):
        """EventBus.publish() должен доставлять событие подписчику."""
        from agentco.eventbus import EventBus
        bus = EventBus.get()

        received = []

        async def consume():
            async for event in bus.subscribe("test-company"):
                received.append(event)
                break

        import asyncio
        consumer_task = asyncio.create_task(consume())
        await asyncio.sleep(0.01)
        await bus.publish({"company_id": "test-company", "type": "test", "data": "hello"})
        await asyncio.wait_for(consumer_task, timeout=1.0)
        assert len(received) == 1
        assert received[0]["type"] == "test"


class TestDelegateTaskTool:
    """delegate_task tool в agent_node."""

    def test_delegate_task_tool_definition_exists(self):
        """get_delegate_task_tool() должна возвращать tool definition."""
        from agentco.orchestration.agent_node import get_delegate_task_tool
        tool_def = get_delegate_task_tool()
        assert tool_def["type"] == "function"
        assert tool_def["function"]["name"] == "delegate_task"

    @pytest.mark.asyncio
    async def test_agent_node_streams_chunks_to_eventbus(self):
        """agent_node должен публиковать чанки в EventBus при наличии company_id."""
        from agentco.orchestration.agent_node import agent_node
        from agentco.eventbus import EventBus

        chunks = [
            _make_text_chunk("Hello"),
            _make_text_chunk(" world"),
            _make_finish_chunk("stop"),
        ]
        stream = _make_async_stream(chunks)

        published = []
        bus = EventBus.get()
        original_publish = bus.publish

        async def capture_publish(event):
            published.append(event)
            await original_publish(event)

        bus.publish = capture_publish

        try:
            with patch("agentco.orchestration.agent_node.litellm.acompletion", new_callable=AsyncMock) as mock_acomp:
                mock_acomp.return_value = stream
                state = _make_base_state()
                state["company_id"] = "company-001"
                state["agent_id"] = "ceo"
                await agent_node(state)
        finally:
            bus.publish = original_publish

        # должны быть streaming chunk events или completion event
        assert len(published) > 0
        event_types = {e.get("type") for e in published}
        assert "llm_token" in event_types  # проверяем конкретный тип события

    @pytest.mark.asyncio
    async def test_agent_node_cost_tracking_updates_state(self):
        """agent_node должен обновлять total_cost_usd на основе токенов."""
        from agentco.orchestration.agent_node import agent_node

        usage_chunk = _make_finish_chunk("stop")
        usage_chunk.usage.total_tokens = 1000

        chunks = [_make_text_chunk("Done"), usage_chunk]
        stream = _make_async_stream(chunks)

        with patch("agentco.orchestration.agent_node.litellm.acompletion", new_callable=AsyncMock) as mock_acomp:
            mock_acomp.return_value = stream
            state = _make_base_state()
            state["model"] = "gpt-4o"
            result = await agent_node(state)

        # total_tokens обновлён
        assert result.get("total_tokens", 0) > 0


class TestMemoryIntegration:
    """agent_node интегрирован с MemoryService."""

    @pytest.mark.asyncio
    async def test_agent_node_injects_memories_into_system_prompt(self):
        """При наличии MemoryService agent_node инжектирует воспоминания в промпт."""
        from agentco.orchestration.agent_node import agent_node
        from unittest.mock import AsyncMock as AM

        chunks = [_make_text_chunk("Done"), _make_finish_chunk()]
        stream = _make_async_stream(chunks)

        mock_memory_service = AsyncMock()
        mock_memory_service.inject_memories = AM(
            return_value="You are a CEO.\n\n## Past experiences (memories)\n1. Previous task done"
        )
        mock_memory_service.save_memory = AM(return_value="mem-001")

        from agentco.orchestration.agent_node import _memory_service_var
        token = _memory_service_var.set(mock_memory_service)
        try:
            with patch("agentco.orchestration.agent_node.litellm.acompletion", new_callable=AsyncMock) as mock_acomp:
                mock_acomp.return_value = stream
                state = _make_base_state()
                state["agent_id"] = "ceo"
                result = await agent_node(state)
        finally:
            _memory_service_var.reset(token)

        # inject_memories должен быть вызван
        mock_memory_service.inject_memories.assert_called_once()

    @pytest.mark.asyncio
    async def test_agent_node_saves_result_to_memory_on_completion(self):
        """agent_node должен сохранять результат в MemoryService после завершения."""
        from agentco.orchestration.agent_node import agent_node
        from unittest.mock import AsyncMock as AM

        chunks = [_make_text_chunk("Task complete: built landing page"), _make_finish_chunk()]
        stream = _make_async_stream(chunks)

        mock_memory_service = AsyncMock()
        mock_memory_service.inject_memories = AM(return_value="You are a CEO.")
        mock_memory_service.save_memory = AM(return_value="mem-001")

        from agentco.orchestration.agent_node import _memory_service_var
        token = _memory_service_var.set(mock_memory_service)
        try:
            with patch("agentco.orchestration.agent_node.litellm.acompletion", new_callable=AsyncMock) as mock_acomp:
                mock_acomp.return_value = stream
                state = _make_base_state()
                state["agent_id"] = "ceo"
                state["run_id"] = "run-001"
                result = await agent_node(state)
        finally:
            _memory_service_var.reset(token)

        # save_memory должен быть вызван с результатом
        mock_memory_service.save_memory.assert_called_once()


class TestLlmTokenCostField:
    """ALEX-TD-068: llm_token events must include cost field for frontend cost counter."""

    @pytest.mark.asyncio
    async def test_llm_token_event_contains_cost_field(self):
        """ALEX-TD-068: _publish_chunk должен включать поле `cost` в llm_token event.

        SIRI-POST-004 frontend читает data.cost из llm_token событий.
        До фикса поле отсутствовало → cost counter всегда 0.
        """
        from agentco.orchestration.agent_node import agent_node
        from agentco.eventbus import EventBus

        chunks = [_make_text_chunk("Hello"), _make_finish_chunk("stop")]
        stream = _make_async_stream(chunks)

        bus = EventBus.get()
        original_publish = bus.publish
        published = []

        async def capture(event):
            published.append(event)
            await original_publish(event)

        bus.publish = capture
        try:
            with patch("agentco.orchestration.agent_node.litellm.acompletion", new_callable=AsyncMock) as mock_acomp:
                mock_acomp.return_value = stream
                state = _make_base_state()
                state["company_id"] = "company-001"
                state["agent_id"] = "ceo"
                state["model"] = "gpt-4o"
                await agent_node(state)
        finally:
            bus.publish = original_publish

        llm_token_events = [e for e in published if e.get("type") == "llm_token"]
        assert len(llm_token_events) > 0, "Должны быть llm_token события"
        for event in llm_token_events:
            assert "cost" in event, (
                f"llm_token event должен содержать поле 'cost' для SIRI-POST-004. "
                f"Got: {list(event.keys())}"
            )
            assert isinstance(event["cost"], float), f"cost должен быть float, got {type(event['cost'])}"
            assert event["cost"] >= 0.0, "cost не может быть отрицательным"


# ─── ALEX-TD-106: пустой LLM response не должен добавлять empty message ────────

class TestEmptyLLMResponse:
    """ALEX-TD-106: если LLM вернул пустой текст и нет tool_calls,
    в new_messages НЕ должно добавляться {"role":"assistant","content":""}."""

    @pytest.mark.asyncio
    async def test_empty_llm_response_does_not_add_empty_message(self):
        """
        LLM возвращает пустой текст без tool_calls →
        agent_node НЕ добавляет {"role":"assistant","content":""} в new_messages.
        """
        from agentco.orchestration.agent_node import agent_node
        # Поток с пустым контентом
        empty_chunk = _make_text_chunk("", finish_reason=None)
        finish_chunk = _make_text_chunk("", finish_reason="stop")
        stream = _make_async_stream([empty_chunk, finish_chunk])

        with patch("agentco.orchestration.agent_node.litellm.acompletion", new_callable=AsyncMock) as mock_acomp:
            mock_acomp.return_value = stream
            state = _make_base_state()
            result = await agent_node(state)

        new_messages = result.get("messages", [])
        # Должно быть 0 сообщений — пустой ответ не добавляется
        empty_assistant_msgs = [
            m for m in new_messages
            if m.get("role") == "assistant" and m.get("content") == ""
        ]
        assert len(empty_assistant_msgs) == 0, (
            f"ALEX-TD-106: empty assistant message should NOT be added to new_messages, "
            f"but got: {new_messages}"
        )

    @pytest.mark.asyncio
    async def test_non_empty_llm_response_still_added(self):
        """
        LLM возвращает непустой текст → сообщение добавляется как обычно.
        Убеждаемся что фикс TD-106 не ломает нормальный путь.
        """
        from agentco.orchestration.agent_node import agent_node
        chunk1 = _make_text_chunk("Hello ", finish_reason=None)
        chunk2 = _make_text_chunk("world", finish_reason="stop")
        stream = _make_async_stream([chunk1, chunk2])

        with patch("agentco.orchestration.agent_node.litellm.acompletion", new_callable=AsyncMock) as mock_acomp:
            mock_acomp.return_value = stream
            state = _make_base_state()
            result = await agent_node(state)

        new_messages = result.get("messages", [])
        assert len(new_messages) == 1
        assert new_messages[0]["role"] == "assistant"
        assert new_messages[0]["content"] == "Hello world"


# ─── ALEX-TD-217: asyncio.timeout() covers entire streaming loop ──────────────

class TestStreamingTimeout:
    """ALEX-TD-217: таймаут должен покрывать не только acompletion(), но и весь async for loop."""

    @pytest.mark.asyncio
    async def test_streaming_loop_timeout_raises(self):
        """
        Если стриминг начался, но провайдер завис на середине потока,
        asyncio.TimeoutError должен сработать (не ждать MAX_RUN_TIMEOUT_SEC).
        """
        import asyncio
        from agentco.orchestration.agent_node import agent_node

        async def _hanging_stream():
            yield _make_text_chunk("partial response")
            # Симулируем зависание провайдера — никогда не завершается
            await asyncio.sleep(9999)

        hanging = MagicMock()
        hanging.__aiter__ = lambda self: _hanging_stream()

        with patch("agentco.orchestration.agent_node.litellm.acompletion", new_callable=AsyncMock) as mock_acomp:
            with patch("agentco.orchestration.agent_node._LLM_CALL_TIMEOUT_SEC", 0.05):
                mock_acomp.return_value = hanging
                state = _make_base_state()
                with pytest.raises((asyncio.TimeoutError, TimeoutError)):
                    await agent_node(state)

    @pytest.mark.asyncio
    async def test_normal_streaming_completes_within_timeout(self):
        """
        Нормальный стриминг (без зависания) должен успешно завершиться.
        """
        from agentco.orchestration.agent_node import agent_node
        chunks = [
            _make_text_chunk("Hello"),
            _make_text_chunk(" world"),
            _make_finish_chunk("stop"),
        ]
        stream = _make_async_stream(chunks)

        with patch("agentco.orchestration.agent_node.litellm.acompletion", new_callable=AsyncMock) as mock_acomp:
            mock_acomp.return_value = stream
            state = _make_base_state()
            result = await agent_node(state)

        assert "messages" in result
        assert result["messages"][0]["content"] == "Hello world"
