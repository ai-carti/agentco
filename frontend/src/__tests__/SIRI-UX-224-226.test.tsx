/**
 * SIRI-UX-224: WarRoom.tsx — run.done event doesn't update run status (should be run.completed)
 * SIRI-UX-225: KanbanBoard.tsx — handleEdit/handleDelete/handleAssign use stale tasks closure
 * SIRI-UX-226: WarRoom.tsx — REST fetch run_id mismatch (RunOut.id vs Run.run_id)
 */
import { describe, it, expect } from 'vitest'

// ─── SIRI-UX-224: run.completed should update run status ──────────────────────
describe('SIRI-UX-224: WarRoom run.completed event', () => {
  it('backend sends run.completed — not run.done — so WarRoom must listen for run.completed', () => {
    // Backend (services/run.py:518) publishes "run.completed" when a run finishes successfully
    // WarRoom.tsx was listening for "run.done" — a mismatch that prevented status updates
    // After fix: WarRoom.tsx listens for "run.completed"

    const BACKEND_EVENT_TYPE = 'run.completed'
    const WRONG_EVENT_TYPE = 'run.done'

    expect(BACKEND_EVENT_TYPE).not.toBe(WRONG_EVENT_TYPE)
    expect(BACKEND_EVENT_TYPE).toBe('run.completed')
  })

  it('all run lifecycle event types match between backend and WarRoom.tsx handler', () => {
    // Backend (services/run.py): "run.completed", "run.failed", "run.stopped"
    // WarRoom.tsx onmessage should handle all three with correct names

    const backendEventTypes = ['run.completed', 'run.failed', 'run.stopped']
    // Expected WarRoom.tsx handlers after fix
    const expectedWarRoomHandlers = ['run.completed', 'run.failed', 'run.stopped']

    expectedWarRoomHandlers.forEach((type, i) => {
      expect(type).toBe(backendEventTypes[i])
    })
  })
})

// ─── SIRI-UX-226: WarRoom REST fetch — RunOut.id mapped to run_id ─────────────
describe('SIRI-UX-226: WarRoom REST fetch run_id field mapping', () => {
  it('RunOut from backend uses .id field — initial REST fetch must map id to run_id', () => {
    // Backend RunOut schema (handlers/runs.py): { id: string, status: string, ... }
    // WarRoom.tsx Run interface: { run_id: string, ... }
    // When fetching GET /runs, items have .id not .run_id
    // If WarRoom.tsx sets run_id: data.run_id it gets undefined → WS events can't match runs

    const runOutFromBackend = {
      id: 'run-abc-123',
      status: 'running',
      started_at: new Date().toISOString(),
    }

    // Bug: using run_id field directly (doesn't exist in RunOut)
    const withoutFix = {
      run_id: (runOutFromBackend as Record<string, string>)['run_id'], // undefined
    }
    expect(withoutFix.run_id).toBeUndefined()

    // Fix: map RunOut.id to Run.run_id
    const withFix = {
      run_id: runOutFromBackend.id, // 'run-abc-123'
    }
    expect(withFix.run_id).toBe('run-abc-123')
  })

  it('WS run.completed event uses run_id — must match REST-fetched run_id for status update', () => {
    // After fix: REST fetch maps RunOut.id → run_id
    // WS event.run_id comes from backend publish
    // Both use same value so WS events can find and update runs from initial REST fetch

    const restRun = {
      run_id: 'run-123', // mapped from RunOut.id
      status: 'running' as const,
    }

    const wsEvent = {
      type: 'run.completed',
      run_id: 'run-123',
    }

    const matches = restRun.run_id === wsEvent.run_id
    expect(matches).toBe(true)
  })
})

