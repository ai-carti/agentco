import { render, screen, act, fireEvent, within } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import WarRoomPage from '../components/WarRoomPage'
import { useWarRoomStore } from '../store/warRoomStore'

// --- Mock fetch ---
const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

// --- Mock WebSocket ---
class MockWebSocket {
  static instances: MockWebSocket[] = []
  url: string
  readyState = 1
  onopen: (() => void) | null = null
  onmessage: ((e: { data: string }) => void) | null = null
  onclose: ((e?: { code?: number }) => void) | null = null
  onerror: ((e?: unknown) => void) | null = null
  close = vi.fn()
  send = vi.fn()

  constructor(url: string) {
    this.url = url
    MockWebSocket.instances.push(this)
    setTimeout(() => this.onopen?.(), 0)
  }
}

function renderWarRoom(runId = 'run-1', companyId = 'comp-1') {
  return render(
    <MemoryRouter initialEntries={[`/companies/${companyId}/runs/${runId}`]}>
      <Routes>
        <Route path="/companies/:id/runs/:runId" element={<WarRoomPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  MockWebSocket.instances = []
  vi.stubGlobal('WebSocket', MockWebSocket)
  fetchMock.mockReset()
  useWarRoomStore.getState().reset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

function lastWs(): MockWebSocket {
  return MockWebSocket.instances[MockWebSocket.instances.length - 1]
}

describe('WarRoomPage', () => {
  // --- AC: Agent cards with name, role, status, avatar ---
  it('renders mock agents with name, role, and status', () => {
    renderWarRoom()
    const store = useWarRoomStore.getState()
    expect(store.agents.length).toBeGreaterThanOrEqual(3)

    // Agent panel should contain agent names
    const panel = screen.getByTestId('agent-panel')
    expect(within(panel).getByText('CEO Agent')).toBeInTheDocument()
    expect(within(panel).getByText('Dev Agent')).toBeInTheDocument()
    expect(within(panel).getByText('QA Agent')).toBeInTheDocument()
  })

  it('shows agent roles on cards', () => {
    renderWarRoom()
    expect(screen.getByText('Chief Executive Officer')).toBeInTheDocument()
    expect(screen.getByText('Software Developer')).toBeInTheDocument()
    expect(screen.getByText('Quality Assurance')).toBeInTheDocument()
  })

  // --- AC: Status thinking/running — animated pulsing dot ---
  it('shows pulsing indicator for thinking/running agents', () => {
    renderWarRoom()
    const dots = screen.getAllByTestId('agent-status-dot')
    const pulsingDots = dots.filter(
      (d) => d.className.includes('animate-pulse'),
    )
    expect(pulsingDots.length).toBeGreaterThan(0)
  })

  it('shows idle status without pulsing', () => {
    // Render first (loads mock data), then set all to idle
    renderWarRoom()
    act(() => {
      const store = useWarRoomStore.getState()
      store.agents.forEach((a) => store.updateAgentStatus(a.id, 'idle'))
    })
    const dots = screen.getAllByTestId('agent-status-dot')
    const pulsingDots = dots.filter(
      (d) => d.className.includes('animate-pulse'),
    )
    expect(pulsingDots.length).toBe(0)
  })

  // --- AC: Activity Feed ---
  it('renders activity feed with messages', () => {
    renderWarRoom()
    expect(screen.getByTestId('activity-feed')).toBeInTheDocument()
    const messages = screen.getAllByTestId('feed-message')
    expect(messages.length).toBeGreaterThan(0)
  })

  it('shows sender → target format in messages', () => {
    renderWarRoom()
    const feed = screen.getByTestId('activity-feed')
    expect(within(feed).getAllByText('→').length).toBeGreaterThan(0)
  })

  it('truncates messages longer than 120 characters', () => {
    // Render first to load mock data, then add a long message
    renderWarRoom()
    act(() => {
      useWarRoomStore.getState().addMessage({
        id: 'msg-long',
        senderId: 'agent-1',
        senderName: 'CEO Agent',
        targetId: 'agent-2',
        targetName: 'Dev Agent',
        content: 'A'.repeat(200),
        timestamp: new Date().toISOString(),
      })
    })
    const longMsg = screen.getByTestId('feed-message-msg-long')
    expect(longMsg.textContent).toContain('...')
    const contentEl = longMsg.querySelector('[data-testid="message-content"]')
    expect(contentEl?.textContent?.length).toBeLessThanOrEqual(123)
  })

  it('shows timestamp on messages', () => {
    renderWarRoom()
    const timestamps = screen.getAllByTestId('message-timestamp')
    expect(timestamps.length).toBeGreaterThan(0)
  })

  // --- AC: Cost counter ---
  it('displays cost counter', () => {
    renderWarRoom()
    expect(screen.getByTestId('cost-counter')).toBeInTheDocument()
    expect(screen.getByTestId('cost-counter').textContent).toMatch(
      /\$\d+\.\d{4}\s*spent/,
    )
  })

  // --- AC: Stop Run button ---
  it('renders Stop Run button', () => {
    renderWarRoom()
    const stopBtn = screen.getByTestId('stop-run-btn')
    expect(stopBtn).toBeInTheDocument()
    expect(stopBtn.textContent).toContain('Stop Run')
  })

  it('Stop Run button calls POST /api/companies/:id/runs/:runId/stop', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({}) })
    renderWarRoom('run-1', 'comp-1')
    const stopBtn = screen.getByTestId('stop-run-btn')

    await act(async () => {
      fireEvent.click(stopBtn)
    })

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/companies/comp-1/runs/run-1/stop'),
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('Stop Run button is disabled when run is not active', () => {
    // Render first, then change status
    renderWarRoom()
    act(() => {
      useWarRoomStore.getState().setRunStatus('stopped')
    })
    const stopBtn = screen.getByTestId('stop-run-btn')
    expect(stopBtn).toBeDisabled()
  })

  // --- AC: WebSocket hook ---
  it('connects WebSocket to ws://localhost:8000/ws/runs/{runId}', () => {
    renderWarRoom('run-42')
    expect(MockWebSocket.instances.length).toBe(1)
    expect(lastWs().url).toBe('ws://localhost:8000/ws/runs/run-42')
  })

  it('updates activity feed on WS message event', () => {
    renderWarRoom()
    const initialCount = screen.getAllByTestId('feed-message').length

    act(() => {
      lastWs().onmessage?.({
        data: JSON.stringify({
          type: 'agent.message',
          id: 'ws-msg-1',
          sender_id: 'agent-1',
          sender_name: 'CEO Agent',
          target_id: 'agent-2',
          target_name: 'Dev Agent',
          content: 'Please review the PR',
          timestamp: new Date().toISOString(),
        }),
      })
    })

    const newCount = screen.getAllByTestId('feed-message').length
    expect(newCount).toBe(initialCount + 1)
  })

  it('updates agent status on WS agent.status event', () => {
    renderWarRoom()

    act(() => {
      lastWs().onmessage?.({
        data: JSON.stringify({
          type: 'agent.status',
          agent_id: 'agent-1',
          status: 'done',
        }),
      })
    })

    const store = useWarRoomStore.getState()
    const agent = store.agents.find((a) => a.id === 'agent-1')
    expect(agent?.status).toBe('done')
  })

  it('retries WebSocket connection up to 3 times on disconnect', () => {
    vi.useFakeTimers()
    renderWarRoom()
    expect(MockWebSocket.instances.length).toBe(1)

    // First disconnect
    act(() => { lastWs().onclose?.() })
    act(() => { vi.advanceTimersByTime(3000) })
    expect(MockWebSocket.instances.length).toBe(2)

    // Second disconnect
    act(() => { lastWs().onclose?.() })
    act(() => { vi.advanceTimersByTime(3000) })
    expect(MockWebSocket.instances.length).toBe(3)

    // Third disconnect
    act(() => { lastWs().onclose?.() })
    act(() => { vi.advanceTimersByTime(3000) })
    expect(MockWebSocket.instances.length).toBe(4)

    // Fourth disconnect — should NOT retry (3 retries exhausted)
    act(() => { lastWs().onclose?.() })
    act(() => { vi.advanceTimersByTime(3000) })
    expect(MockWebSocket.instances.length).toBe(4)

    vi.useRealTimers()
  })

  it('closes WebSocket on unmount', () => {
    const { unmount } = renderWarRoom()
    const ws = lastWs()
    unmount()
    expect(ws.close).toHaveBeenCalled()
  })

  // --- AC: Mock data store ---
  it('initializes with 3-4 mock agents when no real WebSocket data', () => {
    // Render triggers loadMockData
    renderWarRoom()
    const store = useWarRoomStore.getState()
    expect(store.agents.length).toBeGreaterThanOrEqual(3)
    expect(store.agents.length).toBeLessThanOrEqual(4)
  })
})
