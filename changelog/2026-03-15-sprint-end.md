# Sprint End — 2026-03-15

## M2-007: Loop detection + cost limits — CLOSED

**Status:** Already implemented as part of M2-002 (LangGraph orchestration graph).

### Implementation location

- **Loop detection logic:** `backend/src/agentco/orchestration/nodes.py` — `ceo_node()` function
  - Max iterations check: `iteration_count >= MAX_AGENT_ITERATIONS` (env var, default 10)
  - Cost limit check: `total_cost_usd >= MAX_RUN_COST_USD` (env var, default $1.00)
  - On breach: returns `status: "error"` with descriptive error message, graph terminates via conditional edge

- **State fields:** `backend/src/agentco/orchestration/state.py` — `AgentState` TypedDict
  - `iteration_count: int` — incremented each CEO node invocation
  - `total_tokens: int` — accumulated across all nodes
  - `total_cost_usd: float` — accumulated across all nodes

- **Graph routing:** `backend/src/agentco/orchestration/graph.py` — `_should_continue()`
  - When `status` is `"error"`, routes to `END` — no further iteration

### Test coverage

`backend/tests/test_orchestration.py::TestLoopDetection` (3 tests):
- `test_exceeding_max_iterations_sets_status_error` — iteration limit
- `test_exceeding_max_cost_sets_status_error` — cost limit
- `test_loop_detection_via_full_graph_run` — full graph integration with MAX_AGENT_ITERATIONS=1

## Fixes

### test_event_bus.py — `_create_company` helper hardened

Added `assert resp.status_code == 201` guard to `_create_company()` helper to surface API failures clearly instead of producing a confusing `KeyError: "id"`.
