"""Tests for ALEX-TD-297, ALEX-TD-298, ALEX-TD-299."""
import struct
import pytest


# ── ALEX-TD-297: SqliteVecStore agent_id index ──────────────────────────────

class TestAgentMemoryMetaIndex:
    """ALEX-TD-297: agent_memory_meta must have an index on agent_id."""

    def test_sqlite_vec_store_has_agent_id_index(self):
        """After _setup(), an index on agent_id should exist."""
        from agentco.memory.vector_store import SqliteVecStore

        store = SqliteVecStore(db_path=":memory:")
        try:
            # Query sqlite_master for indexes on agent_memory_meta
            rows = store._conn.execute(
                "SELECT name, sql FROM sqlite_master "
                "WHERE type='index' AND tbl_name='agent_memory_meta' AND sql IS NOT NULL"
            ).fetchall()
            index_sqls = [row[1].lower() for row in rows if row[1]]
            # At least one index should reference agent_id
            has_agent_id_idx = any("agent_id" in sql for sql in index_sqls)
            assert has_agent_id_idx, (
                f"No index on agent_id found in agent_memory_meta. "
                f"Existing indexes: {index_sqls}"
            )
        finally:
            store.close()


# ── ALEX-TD-298: Memory handler singleton store ─────────────────────────────

class TestMemoryHandlerSingleton:
    """ALEX-TD-298: handlers/memory.py should reuse a module-level store."""

    def test_get_memory_store_returns_same_instance(self):
        """_get_memory_store() should return the same SqliteVecStore on repeated calls."""
        from agentco.handlers.memory import _get_memory_store, _reset_memory_store

        _reset_memory_store()  # clear any cached instance
        try:
            store1 = _get_memory_store(":memory:")
            store2 = _get_memory_store(":memory:")
            assert store1 is store2, "Expected singleton store instance"
        finally:
            _reset_memory_store()

    def test_reset_memory_store_clears_singleton(self):
        """_reset_memory_store() should clear the cached instance."""
        from agentco.handlers.memory import _get_memory_store, _reset_memory_store

        _reset_memory_store()
        try:
            store1 = _get_memory_store(":memory:")
            _reset_memory_store()
            store2 = _get_memory_store(":memory:")
            assert store1 is not store2, "After reset, a new instance should be created"
        finally:
            _reset_memory_store()


# ── ALEX-TD-299: Cost estimation with input/output split ─────────────────────

class TestCostEstimationSplit:
    """ALEX-TD-299: _estimate_cost should differentiate input/output tokens."""

    def test_estimate_cost_with_prompt_and_completion_tokens(self):
        """When prompt_tokens and completion_tokens are provided, cost should use split rates."""
        from agentco.orchestration.agent_node import _estimate_cost

        # gpt-4o: input ~$5/1M, output ~$15/1M
        cost = _estimate_cost("gpt-4o", 1000, prompt_tokens=800, completion_tokens=200)
        # Should be different from flat rate (which would be 1000 * 0.005 = $5.00/1K)
        assert cost > 0
        assert isinstance(cost, float)

    def test_estimate_cost_fallback_without_split(self):
        """Without prompt/completion split, should fall back to flat rate."""
        from agentco.orchestration.agent_node import _estimate_cost

        cost_flat = _estimate_cost("gpt-4o", 1000)
        # Should still work with the old signature
        assert cost_flat == pytest.approx(0.005, abs=0.001)

    def test_estimate_cost_zero_tokens(self):
        """Zero tokens should return zero cost."""
        from agentco.orchestration.agent_node import _estimate_cost

        assert _estimate_cost("gpt-4o", 0) == 0.0

    def test_extract_tokens_returns_prompt_completion(self):
        """_extract_tokens should return (total, prompt, completion) tuple."""
        from agentco.orchestration.agent_node import _extract_tokens

        class MockUsage:
            total_tokens = 100
            prompt_tokens = 80
            completion_tokens = 20

        class MockChunk:
            usage = MockUsage()

        result = _extract_tokens(MockChunk())
        assert isinstance(result, tuple)
        assert result[0] == 100  # total
        assert result[1] == 80   # prompt
        assert result[2] == 20   # completion

    def test_extract_tokens_missing_split_returns_zeros(self):
        """When prompt/completion not available, return (total, 0, 0)."""
        from agentco.orchestration.agent_node import _extract_tokens

        class MockUsage:
            total_tokens = 100
            prompt_tokens = None
            completion_tokens = None

        class MockChunk:
            usage = MockUsage()

        result = _extract_tokens(MockChunk())
        assert result[0] == 100
        assert result[1] == 0
        assert result[2] == 0
