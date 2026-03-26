/**
 * SIRI-UX-358: AgentPage — memory-load-error missing role="alert"
 * `history-load-error` has `role="alert"` (added in a previous fix) but
 * `memory-load-error` was missing it. Screen readers won't announce the
 * memory failure without the alert role.
 * Fix: add `role="alert"` to the memory error paragraph.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import AgentPage from '../components/AgentPage'

function renderAgentPage() {
  return render(
    <MemoryRouter initialEntries={['/companies/co-1/agents/ag-1']}>
      <Routes>
        <Route path="/companies/:id/agents/:agentId" element={<AgentPage />} />
      </Routes>
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

describe('SIRI-UX-358: AgentPage memory error has role="alert"', () => {
  it('memory-load-error has role="alert" when memory fetch fails', async () => {
    let callCount = 0
    vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
      callCount++
      const urlStr = String(url)
      if (urlStr.includes('/memory')) {
        return Promise.reject(new Error('Network error'))
      }
      if (urlStr.includes('/tasks')) {
        return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }))
      }
      // agent data
      return Promise.resolve(
        new Response(JSON.stringify({ id: 'ag-1', name: 'TestAgent', role: 'Worker' }), { status: 200 })
      )
    })

    renderAgentPage()
    await vi.runAllTimersAsync()

    const errorEl = screen.queryByTestId('memory-load-error')
    expect(errorEl).toBeInTheDocument()
    expect(errorEl).toHaveAttribute('role', 'alert')
  })

  it('history-load-error also has role="alert" when history fetch fails (regression)', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
      const urlStr = String(url)
      if (urlStr.includes('/tasks')) {
        return Promise.reject(new Error('Network error'))
      }
      if (urlStr.includes('/memory')) {
        return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }))
      }
      return Promise.resolve(
        new Response(JSON.stringify({ id: 'ag-1', name: 'TestAgent', role: 'Worker' }), { status: 200 })
      )
    })

    renderAgentPage()
    await vi.runAllTimersAsync()

    const historyErrorEl = screen.queryByTestId('history-load-error')
    expect(historyErrorEl).toBeInTheDocument()
    expect(historyErrorEl).toHaveAttribute('role', 'alert')
  })
})
