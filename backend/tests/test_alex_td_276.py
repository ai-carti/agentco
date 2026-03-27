"""
TDD тесты для ALEX-TD-276.

ALEX-TD-276: _get_max_iterations(), _get_max_cost(), _get_max_tokens(), _get_max_pending_tasks()
должны читать os.environ только один раз (via @functools.lru_cache).
"""
import functools
import pytest


class TestAlexTD276LruCacheMaxFunctions:
    """ALEX-TD-276: _get_max_* функции должны быть кешированы через lru_cache."""

    def test_get_max_iterations_has_cache_info(self):
        """_get_max_iterations должна быть lru_cache-decorated — иметь .cache_info()."""
        from agentco.orchestration.nodes import _get_max_iterations
        assert hasattr(_get_max_iterations, "cache_info"), (
            "_get_max_iterations has no cache_info — not decorated with @lru_cache"
        )

    def test_get_max_cost_has_cache_info(self):
        from agentco.orchestration.nodes import _get_max_cost_usd
        assert hasattr(_get_max_cost_usd, "cache_info"), (
            "_get_max_cost_usd has no cache_info — not decorated with @lru_cache"
        )

    def test_get_max_tokens_has_cache_info(self):
        from agentco.orchestration.nodes import _get_max_tokens
        assert hasattr(_get_max_tokens, "cache_info"), (
            "_get_max_tokens has no cache_info — not decorated with @lru_cache"
        )

    def test_get_max_pending_tasks_has_cache_info(self):
        from agentco.orchestration.nodes import _get_max_pending_tasks
        assert hasattr(_get_max_pending_tasks, "cache_info"), (
            "_get_max_pending_tasks has no cache_info — not decorated with @lru_cache"
        )

    def test_get_max_iterations_returns_int(self):
        from agentco.orchestration.nodes import _get_max_iterations
        result = _get_max_iterations()
        assert isinstance(result, int), f"Expected int, got {type(result)}"
        assert result > 0

    def test_get_max_cost_returns_float(self):
        from agentco.orchestration.nodes import _get_max_cost_usd
        result = _get_max_cost_usd()
        assert isinstance(result, float), f"Expected float, got {type(result)}"
        assert result > 0

    def test_get_max_tokens_returns_int(self):
        from agentco.orchestration.nodes import _get_max_tokens
        result = _get_max_tokens()
        assert isinstance(result, int), f"Expected int, got {type(result)}"
        assert result > 0

    def test_get_max_pending_tasks_returns_int(self):
        from agentco.orchestration.nodes import _get_max_pending_tasks
        result = _get_max_pending_tasks()
        assert isinstance(result, int), f"Expected int, got {type(result)}"
        assert result > 0

    def test_lru_cache_called_only_once(self, monkeypatch):
        """После первого вызова, повторный вызов должен использовать кеш (hits > 0)."""
        from agentco.orchestration import nodes
        nodes._get_max_iterations.cache_clear()
        # First call — populates cache
        nodes._get_max_iterations()
        info = nodes._get_max_iterations.cache_info()
        assert info.currsize == 1, f"Cache should have 1 entry, got {info.currsize}"
        # Second call — cache hit
        nodes._get_max_iterations()
        info2 = nodes._get_max_iterations.cache_info()
        assert info2.hits >= 1, f"Expected at least 1 cache hit, got {info2.hits}"
