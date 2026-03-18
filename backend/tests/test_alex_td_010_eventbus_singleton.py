"""
ALEX-TD-010: Verify that agent_node.py and ws_events.py use the SAME EventBus singleton.

Bug: agent_node.py imports from agentco.eventbus.EventBus while
ws_events.py and services/run.py import from agentco.core.event_bus.EventBus.
These are two different classes → two different _instance singletons.
LLM streaming tokens are published to one bus, WebSocket subscribed to another → no events reach clients.

Fix: agent_node.py should import from agentco.core.event_bus.EventBus.
"""
import pytest


class TestEventBusSingletonUnified:
    """agent_node and ws_events must share the same EventBus singleton."""

    def test_agent_node_and_ws_events_use_same_eventbus_class(self):
        """
        Both agent_node and ws_events must import EventBus from the SAME module.
        If they import from different modules, they get different singletons.
        """
        import importlib
        import sys

        # Force reimport to get fresh module references
        agent_node_mod = importlib.import_module("agentco.orchestration.agent_node")
        ws_events_mod = importlib.import_module("agentco.handlers.ws_events")
        run_service_mod = importlib.import_module("agentco.services.run")

        # Get the EventBus class used by ws_events
        ws_bus_class = ws_events_mod.EventBus
        # Get the EventBus class used by run service
        run_bus_class = run_service_mod.EventBus

        # agent_node imports EventBus lazily inside functions — we need to check
        # what it resolves to. Import both known modules:
        from agentco.core.event_bus import EventBus as CoreEventBus
        from agentco.eventbus import EventBus as LegacyEventBus

        # ws_events must use core event bus
        assert ws_bus_class is CoreEventBus, (
            "ws_events.py must import EventBus from agentco.core.event_bus"
        )

        # run service must use core event bus
        assert run_bus_class is CoreEventBus, (
            "services/run.py must import EventBus from agentco.core.event_bus"
        )

        # The two EventBus classes must be the same class
        # (even if agent_node imports from legacy path, they must be aliases)
        assert CoreEventBus is LegacyEventBus, (
            "ALEX-TD-010: agentco.eventbus.EventBus and agentco.core.event_bus.EventBus "
            "must be the SAME class. Currently they are two separate classes with separate "
            "_instance singletons. Fix: make agentco/eventbus.py re-export from core.event_bus, "
            "or update agent_node.py to import from agentco.core.event_bus."
        )

    @pytest.mark.asyncio
    async def test_agent_node_publishes_to_same_bus_as_ws_events_subscribes(self):
        """
        Events published by agent_node (via agentco.eventbus) must be received
        by subscribers using agentco.core.event_bus (as ws_events does).
        """
        import asyncio
        from agentco.core.event_bus import EventBus as CoreEventBus

        # Reset both singletons
        from agentco import eventbus as legacy_module
        from agentco.core import event_bus as core_module

        # Simulate: ws_events subscribes via core.event_bus
        core_bus = CoreEventBus.get()

        received = []

        async def consume():
            async for event in core_bus.subscribe("test-company"):
                received.append(event)
                break

        consumer_task = asyncio.create_task(consume())
        await asyncio.sleep(0.01)

        # Simulate: agent_node publishes via agentco.eventbus
        from agentco.eventbus import EventBus as LegacyEventBus
        legacy_bus = LegacyEventBus.get()
        await legacy_bus.publish({
            "company_id": "test-company",
            "type": "llm_token",
            "data": "Hello from agent",
        })

        try:
            await asyncio.wait_for(consumer_task, timeout=1.0)
            assert len(received) == 1, (
                "ALEX-TD-010: Event published via agentco.eventbus was NOT received "
                "by subscriber via agentco.core.event_bus. Two separate singletons detected."
            )
        except asyncio.TimeoutError:
            consumer_task.cancel()
            pytest.fail(
                "ALEX-TD-010: Timeout — event published via agentco.eventbus never reached "
                "subscriber via agentco.core.event_bus. This confirms the dual-singleton bug."
            )
