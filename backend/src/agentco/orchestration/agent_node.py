"""
orchestration/agent_node.py — Agent Node: LLM вызов через LiteLLM с стримингом и tool calls.

M2-003: Agent Node функция для LangGraph.

Принцип работы:
1. Строит messages из state (system_prompt + history)
2. Вызывает LiteLLM с stream=True
3. Собирает стримингровый ответ в полный текст
4. Парсит tool_calls если они есть
5. Диспетчеризует tool_handlers
6. Возвращает обновлённый AgentState dict
"""
from __future__ import annotations

import json
import logging
from typing import Any, Callable, Coroutine

import litellm

from agentco.orchestration.state import AgentState

logger = logging.getLogger(__name__)


# ─── Типы ────────────────────────────────────────────────────────────────────

ToolHandler = Callable[[dict, dict], Coroutine[Any, Any, str]]


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _build_messages(state: AgentState) -> list[dict]:
    """
    Строит список messages для LLM из state.
    Если system_prompt задан — инжектирует как первый system message.
    """
    messages: list[dict] = []
    system_prompt = state.get("system_prompt", "")
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    messages.extend(state.get("messages", []))
    return messages


def _extract_tokens(chunk) -> int:
    """Извлекает total_tokens из chunk.usage (если есть)."""
    try:
        if chunk.usage and chunk.usage.total_tokens:
            return chunk.usage.total_tokens
    except (AttributeError, TypeError):
        pass
    return 0


# ─── Основная функция ────────────────────────────────────────────────────────

async def agent_node(state: AgentState) -> dict:
    """
    Agent Node для LangGraph.

    Принимает AgentState, вызывает LLM через LiteLLM с stream=True,
    обрабатывает tool_calls, возвращает partial AgentState.

    Параметры state:
    - model: str — модель для LiteLLM (default "gpt-4o")
    - system_prompt: str — системный промпт (если пустой — не добавляется)
    - messages: list — история сообщений
    - tools: list — список tool definitions для LLM
    - tool_handlers: dict[str, ToolHandler] — обработчики tool calls
    """
    model = state.get("model", "gpt-4o")
    messages = _build_messages(state)
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

        response = await litellm.acompletion(**call_kwargs)

        # ── Collect streaming response ─────────────────────────────────────
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
                "content": full_text or None,
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
                    args = {}

                handler = tool_handlers.get(tool_name)
                if handler:
                    try:
                        tool_result = await handler(args, state)
                    except Exception as e:
                        logger.error("Tool handler '%s' failed: %s", tool_name, e)
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
            # Обычный текстовый ответ
            new_messages.append({
                "role": "assistant",
                "content": full_text,
            })

        return {
            "messages": new_messages,
            "total_tokens": state.get("total_tokens", 0) + total_tokens,
            "total_cost_usd": state.get("total_cost_usd", 0.0),
        }

    except Exception as e:
        logger.error("agent_node LLM call failed: %s", e)
        return {
            "status": "error",
            "error": str(e),
        }
