/**
 * BUG-037 — AgentPage Memory UI
 * Tests that the Memory section renders and calls the correct API endpoint
 */
import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import AgentPage from '../components/AgentPage'

function renderAgentPage(agentId = 'agent-1', companyId = 'c1') {
  return render(
    <MemoryRouter initialEntries={[`/companies/${companyId}/agents/${agentId}`]}>
      <Routes>
        <Route path="/companies/:id/agents/:agentId" element={<AgentPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('BUG-037: AgentPage Memory UI', () => {
  it('renders memory section', () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    })
    renderAgentPage()
    expect(screen.getByTestId('agent-memory-section')).toBeInTheDocument()
  })

  it('calls GET /api/companies/:companyId/agents/:agentId/memory on mount', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    })
    global.fetch = fetchMock

    renderAgentPage('agent-1', 'c1')

    await waitFor(() => {
      const calls = fetchMock.mock.calls.map((c) => c[0] as string)
      expect(calls.some((url) => url.includes('/api/companies/c1/agents/agent-1/memory'))).toBe(true)
    })
  })

  it('shows empty state 🧠 "No memories yet" when memory list is empty', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    })

    renderAgentPage()

    await waitFor(() => {
      expect(screen.getByText(/No memories yet/i)).toBeInTheDocument()
    })
  })

  it('shows skeleton while loading memories', () => {
    // Never resolves to keep loading state
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {}))
    renderAgentPage()

    // Memory section should be present
    expect(screen.getByTestId('agent-memory-section')).toBeInTheDocument()
    // Skeleton should render (SkeletonCard renders skeleton-task elements)
    expect(screen.getAllByTestId('skeleton-task').length).toBeGreaterThan(0)
  })

  it('renders MemoryEntry cards with content and created_at', async () => {
    const memories = [
      { id: 'm1', content: 'User prefers dark mode', created_at: '2026-03-01T10:00:00Z' },
      { id: 'm2', content: 'CEO meeting on Fridays', created_at: '2026-03-02T12:00:00Z' },
    ]

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('/memory')) {
        return Promise.resolve({ ok: true, json: async () => memories })
      }
      return Promise.resolve({ ok: true, json: async () => [] })
    })

    renderAgentPage()

    await waitFor(() => {
      expect(screen.getByText('User prefers dark mode')).toBeInTheDocument()
      expect(screen.getByText('CEO meeting on Fridays')).toBeInTheDocument()
    })

    const entries = screen.getAllByTestId('memory-entry')
    expect(entries).toHaveLength(2)
  })
})
