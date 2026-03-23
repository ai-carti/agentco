/**
 * SIRI-UX-215: OnboardingPage — setLoading(false) in finally after navigate (unmounted component)
 * SIRI-UX-216: WarRoomPage handleStop — missing signal.aborted guard after Promise.allSettled
 * SIRI-UX-217: TaskDetailSidebar — duplicate log entry key collision (index-based key)
 */
import { render, screen, act, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import TaskDetailSidebar from '../components/TaskDetailSidebar'

// ─── SIRI-UX-217 ─────────────────────────────────────────────────────────────
describe('SIRI-UX-217: TaskDetailSidebar — duplicate log keys', () => {
  const task = {
    id: 't1',
    title: 'Test Task',
    status: 'todo' as const,
    description: '',
  }

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders duplicate log entries without React key warning', async () => {
    const duplicateLogs = [
      { timestamp: '2026-03-23T10:00:00Z', message: 'Starting...' },
      { timestamp: '2026-03-23T10:00:00Z', message: 'Starting...' }, // exact duplicate → key collision
      { timestamp: '2026-03-23T10:00:01Z', message: 'Done' },
    ]

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ logs: duplicateLogs, status_history: [] }),
    } as unknown as Response)

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await act(async () => {
      render(
        <MemoryRouter>
          <TaskDetailSidebar task={task} companyId="c1" onClose={() => {}} />
        </MemoryRouter>
      )
    })

    // Wait for logs to render
    await waitFor(
      () => {
        const entries = screen.getAllByText('Starting...')
        expect(entries.length).toBeGreaterThanOrEqual(1)
      },
      { timeout: 3000 }
    )

    // After fix: index-based keys mean no duplicate key warnings
    const keyWarnings = consoleSpy.mock.calls.filter(
      (args) =>
        typeof args[0] === 'string' &&
        (args[0].includes('duplicate') ||
          args[0].includes('Each child') ||
          args[0].includes('key prop'))
    )
    expect(keyWarnings).toHaveLength(0)
    fetchSpy.mockRestore()
    consoleSpy.mockRestore()
  })
})
