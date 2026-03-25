/**
 * FE-005 — Task pagination + Load More in KanbanBoard
 * FE-006 — Mobile WarRoom drawer pattern
 */
import { render, screen, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import KanbanBoard from '../components/KanbanBoard'
import { useAgentStore } from '../store/agentStore'
import { useWarRoomStore } from '../store/warRoomStore'
import { ToastProvider } from '../context/ToastContext'
import WarRoomPage from '../components/WarRoomPage'

// Mocks needed for WarRoomPage tests
vi.mock('../hooks/useWarRoomSocket', () => ({
  useWarRoomSocket: () => ({ isConnected: false }),
}))

vi.mock('../api/client', () => ({
  getStoredToken: () => null,
  BASE_URL: 'http://localhost:8000',
}))

function renderWithToast(ui: React.ReactElement) {
  return render(<ToastProvider>{ui}</ToastProvider>)
}

// ─── FE-005 ──────────────────────────────────────────────────────────────────

describe('FE-005: KanbanBoard pagination', () => {
  beforeEach(() => {
    useAgentStore.setState({ tasks: [], agents: [] })
    vi.clearAllMocks()
  })

  it('renders Load More button when hasMore=true', () => {
    renderWithToast(
      <KanbanBoard companyId="c1" isLoaded hasMore={true} onLoadMore={vi.fn()} />
    )
    expect(screen.getByTestId('kanban-load-more-btn')).toBeInTheDocument()
  })

  it('does not render Load More button when hasMore=false', () => {
    renderWithToast(
      <KanbanBoard companyId="c1" isLoaded hasMore={false} onLoadMore={vi.fn()} />
    )
    expect(screen.queryByTestId('kanban-load-more-btn')).not.toBeInTheDocument()
  })

  it('does not render Load More when hasMore prop omitted', () => {
    renderWithToast(<KanbanBoard companyId="c1" isLoaded />)
    expect(screen.queryByTestId('kanban-load-more-btn')).not.toBeInTheDocument()
  })

  it('clicking Load More calls onLoadMore callback', () => {
    const onLoadMore = vi.fn()
    useAgentStore.setState({
      tasks: [{ id: 't1', title: 'Task A', status: 'todo' }],
    })
    renderWithToast(
      <KanbanBoard companyId="c1" isLoaded hasMore={true} onLoadMore={onLoadMore} />
    )
    fireEvent.click(screen.getByTestId('kanban-load-more-btn'))
    expect(onLoadMore).toHaveBeenCalledOnce()
  })

  it('renders 100+ task cards without console.warn about performance', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const manyTasks = Array.from({ length: 110 }, (_, i) => ({
      id: `t${i}`,
      title: `Task ${i}`,
      status: 'todo' as const,
    }))
    useAgentStore.setState({ tasks: manyTasks })
    renderWithToast(
      <KanbanBoard companyId="c1" isLoaded hasMore={false} onLoadMore={() => {}} />
    )
    // All cards should render
    const cards = screen.getAllByTestId(/^task-card-/)
    expect(cards.length).toBe(110)
    // No performance warnings
    expect(consoleSpy).not.toHaveBeenCalled()
    consoleSpy.mockRestore()
  })

  it('CompanyPage fetches tasks with ?limit=50 by default', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/agents')) {
        return Promise.resolve({ ok: true, json: async () => [] })
      }
      if (url.includes('/tasks')) {
        return Promise.resolve({ ok: true, json: async () => [] })
      }
      // Company endpoint
      return Promise.resolve({ ok: true, json: async () => ({ id: 'comp-1', name: 'Test Corp' }) })
    })
    globalThis.fetch = fetchMock

    const { default: CompanyPage } = await import('../components/CompanyPage')
    render(
      <MemoryRouter initialEntries={['/companies/comp-1']}>
        <Routes>
          <Route
            path="/companies/:id"
            element={
              <ToastProvider>
                <CompanyPage />
              </ToastProvider>
            }
          />
        </Routes>
      </MemoryRouter>
    )

    // Wait for fetch to be called with limit=50
    await vi.waitFor(() => {
      const taskFetchCall = fetchMock.mock.calls.find(
        (call) => typeof call[0] === 'string' && call[0].includes('/tasks')
      )
      expect(taskFetchCall).toBeDefined()
      expect(taskFetchCall![0]).toContain('limit=50')
    })
  })
})

// ─── FE-006 ──────────────────────────────────────────────────────────────────

function renderWarRoom(companyId = 'comp-1') {
  return render(
    <MemoryRouter initialEntries={[`/companies/${companyId}/warroom`]}>
      <Routes>
        <Route path="/companies/:id/warroom" element={<WarRoomPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('FE-006: WarRoomPage mobile drawer', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    useWarRoomStore.getState().reset()
    // SIRI-UX-222: loadMockData is now gated by VITE_MOCK_WAR_ROOM flag.
    // Enable it for these tests that need mock agents to be present.
    vi.stubEnv('VITE_MOCK_WAR_ROOM', 'true')
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
    // Reset innerWidth to desktop default
    Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true, configurable: true })
  })

  function setMobileWidth() {
    Object.defineProperty(window, 'innerWidth', { value: 375, writable: true, configurable: true })
    act(() => { window.dispatchEvent(new Event('resize')) })
  }

  it('shows mobile-agents-toggle button on mobile (<640px)', () => {
    setMobileWidth()
    renderWarRoom()
    act(() => { vi.advanceTimersByTime(100) })
    expect(screen.getByTestId('mobile-agents-toggle')).toBeInTheDocument()
  })

  it('mobile toggle button has aria-expanded attribute', () => {
    setMobileWidth()
    renderWarRoom()
    act(() => { vi.advanceTimersByTime(100) })
    const toggle = screen.getByTestId('mobile-agents-toggle')
    expect(toggle).toHaveAttribute('aria-expanded')
  })

  it('clicking toggle opens agent panel (aria-expanded becomes true)', () => {
    setMobileWidth()
    renderWarRoom()
    act(() => { vi.advanceTimersByTime(100) })
    const toggle = screen.getByTestId('mobile-agents-toggle')
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
  })

  it('on mobile, agent panel has position:absolute (drawer CSS mode)', () => {
    setMobileWidth()
    renderWarRoom()
    act(() => { vi.advanceTimersByTime(100) })
    const panel = screen.getByTestId('agent-panel')
    expect(panel.style.position).toBe('absolute')
  })

  it('on mobile, agent panel starts offscreen (left:-290px)', () => {
    setMobileWidth()
    renderWarRoom()
    act(() => { vi.advanceTimersByTime(100) })
    const panel = screen.getByTestId('agent-panel')
    // Panel should start offscreen
    expect(panel.style.left).toBe('-290px')
  })

  it('after toggle, agent panel slides to left:0 (visible)', () => {
    setMobileWidth()
    renderWarRoom()
    act(() => { vi.advanceTimersByTime(100) })
    const toggle = screen.getByTestId('mobile-agents-toggle')
    fireEvent.click(toggle)
    const panel = screen.getByTestId('agent-panel')
    expect(panel.style.left).toBe('0px')
  })

  it('activity-feed takes full width on mobile (flex:1)', () => {
    setMobileWidth()
    renderWarRoom()
    act(() => { vi.advanceTimersByTime(100) })
    const feed = screen.getByTestId('activity-feed')
    // flex: 1 renders as "1 1 0%" in jsdom — check that flex-grow is 1
    expect(feed.style.flexGrow).toBe('1')
  })
})