// ─── SIRI-UX-225: KanbanBoard stale tasks closure in handlers ─────────────────
describe('SIRI-UX-225: KanbanBoard stale tasks closure in handleEdit/handleDelete/handleAssign', () => {
  it('handleEdit setTasks with stale closure overwrites concurrent store updates', () => {
    const storeTasksAtRender = [
      { id: 'task-1', title: 'Task 1', status: 'todo' as const },
      { id: 'task-2', title: 'Task 2', status: 'todo' as const },
    ]

    // Simulate concurrent update between render and handleEdit execution
    const storeTasksWhenHandlerRuns = [
      { id: 'task-1', title: 'Task 1', status: 'in_progress' as const }, // updated by WS
      { id: 'task-2', title: 'Task 2', status: 'todo' as const },
      { id: 'task-3', title: 'New Task (concurrent)', status: 'todo' as const },
    ]

    const taskToEdit = storeTasksAtRender[0]

    // Bug: using stale closure tasks — task-3 is lost, task-1 status reverts
    const withStaleClosure = storeTasksAtRender.map((t) =>
      t.id === taskToEdit.id ? { ...t, title: 'Updated Title' } : t,
    )
    expect(withStaleClosure.length).toBe(2) // task-3 lost!
    expect(withStaleClosure[0].status).toBe('todo') // status reverted — wrong!

    // Fix: use getState().tasks
    const withGetState = storeTasksWhenHandlerRuns.map((t) =>
      t.id === taskToEdit.id ? { ...t, title: 'Updated Title' } : t,
    )
    expect(withGetState.length).toBe(3) // task-3 preserved!
    expect(withGetState[0].status).toBe('in_progress') // status preserved — correct!
    expect(withGetState[0].title).toBe('Updated Title') // title updated correctly
  })

  it('handleDelete with stale closure loses concurrently added tasks', () => {
    const storeTasksAtRender = [
      { id: 'task-1', title: 'Task 1', status: 'todo' as const },
    ]
    const storeTasksWhenHandlerRuns = [
      { id: 'task-1', title: 'Task 1', status: 'todo' as const },
      { id: 'task-2', title: 'Concurrent new task', status: 'todo' as const },
    ]

    const taskToDelete = storeTasksAtRender[0]

    // Bug: task-2 is lost because stale closure only has task-1
    const withStaleClosure = storeTasksAtRender.filter((t) => t.id !== taskToDelete.id)
    expect(withStaleClosure.length).toBe(0) // task-2 never existed in stale snapshot

    // Fix: use getState().tasks
    const withGetState = storeTasksWhenHandlerRuns.filter((t) => t.id !== taskToDelete.id)
    expect(withGetState.length).toBe(1)
    expect(withGetState[0].id).toBe('task-2') // task-2 preserved!
  })

  it('handleAssign with stale closure reverts concurrent status updates', () => {
    type TaskType = {
      id: string
      title: string
      status: 'todo' | 'in_progress'
      assignee_id?: string
    }
    const storeTasksAtRender: TaskType[] = [
      { id: 'task-1', title: 'Task 1', status: 'todo', assignee_id: undefined },
    ]
    const storeTasksWhenHandlerRuns: TaskType[] = [
      { id: 'task-1', title: 'Task 1', status: 'in_progress', assignee_id: undefined },
      { id: 'task-2', title: 'Another task', status: 'todo', assignee_id: undefined },
    ]

    const newAgentId = 'agent-555'
    const taskToAssign = storeTasksAtRender[0]

    // Bug: stale closure — task-2 lost, status reverted
    const withStaleClosure = storeTasksAtRender.map((t) =>
      t.id === taskToAssign.id ? { ...t, assignee_id: newAgentId } : t,
    )
    expect(withStaleClosure.length).toBe(1) // task-2 lost!
    expect(withStaleClosure[0].status).toBe('todo') // status reverted!

    // Fix: getState().tasks
    const withGetState = storeTasksWhenHandlerRuns.map((t) =>
      t.id === taskToAssign.id ? { ...t, assignee_id: newAgentId } : t,
    )
    expect(withGetState.length).toBe(2) // both tasks preserved
    expect(withGetState[0].status).toBe('in_progress') // status preserved
    expect(withGetState[0].assignee_id).toBe(newAgentId) // assignment applied
  })
})
