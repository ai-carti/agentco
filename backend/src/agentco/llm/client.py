# backend/llm/client.py
"""
Unified async LLM interface via LiteLLM.

Provider selection is done via environment variables:
    OPENAI_API_KEY     — enables OpenAI models (gpt-4o, gpt-4o-mini, ...)
    ANTHROPIC_API_KEY  — enables Anthropic models (claude-3-5-sonnet-*, ...)
    GEMINI_API_KEY     — enables Google Gemini models (gemini/gemini-1.5-pro, ...)

No keys are hardcoded. LiteLLM reads them from environment automatically.
"""
import litellm
from typing import AsyncGenerator


async def acompletion(model: str, messages: list[dict], stream: bool = False, **kwargs):
    """Unified async LLM call via LiteLLM."""
    return await litellm.acompletion(model=model, messages=messages, stream=stream, **kwargs)


async def stream_completion(model: str, messages: list[dict]) -> AsyncGenerator[str, None]:
    """Streaming LLM call, yields text chunks."""
    response = await litellm.acompletion(model=model, messages=messages, stream=True)
    async for chunk in response:
        delta = chunk.choices[0].delta.content
        if delta:
            yield delta
