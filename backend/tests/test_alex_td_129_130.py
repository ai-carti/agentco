"""
TDD тесты для ALEX-TD-129 и ALEX-TD-130.

ALEX-TD-130: agent_node при LLM ошибке должен re-raise исключение,
чтобы outer except в execute_run гарантированно обновил run.status.

ALEX-TD-129: MemoryService.get_all должна иметь async-обёртку
get_all_async через run_in_executor. Документация tech debt.
"""
from __future__ import annotations

import asyncio
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


# ─── Хелперы (копия из test_agent_node.py) ────────────────────────────────────

def _make_base_state() -> dict:
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
        "agent_id": "ceo",
        "model": "gpt-4o",
        "system_prompt": "You are a helpful assistant.",
        "tools": [],
        "tool_handlers": {},
    }


# ─── ALEX-TD-130: agent_node re-raise on LLM error ────────────────────────────

class TestAgentNodeTD130ErrorRaise:
    """
    ALEX-TD-130: agent_node должен re-raise LLM исключение,
    чтобы LangGraph propagated его в outer except execute_run.

    Без re-raise — LangGraph видит state{"status":"error"} но не исключение.
    execute_run обрабатывает status=error корректно через success path,
    однако если граф по каким-то причинам не включит state update,
    Run навсегда зависнет в "running".
    Re-raise — надёжная гарантия: outer except всегда вызывается.
    """

    @pytest.mark.asyncio
    async def test_agent_node_llm_exception_re_raises(self):
        """
        ALEX-TD-130: agent_node должен поднять исключение при LLM ошибке,
        а не тихо возвращать {"status": "error"}.
        Это гарантирует что execute_run outer except поймает ошибку.
        """
        from agentco.orchestration.agent_node import agent_node

        with patch(
            "agentco.orchestration.agent_node.litellm.acompletion",
            new_callable=AsyncMock,
        ) as mock_acomp:
            mock_acomp.side_effect = Exception("API error: rate limit exceeded")
            state = _make_base_state()
            with pytest.raises(Exception, match="API error: rate limit exceeded"):
                await agent_node(state)

    @pytest.mark.asyncio
    async def test_agent_node_llm_exception_logs_error(self):
        """
        ALEX-TD-130: agent_node должен залогировать ошибку перед re-raise.
        """
        from agentco.orchestration.agent_node import agent_node
        import logging

        with patch(
            "agentco.orchestration.agent_node.litellm.acompletion",
            new_callable=AsyncMock,
        ) as mock_acomp:
            mock_acomp.side_effect = RuntimeError("LLM timeout")
            state = _make_base_state()

            with patch("agentco.orchestration.agent_node.logger") as mock_logger:
                with pytest.raises(RuntimeError):
                    await agent_node(state)

            # Убеждаемся что ошибка была залогирована
            assert mock_logger.error.called

    @pytest.mark.asyncio
    async def test_agent_node_success_path_unaffected(self):
        """
        ALEX-TD-130: успешный путь (без ошибки) по-прежнему возвращает dict.
        """
        from agentco.orchestration.agent_node import agent_node

        def _make_text_chunk(content):
            chunk = MagicMock()
            chunk.choices = [MagicMock()]
            chunk.choices[0].delta.content = content
            chunk.choices[0].delta.tool_calls = None
            chunk.choices[0].finish_reason = None
            chunk.usage = None
            return chunk

        def _make_finish_chunk():
            chunk = MagicMock()
            chunk.choices = [MagicMock()]
            chunk.choices[0].delta.content = None
            chunk.choices[0].delta.tool_calls = None
            chunk.choices[0].finish_reason = "stop"
            chunk.usage = MagicMock()
            chunk.usage.total_tokens = 10
            chunk.usage.prompt_tokens = 5
            chunk.usage.completion_tokens = 5
            return chunk

        async def _aiter():
            yield _make_text_chunk("Hello")
            yield _make_finish_chunk()

        mock_stream = MagicMock()
        mock_stream.__aiter__ = lambda self: _aiter()

        with patch(
            "agentco.orchestration.agent_node.litellm.acompletion",
            new_callable=AsyncMock,
        ) as mock_acomp:
            mock_acomp.return_value = mock_stream
            state = _make_base_state()
            result = await agent_node(state)

        assert isinstance(result, dict)
        assert "messages" in result


# ─── ALEX-TD-129: MemoryService.get_all_async ─────────────────────────────────

