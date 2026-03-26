/**
 * SIRI-UX-355: TaskDetailSidebar — (err as Error).name cast in catch block
 * catch receives `unknown`. If throw value is a DOMException (AbortError), it happens to work —
 * but the cast is unsafe by spec: unknown must be narrowed before property access.
 * Fix: replace `(err as Error).name` with `err instanceof Error ? err.name : ''`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import TaskDetailSidebar from '../components/TaskDetailSidebar'
import { type Task } from '../store/agentStore'

const task: Task = {
  id: 'task-1',
  title: 'Test task',
  status: 'todo',
}

function renderSidebar() {
  return render(
    <MemoryRouter>
      <TaskDetailSidebar task={task} companyId="co-1" onClose={() => {}} />
    </MemoryRouter>
  )
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('SIRI-UX-355: TaskDetailSidebar AbortError handling', () => {
  it('does not show error state when fetch is aborted (AbortError)', async () => {
    // Simulate AbortError thrown from fetch — must NOT set logsError
    vi.spyOn(globalThis, 'fetch').mockImplementationOnce(() => {
      const err = new DOMException('Aborted', 'AbortError')
      return Promise.reject(err)
    })
    renderSidebar()

    // Advance timers to let async effects settle
    await vi.runAllTimersAsync()

    // Should NOT show error — AbortError is intentional cancellation
    expect(screen.queryByTestId('logs-error')).not.toBeInTheDocument()
  })

  it('shows error state when fetch fails with a non-abort error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network Error'))
    renderSidebar()

    await vi.runAllTimersAsync()

    expect(screen.getByTestId('logs-error')).toBeInTheDocument()
  })
})
