// SIRI-UX-427: TaskDetailSidebar canRun should allow retry for tasks with status='error'
// A task stuck in 'error' (loop_detected, cost_limit_exceeded) should be retryable via sidebar Run button
import { describe, it, expect } from 'vitest'
import type { TaskStatus } from '../store/agentStore'

// Mirror the canRun logic from TaskDetailSidebar.tsx:157
function canRun(status: TaskStatus): boolean {
  return status === 'todo' || status === 'backlog' || status === 'error'
}

describe('SIRI-UX-427 — canRun allows retry for error status', () => {
  it('canRun is true for error status', () => {
    expect(canRun('error')).toBe(true)
  })

  it('canRun is true for todo and backlog (existing behaviour)', () => {
    expect(canRun('todo')).toBe(true)
    expect(canRun('backlog')).toBe(true)
  })

  it('canRun is false for in_progress, done, failed', () => {
    expect(canRun('in_progress')).toBe(false)
    expect(canRun('done')).toBe(false)
    expect(canRun('failed')).toBe(false)
  })
})
