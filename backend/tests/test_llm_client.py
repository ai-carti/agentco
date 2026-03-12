"""
M0-004: Tests for LiteLLM unified client.

Run: uv run pytest tests/test_llm_client.py -v
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch


@pytest.mark.asyncio
async def test_acompletion_calls_litellm():
    """acompletion delegates to litellm.acompletion with correct args."""
    from agentco.llm.client import acompletion

    mock_response = MagicMock()
    with patch("agentco.llm.client.litellm.acompletion", new_callable=AsyncMock) as mock_llm:
        mock_llm.return_value = mock_response
        model = "gpt-4o"
        messages = [{"role": "user", "content": "hello"}]

        result = await acompletion(model=model, messages=messages)

        mock_llm.assert_called_once_with(model=model, messages=messages, stream=False)
        assert result == mock_response


@pytest.mark.asyncio
async def test_acompletion_passes_kwargs():
    """acompletion passes extra kwargs to litellm."""
    from agentco.llm.client import acompletion

    with patch("agentco.llm.client.litellm.acompletion", new_callable=AsyncMock) as mock_llm:
        mock_llm.return_value = MagicMock()
        await acompletion(model="gpt-4o", messages=[], temperature=0.5, max_tokens=100)

        mock_llm.assert_called_once_with(
            model="gpt-4o", messages=[], stream=False, temperature=0.5, max_tokens=100
        )


@pytest.mark.asyncio
async def test_stream_completion_yields_chunks():
    """stream_completion yields text chunks from streaming response."""
    from agentco.llm.client import stream_completion

    # Build mock streaming chunks
    def make_chunk(content):
        chunk = MagicMock()
        chunk.choices[0].delta.content = content
        return chunk

    async def mock_async_iter():
        for c in ["Hello", " world", "!"]:
            yield make_chunk(c)

    mock_response = mock_async_iter()

    with patch("agentco.llm.client.litellm.acompletion", new_callable=AsyncMock) as mock_llm:
        mock_llm.return_value = mock_response
        model = "claude-3-5-sonnet-20241022"
        messages = [{"role": "user", "content": "say hello"}]

        chunks = []
        async for chunk in stream_completion(model=model, messages=messages):
            chunks.append(chunk)

        mock_llm.assert_called_once_with(model=model, messages=messages, stream=True)
        assert chunks == ["Hello", " world", "!"]


@pytest.mark.asyncio
async def test_stream_completion_skips_none_deltas():
    """stream_completion skips chunks where delta.content is None."""
    from agentco.llm.client import stream_completion

    def make_chunk(content):
        chunk = MagicMock()
        chunk.choices[0].delta.content = content
        return chunk

    async def mock_async_iter():
        yield make_chunk(None)   # should be skipped
        yield make_chunk("data")
        yield make_chunk(None)   # should be skipped

    with patch("agentco.llm.client.litellm.acompletion", new_callable=AsyncMock) as mock_llm:
        mock_llm.return_value = mock_async_iter()

        chunks = []
        async for chunk in stream_completion(model="gpt-4o", messages=[]):
            chunks.append(chunk)

        assert chunks == ["data"]
