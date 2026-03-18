"""
agentco/eventbus.py — Re-export from agentco.core.event_bus.

ALEX-TD-010 fix: Previously this file contained a duplicate EventBus class,
creating two separate singletons:
  - agentco.eventbus.EventBus (used by orchestration/agent_node.py)
  - agentco.core.event_bus.EventBus (used by handlers/ws_events.py and services/run.py)

Result: LLM streaming tokens were published to one bus, WebSocket subscribers
were listening on another → clients received nothing.

Fix: Make this module a thin re-export so both import paths resolve to the
same class and therefore the same singleton instance.
"""
from agentco.core.event_bus import EventBus  # noqa: F401

__all__ = ["EventBus"]
