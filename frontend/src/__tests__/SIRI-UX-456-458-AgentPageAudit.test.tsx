/**
 * SIRI-UX-456: AgentPage dynamic document title — shows agent name when loaded
 * SIRI-UX-457: AgentPage saveToLibraryError span has role="alert" for screen readers
 * SIRI-UX-458: WarRoomPage Stop button has aria-disabled mirroring disabled prop
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, waitFor, act } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import AgentPage from '../components/AgentPage'
import WarRoomPage from '../components/WarRoomPage'

// ── shared mocks ────────────────────────────────────────────────────────────

vi.mock('../api/client', () => ({
  getStoredToken: () => 'tok',
  BASE_URL: 'http://localhost:8000',
}))

vi.mock('../context/ToastContext', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}))

vi.mock('../store/warRoomStore', async () => {
  const { create } = await import('zustand')
  const store = create(() => ({
    agents: [] as { id: string; name: string; role: string; avatar: string; status: string; level: number }[],
    messages: [],
    cost: 0,
    runStatus: 'idle',
    flashingAgents: new Set<string>(),
    loadMockData: vi.fn(),
    clearFlash: vi.fn(),
    setRunStatus: vi.fn(),
    addMessage: vi.fn(),
    updateAgentStatus: vi.fn(),
    addCost: vi.fn(),
    reset: vi.fn(),
  }))
  return {
    useWarRoomStore: store,
    getNextMockEvent: vi.fn(),
  }
})

vi.mock('../hooks/useWarRoomSocket', () => ({
  useWarRoomSocket: () => ({ isConnected: false, error: null }),
}))

vi.mock('../hooks/useAutoScroll', () => ({
  useAutoScroll: () => ({ feedEndRef: { current: null }, containerRef: { current: null }, handleScroll: vi.fn() }),
}))

vi.mock('../hooks/useIsMobile', () => ({
  useIsMobile: () => false,
}))

// ── SIRI-UX-456 ─────────────────────────────────────────────────────────────

describe('SIRI-UX-456: AgentPage — dynamic document title', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.endsWith('/agents/agent-1')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ id: 'agent-1', name: 'Ada', role: 'Engineer', model: 'gpt-4o' }),
        })
      }
      if (url.includes('/tasks')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) })
      }
      if (url.includes('/memory')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
    })
  })

  it('sets document title to agent name once loaded', async () => {
    render(
      <MemoryRouter initialEntries={['/companies/c1/agents/agent-1']}>
        <Routes>
          <Route path="/companies/:id/agents/:agentId" element={<AgentPage />} />
        </Routes>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(document.title).toBe('Ada — AgentCo')
    }, { timeout: 3000 })
  })
})

// ── SIRI-UX-457 ─────────────────────────────────────────────────────────────

describe('SIRI-UX-457: AgentPage — saveToLibraryError has role="alert"', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.endsWith('/library') && !url.includes('/agents/')) {
        // POST to /library — fail
        return Promise.resolve({ ok: false, status: 500 })
      }
      if (url.endsWith('/agents/agent-1')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ id: 'agent-1', name: 'Ada', role: 'Engineer', model: 'gpt-4o' }),
        })
      }
      if (url.includes('/tasks')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) })
      }
      if (url.includes('/memory')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
    })
  })

  it('saveToLibraryError span has role="alert"', async () => {
    const { getByTestId } = render(
      <MemoryRouter initialEntries={['/companies/c1/agents/agent-1']}>
        <Routes>
          <Route path="/companies/:id/agents/:agentId" element={<AgentPage />} />
        </Routes>
      </MemoryRouter>,
    )

    await waitFor(() => getByTestId('save-to-library-btn'), { timeout: 3000 })

    await act(async () => {
      getByTestId('save-to-library-btn').click()
    })

    await waitFor(() => {
      const errorEl = getByTestId('save-to-library-error')
      expect(errorEl).toHaveAttribute('role', 'alert')
    }, { timeout: 3000 })
  })
})

// ── SIRI-UX-458 ─────────────────────────────────────────────────────────────

describe('SIRI-UX-458: WarRoomPage Stop button — aria-disabled mirrors disabled', () => {
  it('Stop button has aria-disabled="true" when runStatus is idle and agents are present', async () => {
    const { useWarRoomStore } = await import('../store/warRoomStore')
    // Set agents to get past empty/connecting state
    act(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (useWarRoomStore as any).setState({
        agents: [{ id: 'a1', name: 'CEO', role: 'Chief', avatar: '🤖', status: 'idle', level: 0 }],
        runStatus: 'idle',
        messages: [],
        cost: 0,
        flashingAgents: new Set<string>(),
      })
    })

    const { getByTestId } = render(
      <MemoryRouter initialEntries={['/companies/c1']}>
        <Routes>
          <Route path="/companies/:id" element={<WarRoomPage />} />
        </Routes>
      </MemoryRouter>,
    )

    await waitFor(() => getByTestId('stop-btn'), { timeout: 3000 })

    const stopBtn = getByTestId('stop-btn')
    // When isStopDisabled=true (idle runStatus), aria-disabled should be "true"
    expect(stopBtn).toHaveAttribute('aria-disabled', 'true')
    expect(stopBtn).toBeDisabled()
  })
})
