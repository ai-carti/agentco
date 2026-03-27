"""
Tests for ALEX-TD-279: module-level caching of env vars in orchestration/nodes.py

Verifies:
1. _USE_REAL_LLM is a module-level bool (not re-read every call)
2. _AGENTCO_ORCHESTRATION_MODEL and _LLM_CALL_TIMEOUT are also cached
3. Tests mock via patch('agentco.orchestration.nodes._USE_REAL_LLM', ...)
"""
from __future__ import annotations

import asyncio
import importlib
import os
from unittest.mock import patch, AsyncMock, MagicMock

import pytest


class TestModuleLevelCaching:
    """_USE_REAL_LLM must be a module-level bool, not re-read on every call."""

    def test_use_real_llm_is_bool(self):
        """_USE_REAL_LLM must be a bool at module level."""
        from agentco.orchestration import nodes
        assert isinstance(nodes._USE_REAL_LLM, bool)

    def test_use_real_llm_false_by_default(self):
        """_USE_REAL_LLM is False when AGENTCO_USE_REAL_LLM not set."""
        env = {k: v for k, v in os.environ.items() if k != "AGENTCO_USE_REAL_LLM"}
        with patch.dict(os.environ, env, clear=True):
            import agentco.orchestration.nodes as nodes_mod
            importlib.reload(nodes_mod)
            assert nodes_mod._USE_REAL_LLM is False

    def test_use_real_llm_true_from_env(self):
        """_USE_REAL_LLM is True when AGENTCO_USE_REAL_LLM=true."""
        with patch.dict(os.environ, {"AGENTCO_USE_REAL_LLM": "true"}):
            import agentco.orchestration.nodes as nodes_mod
            importlib.reload(nodes_mod)
            assert nodes_mod._USE_REAL_LLM is True

    def test_use_real_llm_true_from_1(self):
        """_USE_REAL_LLM is True when AGENTCO_USE_REAL_LLM=1."""
        with patch.dict(os.environ, {"AGENTCO_USE_REAL_LLM": "1"}):
            import agentco.orchestration.nodes as nodes_mod
            importlib.reload(nodes_mod)
            assert nodes_mod._USE_REAL_LLM is True

    def test_use_real_llm_true_from_yes(self):
        """_USE_REAL_LLM is True when AGENTCO_USE_REAL_LLM=yes."""
        with patch.dict(os.environ, {"AGENTCO_USE_REAL_LLM": "yes"}):
            import agentco.orchestration.nodes as nodes_mod
            importlib.reload(nodes_mod)
            assert nodes_mod._USE_REAL_LLM is True

    def test_use_real_llm_false_for_other(self):
        """_USE_REAL_LLM is False when AGENTCO_USE_REAL_LLM=false."""
        with patch.dict(os.environ, {"AGENTCO_USE_REAL_LLM": "false"}):
            import agentco.orchestration.nodes as nodes_mod
            importlib.reload(nodes_mod)
            assert nodes_mod._USE_REAL_LLM is False

    def test_orchestration_model_is_cached(self):
        """_AGENTCO_ORCHESTRATION_MODEL is a module-level str."""
        from agentco.orchestration import nodes
        assert isinstance(nodes._AGENTCO_ORCHESTRATION_MODEL, str)
        assert len(nodes._AGENTCO_ORCHESTRATION_MODEL) > 0

    def test_orchestration_model_default(self):
        """Default model is gpt-4o-mini when env not set."""
        env = {k: v for k, v in os.environ.items() if k != "AGENTCO_ORCHESTRATION_MODEL"}
        with patch.dict(os.environ, env, clear=True):
            import agentco.orchestration.nodes as nodes_mod
            importlib.reload(nodes_mod)
            assert nodes_mod._AGENTCO_ORCHESTRATION_MODEL == "gpt-4o-mini"

    def test_orchestration_model_from_env(self):
        """Model reads from AGENTCO_ORCHESTRATION_MODEL env var."""
        with patch.dict(os.environ, {"AGENTCO_ORCHESTRATION_MODEL": "claude-3-haiku"}):
            import agentco.orchestration.nodes as nodes_mod
            importlib.reload(nodes_mod)
            assert nodes_mod._AGENTCO_ORCHESTRATION_MODEL == "claude-3-haiku"

    def test_llm_call_timeout_is_cached(self):
        """_LLM_CALL_TIMEOUT is a module-level float."""
        from agentco.orchestration import nodes
        assert isinstance(nodes._LLM_CALL_TIMEOUT, float)
        assert nodes._LLM_CALL_TIMEOUT > 0

    def test_llm_call_timeout_default(self):
        """Default timeout is 120.0 when env not set."""
        env = {k: v for k, v in os.environ.items() if k != "LLM_CALL_TIMEOUT_SEC"}
        with patch.dict(os.environ, env, clear=True):
            import agentco.orchestration.nodes as nodes_mod
            importlib.reload(nodes_mod)
            assert nodes_mod._LLM_CALL_TIMEOUT == 120.0

    def test_llm_call_timeout_from_env(self):
        """Timeout reads from LLM_CALL_TIMEOUT_SEC env var."""
        with patch.dict(os.environ, {"LLM_CALL_TIMEOUT_SEC": "60"}):
            import agentco.orchestration.nodes as nodes_mod
            importlib.reload(nodes_mod)
            assert nodes_mod._LLM_CALL_TIMEOUT == 60.0


class TestMockLlmCallUsesCachedValues:
    """_mock_llm_call uses module-level cached values (patchable via patch())."""

    def test_mock_path_used_when_use_real_llm_false(self):
        """When _USE_REAL_LLM=False, _mock_llm_call uses mock_completion path."""
        import agentco.orchestration.nodes as nodes_mod
        importlib.reload(nodes_mod)

        mock_result = ("mocked response", 30, 0.0003)

        async def run():
            with patch.object(nodes_mod, "_USE_REAL_LLM", False), \
                 patch.object(nodes_mod, "_sync_mock_llm_call", return_value=mock_result):
                result = await nodes_mod._mock_llm_call("sys", "user", "mock resp")
            return result

        content, tokens, cost = asyncio.run(run())
        assert content == "mocked response"
        assert tokens == 30

    def test_real_llm_path_used_when_use_real_llm_true(self):
        """When _USE_REAL_LLM=True, _mock_llm_call calls litellm.acompletion."""
        import agentco.orchestration.nodes as nodes_mod
        importlib.reload(nodes_mod)

        # Mock litellm.acompletion response
        fake_response = MagicMock()
        fake_response.choices = [MagicMock()]
        fake_response.choices[0].message.content = "real llm response"
        fake_response.usage = MagicMock()
        fake_response.usage.total_tokens = 50

        async def run():
            with patch.object(nodes_mod, "_USE_REAL_LLM", True), \
                 patch.object(nodes_mod, "_AGENTCO_ORCHESTRATION_MODEL", "gpt-4o-mini"), \
                 patch.object(nodes_mod, "_LLM_CALL_TIMEOUT", 30.0), \
                 patch("litellm.acompletion", new_callable=AsyncMock, return_value=fake_response):
                result = await nodes_mod._mock_llm_call("sys", "user", "ignored")
            return result

        content, tokens, cost = asyncio.run(run())
        assert content == "real llm response"
        assert tokens == 50
