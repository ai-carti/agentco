"""
Tests for ALEX-TD-290 through ALEX-TD-293.

ALEX-TD-290: README.md must not be empty
ALEX-TD-291: _COST_PER_1K_TOKENS must handle newer model prefixes (claude-sonnet, gpt-4.1, o4)
ALEX-TD-292: PROVIDER_MODELS and PROVIDER_TEST_MODEL must include current models
ALEX-TD-293: _estimate_cost returns non-default rate for all known model families
"""
import os
import pathlib


# ── ALEX-TD-290: README.md is non-empty ─────────────────────────────────────

class TestReadme:
    """ALEX-TD-290: Backend README.md must contain meaningful documentation."""

    def test_readme_exists_and_non_empty(self):
        readme = pathlib.Path(__file__).parent.parent / "README.md"
        assert readme.exists(), "README.md must exist"
        content = readme.read_text().strip()
        assert len(content) > 100, f"README.md is too short ({len(content)} chars) — needs real documentation"

    def test_readme_has_key_sections(self):
        readme = pathlib.Path(__file__).parent.parent / "README.md"
        content = readme.read_text()
        # Must have at least these sections
        assert "## Quick Start" in content or "## Quickstart" in content, "README must have Quick Start section"
        assert "## API" in content or "## Endpoints" in content, "README must have API section"
        assert "## Environment" in content or "## Configuration" in content, "README must have env config section"


# ── ALEX-TD-291: Cost estimation for newer models ───────────────────────────

class TestCostEstimation:
    """ALEX-TD-291: _estimate_cost must return correct (non-default) rates for all model families."""

    def test_claude_sonnet_4_5_uses_claude_rate(self):
        from agentco.orchestration.agent_node import _estimate_cost, _COST_PER_1K_TOKENS
        default_rate = _COST_PER_1K_TOKENS["default"]
        cost = _estimate_cost("claude-sonnet-4-5", 1000)
        # Must NOT fall to default — Claude models have a specific rate
        assert cost != (1000 / 1000.0) * default_rate, \
            "claude-sonnet-4-5 should match a Claude-specific rate, not the default"

    def test_claude_sonnet_4_uses_claude_rate(self):
        from agentco.orchestration.agent_node import _estimate_cost, _COST_PER_1K_TOKENS
        default_rate = _COST_PER_1K_TOKENS["default"]
        cost = _estimate_cost("claude-sonnet-4-20250514", 1000)
        assert cost != (1000 / 1000.0) * default_rate

    def test_claude_opus_4_uses_claude_rate(self):
        from agentco.orchestration.agent_node import _estimate_cost, _COST_PER_1K_TOKENS
        default_rate = _COST_PER_1K_TOKENS["default"]
        cost = _estimate_cost("claude-opus-4-20250514", 1000)
        assert cost != (1000 / 1000.0) * default_rate

    def test_gpt_4o_mini_uses_specific_rate(self):
        from agentco.orchestration.agent_node import _estimate_cost, _COST_PER_1K_TOKENS
        cost = _estimate_cost("gpt-4o-mini", 1000)
        expected = (1000 / 1000.0) * _COST_PER_1K_TOKENS["gpt-4o-mini"]
        assert cost == expected

    def test_model_none_uses_default(self):
        """ALEX-TD-210: model=None must not crash."""
        from agentco.orchestration.agent_node import _estimate_cost
        cost = _estimate_cost(None, 1000)
        assert cost > 0

    def test_unknown_model_uses_default(self):
        from agentco.orchestration.agent_node import _estimate_cost, _COST_PER_1K_TOKENS
        cost = _estimate_cost("some-unknown-model-xyz", 1000)
        expected = (1000 / 1000.0) * _COST_PER_1K_TOKENS["default"]
        assert cost == expected

    def test_gemini_model_uses_gemini_rate(self):
        from agentco.orchestration.agent_node import _estimate_cost, _COST_PER_1K_TOKENS
        cost = _estimate_cost("gemini/gemini-2.0-flash", 1000)
        expected = (1000 / 1000.0) * _COST_PER_1K_TOKENS["gemini"]
        assert cost == expected


# ── ALEX-TD-292: Provider model registry is current ─────────────────────────

class TestProviderModels:
    """ALEX-TD-292: PROVIDER_MODELS must include currently available models."""

    def test_anthropic_has_claude_sonnet_4_5(self):
        from agentco.handlers.credentials import PROVIDER_MODELS
        anthropic_models = PROVIDER_MODELS["anthropic"]
        assert "claude-sonnet-4-5" in anthropic_models, \
            "PROVIDER_MODELS['anthropic'] must include claude-sonnet-4-5"

    def test_anthropic_has_claude_sonnet_4(self):
        from agentco.handlers.credentials import PROVIDER_MODELS
        anthropic_models = PROVIDER_MODELS["anthropic"]
        has_sonnet_4 = any("claude-sonnet-4-" in m and "4-5" not in m for m in anthropic_models) or \
                       "claude-sonnet-4-20250514" in anthropic_models
        assert has_sonnet_4, "PROVIDER_MODELS['anthropic'] must include claude-sonnet-4"

    def test_anthropic_has_claude_opus_4(self):
        from agentco.handlers.credentials import PROVIDER_MODELS
        anthropic_models = PROVIDER_MODELS["anthropic"]
        has_opus_4 = any("claude-opus-4" in m for m in anthropic_models)
        assert has_opus_4, "PROVIDER_MODELS['anthropic'] must include claude-opus-4"

    def test_all_models_includes_new_entries(self):
        from agentco.handlers.credentials import ALL_MODELS
        assert "claude-sonnet-4-5" in ALL_MODELS

    def test_provider_test_model_anthropic_exists_in_models(self):
        """Test model used for validation must exist in the provider's model list."""
        from agentco.handlers.credentials import PROVIDER_MODELS, PROVIDER_TEST_MODEL
        for provider, test_model in PROVIDER_TEST_MODEL.items():
            assert test_model in PROVIDER_MODELS[provider], \
                f"PROVIDER_TEST_MODEL['{provider}'] = '{test_model}' not found in PROVIDER_MODELS['{provider}']"


# ── ALEX-TD-293: Cost dict prefix ordering ──────────────────────────────────

class TestCostDictOrdering:
    """ALEX-TD-293: _COST_PER_1K_TOKENS prefix matching must be deterministic —
    more-specific prefixes must come before less-specific ones."""

    def test_gpt_4o_mini_before_gpt_4o(self):
        """gpt-4o-mini must match before gpt-4o (longer prefix first)."""
        from agentco.orchestration.agent_node import _COST_PER_1K_TOKENS
        keys = list(_COST_PER_1K_TOKENS.keys())
        assert keys.index("gpt-4o-mini") < keys.index("gpt-4o"), \
            "gpt-4o-mini must appear before gpt-4o to match correctly"

    def test_gpt_4o_before_gpt_4(self):
        """gpt-4o must match before gpt-4."""
        from agentco.orchestration.agent_node import _COST_PER_1K_TOKENS
        keys = list(_COST_PER_1K_TOKENS.keys())
        assert keys.index("gpt-4o") < keys.index("gpt-4"), \
            "gpt-4o must appear before gpt-4"

    def test_gpt_4_turbo_before_gpt_4(self):
        """gpt-4-turbo must match before gpt-4."""
        from agentco.orchestration.agent_node import _COST_PER_1K_TOKENS
        keys = list(_COST_PER_1K_TOKENS.keys())
        assert keys.index("gpt-4-turbo") < keys.index("gpt-4"), \
            "gpt-4-turbo must appear before gpt-4"
