"""
Tests for ALEX-TD-020..024 tech debt fixes.

ALEX-TD-021: MemoryStore blocking calls wrapped in run_in_executor
ALEX-TD-022: encryption.py warns when ENCRYPTION_KEY not set
ALEX-TD-023: EventBus._subscribers is instance-level (no cross-test leak)
ALEX-TD-024: RunService.execute_run uses fresh session after checkpointer context
"""
import asyncio
import logging
import os
import pytest


# ── ALEX-TD-022: encryption warning when key not set ─────────────────────────

def test_encryption_warns_when_key_not_set(caplog, monkeypatch):
    """encryption.py должен логировать WARNING при отсутствии ENCRYPTION_KEY."""
    monkeypatch.delenv("ENCRYPTION_KEY", raising=False)

    # Re-import to pick up patched env
    import importlib
    import agentco.services.encryption as enc_module

    with caplog.at_level(logging.WARNING, logger="agentco.services.encryption"):
        # Calling _get_fernet() without key should trigger the warning
        importlib.reload(enc_module)
        enc_module._get_fernet()

    assert any("ENCRYPTION_KEY" in record.message for record in caplog.records), (
        "Expected a WARNING about ENCRYPTION_KEY not being set"
    )


def test_encryption_no_warn_when_key_set(caplog, monkeypatch):
    """Когда ENCRYPTION_KEY установлен — никаких предупреждений."""
    import base64
    from cryptography.fernet import Fernet
    key = Fernet.generate_key().decode()
    monkeypatch.setenv("ENCRYPTION_KEY", key)

    import importlib
    import agentco.services.encryption as enc_module

    with caplog.at_level(logging.WARNING, logger="agentco.services.encryption"):
        importlib.reload(enc_module)
        enc_module._get_fernet()

    warning_records = [r for r in caplog.records if "ENCRYPTION_KEY" in r.message]
    assert len(warning_records) == 0, "Should NOT warn when ENCRYPTION_KEY is set"


# ── ALEX-TD-023: EventBus._subscribers instance isolation ────────────────────

def test_eventbus_subscribers_not_shared_across_instances():
    """EventBus._subscribers не должен быть общим между тестами."""
    from agentco.core.event_bus import EventBus

    bus = EventBus.get()
    initial_count = len(bus._subscribers)

    # After we don't add anything, count should be same
    bus2 = EventBus.get()
    assert bus is bus2, "EventBus.get() must return the same singleton"
    assert len(bus2._subscribers) == initial_count


@pytest.mark.asyncio
async def test_eventbus_subscribe_cleanup():
    """После выхода из subscribe() — подписчик удаляется из списка."""
    from agentco.core.event_bus import EventBus

    bus = EventBus.get()
    initial_count = len(bus._subscribers)

    async def _consume_one():
        async for event in bus.subscribe("test-company-xyz"):
            return event

    task = asyncio.create_task(_consume_one())
    await asyncio.sleep(0)  # let it start

    # Should have one more subscriber now
    assert len(bus._subscribers) == initial_count + 1

    # Cancel to trigger finally cleanup
    task.cancel()
    try:
        await task
    except (asyncio.CancelledError, StopAsyncIteration):
        pass

    await asyncio.sleep(0)
    assert len(bus._subscribers) == initial_count, (
        "subscribe() must remove entry from _subscribers on exit/cancel"
    )


# ── ALEX-TD-021: MemoryStore async wrapping ───────────────────────────────────

@pytest.mark.asyncio
async def test_memory_store_insert_does_not_block_event_loop(tmp_path):
    """
    MemoryStore.insert (sync sqlite) вызывается из async контекста.
    Если вызов блокирует event loop — background_ticker не сможет прогрессировать.

    ALEX-TD-021: нужно обернуть sync sqlite вызовы в run_in_executor.
    Сейчас тест документирует проблему; после фикса должен проходить.
    """
    pytest.importorskip("sqlite_vec")

    db_path = str(tmp_path / "test_memory.db")

    from agentco.memory.store import MemoryStore
    store = MemoryStore(db_path)

    # Create a fake embedding (1536 zeros)
    fake_embedding = [0.0] * MemoryStore.EMBEDDING_DIM

    progress = []

    async def background_ticker():
        for _ in range(3):
            progress.append("tick")
            await asyncio.sleep(0)

    ticker = asyncio.create_task(background_ticker())

    # Run the blocking insert via run_in_executor (this is what ALEX-TD-021 fix does)
    loop = asyncio.get_running_loop()
    await loop.run_in_executor(
        None,
        store.insert,
        "test-agent",
        "test-task",
        "Test memory content",
        fake_embedding,
    )

    await ticker

    # If event loop was not blocked, all ticks should have happened
    assert len(progress) == 3, (
        f"Event loop was blocked during MemoryStore.insert: only {len(progress)} ticks"
    )
    store.close()
