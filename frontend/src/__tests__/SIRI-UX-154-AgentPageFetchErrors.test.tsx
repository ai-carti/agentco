/**
 * SIRI-UX-154: AgentPage — memory/history fetch errors show misleading empty state
 *
 * When memory or history fetch fails, the component shows "No memories yet" /
 * "No completed tasks yet" instead of surfacing an error. User has no way to
 * know whether there's genuinely no data or whether a network error occurred.
 *
 * Fix: track memoryError / historyError state; show error message on failure.
 */
import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import AgentPage from '../components/AgentPage'

const AGENT_DATA = {
  id: 'agent-1',
  name: 'Test Agent',
  role: 'Engineer',
  model: 'gpt-4',
  system_prompt: 'You are helpful.',
}

function renderAgentPage() {
  return render(
    <MemoryRouter initialEntries={['/companies/c1/agents/agent-1']}>
      <Routes>
        <Route path="/companies/:id/agents/:agentId" element={<AgentPage />} />
      </Routes>
    </MemoryRouter>
  )
}

beforeEach(() => {
  vi.restoreAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('SIRI-UX-154: AgentPage memory/history error states', () => {
  it('shows error state when memory fetch fails (not misleading empty state)', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((url: RequestInfo | URL) => {
      const urlStr = url.toString()
      if (urlStr.includes('/memory')) {
        return Promise.reject(new Error('Network error'))
      }
      if (urlStr.includes('/tasks')) {
        return Promise.resolve({ ok: true, json: async () => [] } as Response)
      }
      // agent endpoint
      return Promise.resolve({ ok: true, json: async () => AGENT_DATA } as Response)
    })

    renderAgentPage()

    await waitFor(() => {
      expect(screen.getByTestId('memory-load-error')).toBeInTheDocument()
    })

    // Should NOT show misleading empty state message
    expect(screen.queryByText(/no memories yet/i)).not.toBeInTheDocument()
    // Should show an error indicator
    expect(screen.getByTestId('memory-load-error')).toBeInTheDocument()
  })

  it('shows error state when history fetch fails (not misleading empty state)', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((url: RequestInfo | URL) => {
      const urlStr = url.toString()
      if (urlStr.includes('/tasks')) {
        return Promise.reject(new Error('Network error'))
      }
      if (urlStr.includes('/memory')) {
        return Promise.resolve({ ok: true, json: async () => [] } as Response)
      }
      return Promise.resolve({ ok: true, json: async () => AGENT_DATA } as Response)
    })

    renderAgentPage()

    await waitFor(() => {
      expect(screen.getByTestId('history-load-error')).toBeInTheDocument()
    })

    // Should NOT show misleading empty state message
    expect(screen.queryByText(/no completed tasks yet/i)).not.toBeInTheDocument()
    // Should show an error indicator
    expect(screen.getByTestId('history-load-error')).toBeInTheDocument()
  })
})