class TestMemoryServiceTD129GetAllAsync:
    """
    ALEX-TD-129: MemoryService должен предоставлять async обёртку get_all_async
    через run_in_executor чтобы не блокировать event loop при 100+ RPS.
    """

    @pytest.fixture
    def memory_service(self, tmp_path):
        """Изолированный MemoryService с временным SQLite."""
        from agentco.memory.service import MemoryService
        db_path = str(tmp_path / "td129_memory.db")
        service = MemoryService(db_path)
        yield service
        service.close()

    @pytest.mark.asyncio
    async def test_get_all_async_exists(self, memory_service):
        """
        ALEX-TD-129: MemoryService должен иметь метод get_all_async.
        """
        assert hasattr(memory_service, "get_all_async"), (
            "MemoryService.get_all_async не найден. "
            "ALEX-TD-129 требует async-обёртку через run_in_executor."
        )

    @pytest.mark.asyncio
    async def test_get_all_async_is_coroutine(self, memory_service):
        """
        ALEX-TD-129: get_all_async должен возвращать корутину (awaitable).
        """
        result = memory_service.get_all_async(agent_id="nonexistent")
        assert asyncio.iscoroutine(result), (
            "get_all_async должен возвращать coroutine, "
            "иначе await не работает."
        )
        # Дочитываем корутину
        await result

    @pytest.mark.asyncio
    async def test_get_all_async_returns_list(self, memory_service):
        """
        ALEX-TD-129: get_all_async должен возвращать список воспоминаний.
        """
        result = await memory_service.get_all_async(agent_id="agent-001")
        assert isinstance(result, list)

    @pytest.mark.asyncio
    async def test_get_all_async_returns_same_as_sync(self, memory_service, monkeypatch):
        """
        ALEX-TD-129: get_all_async и get_all должны возвращать одинаковые данные.
        """
        # Сохраняем воспоминание напрямую через store (без embedding)
        embedding = [0.1] * 1536
        memory_service._store.insert(
            agent_id="agent-sync",
            task_id="task-1",
            content="Sync test memory",
            embedding=embedding,
        )

        sync_result = memory_service.get_all(agent_id="agent-sync")
        async_result = await memory_service.get_all_async(agent_id="agent-sync")

        assert len(sync_result) == len(async_result)
        assert sync_result[0]["content"] == async_result[0]["content"]

    @pytest.mark.asyncio
    async def test_get_all_async_supports_pagination(self, memory_service):
        """
        ALEX-TD-129: get_all_async поддерживает limit и offset параметры.
        """
        embedding = [0.2] * 1536
        for i in range(5):
            memory_service._store.insert(
                agent_id="agent-page",
                task_id=f"task-{i}",
                content=f"Memory {i}",
                embedding=embedding,
            )

        page1 = await memory_service.get_all_async(
            agent_id="agent-page", limit=3, offset=0
        )
        page2 = await memory_service.get_all_async(
            agent_id="agent-page", limit=3, offset=3
        )

        assert len(page1) == 3
        assert len(page2) == 2

    @pytest.mark.asyncio
    async def test_get_all_async_uses_executor(self, memory_service):
        """
        ALEX-TD-129: get_all_async должен использовать run_in_executor
        чтобы не блокировать event loop.
        Проверяем что SQLite вызов происходит в executor (не блокируя loop).
        """
        loop = asyncio.get_running_loop()

        with patch.object(loop, "run_in_executor", wraps=loop.run_in_executor) as mock_executor:
            await memory_service.get_all_async(agent_id="agent-executor")

        # run_in_executor должен быть вызван
        assert mock_executor.called, (
            "ALEX-TD-129: get_all_async должен использовать "
            "loop.run_in_executor() для неблокирующего SQLite IO."
        )

    def test_get_all_sync_has_tech_debt_docstring(self, memory_service):
        """
        ALEX-TD-129: get_all() должен содержать docstring с упоминанием
        tech debt о per-request connections.
        """
        docstring = memory_service.get_all.__doc__ or ""
        # Проверяем что docstring содержит информацию о tech debt
        has_tech_note = any(
            keyword in docstring.lower()
            for keyword in ["tech debt", "connection", "singleton", "executor", "td-129", "td129"]
        )
        assert has_tech_note, (
            "ALEX-TD-129: get_all() docstring должен документировать "
            "tech debt о per-request SQLite connections. "
            f"Текущий docstring: {docstring!r}"
        )
