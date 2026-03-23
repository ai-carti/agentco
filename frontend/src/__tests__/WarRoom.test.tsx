import { render, screen, act, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import WarRoom from '../components/WarRoom'
import { useAuthStore } from '../store/authStore'
import { useAgentStore } from '../store/agentStore'

const renderWarRoom = () =>
  render(
    <MemoryRouter>
      <WarRoom />
    </MemoryRouter>,
  )

// --- Mock WebSocket ---
class MockWebSocket {
  static instances: MockWebSocket[] = []
  url: string
  onopen: (() => void) | null = null
  onmessage: ((e: { data: string }) => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  close = vi.fn()

  constructor(url: string) {
    this.url = url
    MockWebSocket.instances.push(this)
  }
}

beforeEach(() => {
  MockWebSocket.instances = []
  vi.stubGlobal('WebSocket', MockWebSocket)
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: async () => [],
  }))
  useAuthStore.setState({ token: 'jwt-tok-123' })
  useAgentStore.setState({ currentCompany: { id: 'comp-1', name: 'TestCo' } })
})

afterEach(() => {
  vi.restoreAllMocks()
})

function lastWs(): MockWebSocket {
  return MockWebSocket.instances[MockWebSocket.instances.length - 1]
}

describe('WarRoom', () => {
  it('creates WebSocket with correct URL on mount', () => {
    renderWarRoom()
    expect(MockWebSocket.instances.length).toBe(1)
    // URL should use ws:// scheme and include the correct path
    expect(lastWs().url).toMatch(/^ws:\/\//)
    expect(lastWs().url).toContain('/ws/companies/comp-1/events?token=jwt-tok-123')
  })

  it('shows empty state when no runs after WS connected', () => {
    renderWarRoom()
    act(() => {
      lastWs().onopen?.()
    })
    expect(screen.getByText(/all quiet here/i)).toBeInTheDocument()
  })

  it('run.started adds a run card', () => {
    renderWarRoom()
    act(() => {
      lastWs().onmessage?.({
        data: JSON.stringify({
          type: 'run.started',
          run_id: 'r1',
          agent_name: 'Alice',
          task_title: 'Deploy API',
          started_at: new Date().toISOString(),
        }),
      })
    })
    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('Deploy API')).toBeInTheDocument()
    expect(screen.getByTestId('run-status-r1')).toHaveTextContent(/running/i)
  })

  it('run.completed updates status to done', () => {
    // SIRI-UX-224: backend publishes "run.completed" not "run.done"
    renderWarRoom()
    act(() => {
      lastWs().onmessage?.({
        data: JSON.stringify({
          type: 'run.started',
          run_id: 'r2',
          agent_name: 'Bob',
          task_title: 'Fix bug',
          started_at: new Date().toISOString(),
        }),
      })
    })
    act(() => {
      lastWs().onmessage?.({
        data: JSON.stringify({ type: 'run.completed', run_id: 'r2' }),
      })
    })
    expect(screen.getByTestId('run-status-r2')).toHaveTextContent(/done/i)
  })

  it('run.failed updates status to failed', () => {
    renderWarRoom()
    act(() => {
      lastWs().onmessage?.({
        data: JSON.stringify({
          type: 'run.started',
          run_id: 'r3',
          agent_name: 'Carol',
          task_title: 'Run tests',
          started_at: new Date().toISOString(),
        }),
      })
    })
    act(() => {
      lastWs().onmessage?.({
        data: JSON.stringify({ type: 'run.failed', run_id: 'r3' }),
      })
    })
    expect(screen.getByTestId('run-status-r3')).toHaveTextContent(/failed/i)
  })

  it('run.stopped updates status to stopped', () => {
    renderWarRoom()
    act(() => {
      lastWs().onmessage?.({
        data: JSON.stringify({
          type: 'run.started',
          run_id: 'r4',
          agent_name: 'Dave',
          task_title: 'Sync data',
          started_at: new Date().toISOString(),
        }),
      })
    })
    act(() => {
      lastWs().onmessage?.({
        data: JSON.stringify({ type: 'run.stopped', run_id: 'r4' }),
      })
    })
    expect(screen.getByTestId('run-status-r4')).toHaveTextContent(/stopped/i)
  })

  it('closes WebSocket on unmount', () => {
    const { unmount } = renderWarRoom()
    const ws = lastWs()
    unmount()
    expect(ws.close).toHaveBeenCalled()
  })

  it('does not create WebSocket when token or companyId is missing', () => {
    useAuthStore.setState({ token: null })
    renderWarRoom()
    expect(MockWebSocket.instances.length).toBe(0)
  })

  // BUG-038: WS URL built from VITE_API_URL (not hardcoded)
  it('builds WS URL using ws:// protocol derived from env', () => {
    renderWarRoom()
    // URL must use ws:// protocol (derived from http:// via replace)
    expect(lastWs().url).toMatch(/^ws:\/\//)
    // URL must include the correct WS path
    expect(lastWs().url).toContain('/ws/companies/comp-1/events')
    // URL must include auth token
    expect(lastWs().url).toContain('token=jwt-tok-123')
  })

  it('reconnects after onclose with delay', () => {
    vi.useFakeTimers()
    renderWarRoom()
    expect(MockWebSocket.instances.length).toBe(1)
    act(() => {
      lastWs().onclose?.()
    })
    expect(MockWebSocket.instances.length).toBe(1)
    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(MockWebSocket.instances.length).toBe(2)
    vi.useRealTimers()
  })

  // BUG-043: loading guard — no empty state until WS connected or timed out
  it('does not show empty state while connecting (before WS open)', () => {
    renderWarRoom()
    // WS exists but has not fired onopen yet → still connecting
    expect(MockWebSocket.instances.length).toBe(1)
    expect(screen.queryByText(/all quiet here/i)).not.toBeInTheDocument()
  })

  it('shows empty state after WS connection is established and no runs', async () => {
    renderWarRoom()
    act(() => {
      lastWs().onopen?.()
    })
    expect(screen.getByText(/all quiet here/i)).toBeInTheDocument()
  })

  // BUG-043: initial REST fetch GET /api/companies/{id}/runs on mount
  it('fetches initial runs from REST on mount', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        {
          run_id: 'r-init',
          agent_name: 'InitAgent',
          task_title: 'Initial Task',
          status: 'running',
          started_at: new Date().toISOString(),
        },
      ],
    })
    vi.stubGlobal('fetch', fetchMock)
    renderWarRoom()
    await waitFor(() => {
      expect(screen.getByText('InitAgent')).toBeInTheDocument()
    })
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/companies/comp-1/runs'),
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer jwt-tok-123' }) }),
    )
  })

  it('shows run cards from REST fetch even before WS open', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        {
          run_id: 'r-rest',
          agent_name: 'RestAgent',
          task_title: 'Rest Task',
          status: 'running',
          started_at: new Date().toISOString(),
        },
      ],
    })
    vi.stubGlobal('fetch', fetchMock)
    renderWarRoom()
    await waitFor(() => {
      expect(screen.getByText('RestAgent')).toBeInTheDocument()
    })
    // Empty state should NOT show since there are runs
    expect(screen.queryByText(/all quiet here/i)).not.toBeInTheDocument()
  })
})
