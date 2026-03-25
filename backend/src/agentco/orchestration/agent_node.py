"""
orchestration/agent_node.py — Agent Node: LLM вызов через LiteLLM с стримингом и tool calls.

M2-003: Agent Node функция для LangGraph.

Принцип работы:
1. Инжектирует память из MemoryService (top-5 воспоминаний) в system_prompt
2. Строит messages из state (system_prompt + history)
3. Вызывает LiteLLM с stream=True
4. Собирает стримингровый ответ; каждый чанк → публикует в EventBus
5. Парсит tool_calls если они есть
6. Диспетчеризует tool_handlers (включая delegate_task)
7. Сохраняет результат в MemoryService
8. Обновляет total_tokens, total_cost_usd в AgentState
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
from contextvars import ContextVar
from typing import TYPE_CHECKING, Any, Callable, Coroutine, Optional

import litellm

from agentco.orchestration.state import AgentState
# ALEX-TD-120: top-level import — avoid per-chunk lazy import in hot streaming path
from agentco.core.event_bus import EventBus
from agentco.orchestration.nodes import _get_max_tokens

if TYPE_CHECKING:
    from agentco.memory.service import MemoryService

# ALEX-TD-147: ContextVar для передачи MemoryService в agent_node без попадания в
# LangGraph state (LangGraph сериализует state через msgpack при каждом checkpoint;
# MemoryService содержит sqlite3 connection → не сериализуем → TypeError).
# execute_run устанавливает этот ContextVar перед ainvoke и сбрасывает в finally.
# Все async tasks (включая LangGraph nodes) наследуют контекст вызывающего кода.
_memory_service_var: ContextVar[Optional["MemoryService"]] = ContextVar(
    "_memory_service_var", default=None
)

logger = logging.getLogger(__name__)

# ALEX-TD-158: per-LLM-call timeout. Prevents a single hung acompletion() from
# consuming the entire run budget (600s). Each call gets its own deadline;
# TimeoutError propagates to _execute_agent for retry.
_LLM_CALL_TIMEOUT_SEC: float = float(os.getenv("LLM_CALL_TIMEOUT_SEC", "120"))


# ─── Cost rates (USD per 1K tokens by model prefix) ─────────────────────────

_COST_PER_1K_TOKENS: dict[str, float] = {
    # OpenAI
    "gpt-4o-mini": 0.00015,    # $0.15/1M input tokens
    "gpt-4o": 0.005,
    "gpt-4-turbo": 0.01,
    "gpt-4": 0.03,
    "gpt-3.5": 0.002,
    "o3": 0.01,                # o3-mini range
    "o1": 0.015,
    # Anthropic
    "claude-4": 0.015,
    "claude-3-7": 0.003,
    "claude-3-5": 0.003,
    "claude-3": 0.003,
    # Google
    "gemini": 0.00125,         # Gemini 1.5 Pro
    "default": 0.002,
}


def _estimate_cost(model: str, total_tokens: int) -> float:
    """Оценить стоимость по модели и количеству токенов.

    ALEX-TD-210: guard against model=None (state.get("model", "gpt-4o") returns None
    when the key is explicitly set to None in AgentState — dict.get only uses default
    for *missing* keys). Without this guard, None.startswith() → AttributeError.
    """
    if not model:
        return (total_tokens / 1000.0) * _COST_PER_1K_TOKENS["default"]
    for prefix, rate in _COST_PER_1K_TOKENS.items():
        if model.startswith(prefix):
            return (total_tokens / 1000.0) * rate
    return (total_tokens / 1000.0) * _COST_PER_1K_TOKENS["default"]


# ─── Типы ────────────────────────────────────────────────────────────────────

ToolHandler = Callable[[dict, dict], Coroutine[Any, Any, str]]


# ─── delegate_task tool definition ──────────────────────────────────────────

def get_delegate_task_tool() -> dict:
    """
    Возвращает tool definition для delegate_task.

    Используется агентами для делегирования подзадач подчинённым.
    """
    return {
        "type": "function",
        "function": {
            "name": "delegate_task",
            "description": (
                "Delegate a sub-task to a subordinate agent. "
                "Use this to decompose complex tasks into smaller pieces."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "agent_id": {
                        "type": "string",
                        "description": "ID of the agent to delegate to (e.g. 'cto', 'pm', 'swe-01')",
                    },
                    "task_description": {
                        "type": "string",
                        "description": "Detailed description of the task to delegate",
                    },
                },
                "required": ["agent_id", "task_description"],
            },
        },
    }


# ─── Helpers ─────────────────────────────────────────────────────────────────

async def _build_messages_with_memory(state: AgentState) -> list[dict]:
    """
    Строит список messages для LLM из state.

    1. Если есть memory_service — инжектирует top-5 воспоминаний в system_prompt
    2. Если system_prompt задан — добавляет как первый system message
    3. Добавляет историю messages из state

    ALEX-TD-147: memory_service читается из ContextVar (_memory_service_var),
    не из state. State не должен содержать non-serializable объекты (LangGraph
    сериализует state через msgpack при checkpoint → MemoryService не сериализуем).
    """
    system_prompt = state.get("system_prompt", "")
    # ALEX-TD-147: get MemoryService from ContextVar, not from state
    memory_service = _memory_service_var.get()
    agent_id = state.get("agent_id", "unknown")
    task = state.get("input", "")

    # Инжект памяти
    # ALEX-TD-205: skip inject if token limit already reached — avoids one extra
    # (costly) LLM call that the graph would reject on the next iteration anyway.
    _token_limit_reached = state.get("total_tokens", 0) >= _get_max_tokens()
    if memory_service and system_prompt and not _token_limit_reached:
        try:
            system_prompt = await memory_service.inject_memories(
                agent_id=agent_id,
                base_prompt=system_prompt,
                task_description=task,
                top_k=5,
            )
        except Exception as e:
            logger.warning("Memory inject failed for agent %s: %s", agent_id, e)

    messages: list[dict] = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    messages.extend(state.get("messages", []))
    return messages


def _extract_tokens(chunk) -> int:
    """Извлекает total_tokens из chunk.usage (если есть).

    ALEX-TD-094: Some providers (Gemini, Anthropic) omit usage from intermediate
    streaming chunks — only the final chunk contains usage data. When usage is
    absent, returns 0. The caller accumulates the last non-zero value.
    If a run shows total_tokens=0, enable DEBUG logging to see whether the
    provider is omitting usage from all chunks (provider issue vs. parsing bug).
    """
    try:
        if chunk.usage and chunk.usage.total_tokens:
            return chunk.usage.total_tokens
        # NOTE: Some streaming providers don't include usage in every chunk.
        # This is expected; cost estimate will use 0 tokens for those chunks.
        logger.debug("_extract_tokens: chunk.usage missing or zero (provider may omit mid-stream)")
    except (AttributeError, TypeError):
        pass
    return 0


async def _publish_chunk(state: AgentState, content: str) -> None:
    """Публикует стриминговый чанк в EventBus.

    ALEX-TD-068: включает поле `cost` (стоимость чанка в USD) для поддержки
    SIRI-POST-004 — frontend warRoomStore читает data.cost из llm_token событий.
    Стоимость оценивается per-character (приблизительно ~1 токен = 4 символа).
    """
    company_id = state.get("company_id")
    if not company_id:
        return
    try:
        bus = EventBus.get()
        # ALEX-TD-068: оцениваем стоимость чанка по длине (1 char ≈ 0.25 токена)
        # ALEX-TD-210: use `or "gpt-4o"` to handle explicit model=None in state
        model = state.get("model") or "gpt-4o"
        chunk_tokens = max(1, len(content) // 4)
        chunk_cost = _estimate_cost(model, chunk_tokens)
        await bus.publish({
            "company_id": company_id,
            "type": "llm_token",
            "agent_id": state.get("agent_id", "unknown"),
            "run_id": state.get("run_id", ""),
            "data": content,
            "cost": chunk_cost,
        })
    except Exception as e:
        logger.debug("EventBus publish failed: %s", e)


async def _publish_completion(state: AgentState, full_text: str, cost_usd: float) -> None:
    """Публикует событие завершения в EventBus."""
    company_id = state.get("company_id")
    if not company_id:
        return
    try:
        bus = EventBus.get()
        await bus.publish({
            "company_id": company_id,
            "type": "completion",
            "agent_id": state.get("agent_id", "unknown"),
            "run_id": state.get("run_id", ""),
            "data": full_text,
            "cost_usd": cost_usd,
        })
    except Exception as e:
        logger.debug("EventBus publish completion failed: %s", e)


async def _save_result_to_memory(state: AgentState, result_text: str) -> None:
    """Сохраняет результат выполнения в MemoryService.

    ALEX-TD-147: читает MemoryService из ContextVar (_memory_service_var).
    """
    # ALEX-TD-147: read from ContextVar, not from state
    memory_service = _memory_service_var.get()
    if not memory_service:
        return
    try:
        agent_id = state.get("agent_id", "unknown")
        run_id = state.get("run_id")
        await memory_service.save_memory(
            agent_id=agent_id,
            task_id=run_id,
            content=result_text,
        )
    except Exception as e:
        logger.warning("Memory save failed: %s", e)


# ─── Основная функция ────────────────────────────────────────────────────────

async def agent_node(state: AgentState) -> dict:
    """
    Agent Node для LangGraph.

    Принимает AgentState, вызывает LLM через LiteLLM с stream=True,
    обрабатывает tool_calls, публикует в EventBus, управляет памятью.

    Параметры state:
    - model: str — модель для LiteLLM (default "gpt-4o")
    - system_prompt: str — системный промпт (если пустой — не добавляется)
    - messages: list — история сообщений
    - tools: list — список tool definitions для LLM
    - tool_handlers: dict[str, ToolHandler] — обработчики tool calls
    - memory_service: MemoryService | None — сервис памяти (inject + save)
    - agent_id: str — ID агента (для EventBus и памяти)
    - company_id: str — ID компании (для EventBus фильтрации)
    """
    # ALEX-TD-210: use `or "gpt-4o"` to handle explicit model=None in state
    # (dict.get only uses default for *missing* keys, not for None values)
    model = state.get("model") or "gpt-4o"
    messages = await _build_messages_with_memory(state)
    tools = state.get("tools") or []
    tool_handlers: dict[str, ToolHandler] = state.get("tool_handlers") or {}

    try:
        # ── LiteLLM streaming вызов ────────────────────────────────────────
        call_kwargs: dict[str, Any] = {
            "model": model,
            "messages": messages,
            "stream": True,
        }
        if tools:
            call_kwargs["tools"] = tools

        # ALEX-TD-158: wrap each LLM call in a per-call timeout so a hung
        # provider doesn't consume the entire run budget silently.
        # asyncio.TimeoutError propagates to _execute_agent for retry.
        #
        # ALEX-TD-217 fix: use asyncio.timeout() context manager to cover BOTH
        # the acompletion() initialisation AND the entire streaming loop.
        # The previous asyncio.wait_for(acompletion(...)) only timed out the
        # connection setup — a stream that started but stalled mid-way would
        # bypass _LLM_CALL_TIMEOUT_SEC and run until MAX_RUN_TIMEOUT_SEC (600s).
        # asyncio.timeout() raises asyncio.TimeoutError on expiry regardless of
        # where execution is inside the `async with` block.
        async with asyncio.timeout(_LLM_CALL_TIMEOUT_SEC):
            response = await litellm.acompletion(**call_kwargs)

            # ── Collect streaming response ─────────────────────────────────
            full_text = ""
            total_tokens = 0

            # tool_calls accumulator: index → {id, name, args_buffer}
            tool_calls_acc: dict[int, dict] = {}
            finish_reason: str | None = None

            async for chunk in response:
                try:
                    choice = chunk.choices[0]
                    delta = choice.delta

                    # Текстовый контент
                    content = delta.content
                    if content:
                        full_text += content
                        # Стриминг в EventBus
                        await _publish_chunk(state, content)

                    # Tool calls
                    tc_list = delta.tool_calls
                    if tc_list:
                        for tc in tc_list:
                            idx = tc.index
                            if idx not in tool_calls_acc:
                                tool_calls_acc[idx] = {
                                    "id": None,
                                    "name": None,
                                    "args": "",
                                }
                            if tc.id:
                                tool_calls_acc[idx]["id"] = tc.id
                            if tc.function and tc.function.name:
                                tool_calls_acc[idx]["name"] = tc.function.name
                            if tc.function and tc.function.arguments:
                                tool_calls_acc[idx]["args"] += tc.function.arguments

                    if choice.finish_reason:
                        finish_reason = choice.finish_reason

                    # Usage (обычно в финальном chunk)
                    tokens = _extract_tokens(chunk)
                    if tokens:
                        total_tokens = tokens

                except (AttributeError, IndexError) as e:
                    logger.debug("Chunk parsing error (skipped): %s", e)
                    continue

        # ── Cost tracking ──────────────────────────────────────────────────
        cost_usd = _estimate_cost(model, total_tokens)

        # ALEX-TD-139: warn when finish_reason=length with pending tool_calls.
        # Truncated responses mean tool args JSON is incomplete — json.loads will
        # silently return {} for partial JSON, causing handlers to run with empty
        # args and producing wrong behavior with no diagnostic.
        if finish_reason == "length" and tool_calls_acc:
            logger.warning(
                "agent_node: finish_reason=length with tool_calls — args may be truncated. "
                "run_id=%s agent_id=%s tool_count=%d",
                state.get("run_id"), state.get("agent_id"), len(tool_calls_acc),
            )

        # ── Публикуем completion event ─────────────────────────────────────
        await _publish_completion(state, full_text, cost_usd)

        # ── Формируем новые messages ───────────────────────────────────────
        new_messages: list[dict] = []

        if tool_calls_acc:
            # Режим tool_calls: assistant message + tool result messages
            assistant_tool_calls = []
            for idx in sorted(tool_calls_acc.keys()):
                tc_data = tool_calls_acc[idx]
                assistant_tool_calls.append({
                    "id": tc_data["id"] or f"call-{idx}",
                    "type": "function",
                    "function": {
                        "name": tc_data["name"] or "unknown",
                        "arguments": tc_data["args"],
                    },
                })

            assistant_msg: dict = {
                "role": "assistant",
                # ALEX-TD-141: use "" instead of None — Anthropic API rejects content=null
                # when tool_calls are present ("content" must be string or absent).
                # `full_text or None` → None when full_text="" → 400 Bad Request on Claude-3.x.
                "content": full_text or "",
                "tool_calls": assistant_tool_calls,
            }
            new_messages.append(assistant_msg)

            # Диспетчеризация tool handlers
            for tc in assistant_tool_calls:
                tool_name = tc["function"]["name"]
                tool_call_id = tc["id"]
                try:
                    args_str = tc["function"]["arguments"]
                    args = json.loads(args_str) if args_str else {}
                except json.JSONDecodeError:
                    # ALEX-TD-139: log truncated/malformed JSON so it's diagnosable
                    logger.warning(
                        "agent_node: JSONDecodeError parsing tool args for '%s'. "
                        "Possible truncation (finish_reason=%s). args_str=%r run_id=%s",
                        tool_name, finish_reason, args_str[:200] if args_str else "", state.get("run_id"),
                    )
                    args = {}

                handler = tool_handlers.get(tool_name)
                if handler:
                    try:
                        tool_result = await handler(args, state)
                    except Exception as e:
                        logger.error("Tool handler '%s' failed: %s", tool_name, e, exc_info=True)
                        tool_result = f"error: {e}"
                else:
                    tool_result = f"error: unknown tool '{tool_name}'"

                tool_msg = {
                    "role": "tool",
                    "tool_call_id": tool_call_id,
                    "name": tool_name,
                    "content": str(tool_result),
                }
                new_messages.append(tool_msg)

        else:
            # ALEX-TD-106: skip empty assistant messages — Anthropic requires non-empty content,
            # and empty messages pollute the conversation history without value.
            if full_text:
                new_messages.append({
                    "role": "assistant",
                    "content": full_text,
                })

        # ── Сохраняем результат в память ──────────────────────────────────
        if full_text:
            await _save_result_to_memory(state, full_text)

        return {
            "messages": new_messages,
            "total_tokens": state.get("total_tokens", 0) + total_tokens,
            "total_cost_usd": state.get("total_cost_usd", 0.0) + cost_usd,
        }

    except Exception as e:
        # ALEX-TD-130: re-raise вместо возврата {"status": "error"}.
        # Если вернуть dict с status=error без исключения, LangGraph завершает граф
        # корректно и execute_run обработает final_status через success path.
        # Однако если LangGraph не propagate state update (checkpointer flush fail,
        # CancelledError и т.п.) — Run навсегда зависнет в "running".
        # Re-raise гарантирует: outer except в execute_run всегда поймает ошибку
        # и обновит run.status → "failed" в БД.
        # ALEX-TD-191: exc_info=True ensures full traceback appears in logs,
        # not just the exception message — critical for diagnosing LLM failures.
        logger.error("agent_node LLM call failed: %s", e, exc_info=True)
        raise
