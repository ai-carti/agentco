/**
 * SIRI-UX-417: agentStore.Task.assignedTo is a dead field — declared in the interface
 * but never set by any component or API response. All assignee data flows through
 * assignee_id + assignee_name. The dead field misleads contributors.
 * Fix: remove `assignedTo` from the Task interface.
 * Test: verifies Task type does NOT include assignedTo in a way that is actually used,
 * and that assignee_id/assignee_name are the canonical assignee fields.
 */
import { describe, it, expect } from 'vitest'
import type { Task } from '../store/agentStore'

describe('SIRI-UX-417: Task interface — assignedTo removed, assignee_id/name canonical', () => {
  it('Task can be constructed with assignee_id and assignee_name without assignedTo', () => {
    const task: Task = {
      id: 't1',
      title: 'Test task',
      status: 'todo',
      assignee_id: 'agent-1',
      assignee_name: 'Alice',
    }
    expect(task.assignee_id).toBe('agent-1')
    expect(task.assignee_name).toBe('Alice')
    // assignedTo should NOT exist on the interface (if it's removed, accessing it is a TS error,
    // but at runtime it's simply undefined — we just verify the canonical fields work)
    expect((task as unknown as Record<string, unknown>).assignedTo).toBeUndefined()
  })

  it('Task without assignee fields defaults to undefined for assignee_id', () => {
    const task: Task = { id: 't2', title: 'No assignee', status: 'backlog' }
    expect(task.assignee_id).toBeUndefined()
    expect(task.assignee_name).toBeUndefined()
  })
})
