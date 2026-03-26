/**
 * SIRI-UX-376: WarRoomPage — companyId undefined shows error state, no WS connection
 * SIRI-UX-377: KanbanBoard Create Task button — aria-disabled attribute
 * SIRI-UX-381: CompanyPage — tab IDs namespaced per companyId
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ToastProvider } from '../context/ToastContext'
import { useWarRoomStore } from '../store/warRoomStore'
import { useAgentStore } from '../store/agentStore'

// ── SIRI-UX-376: WarRoomPage companyId guard ────────────────────────────────
describe('SIRI-UX-376: WarRoomPage — companyId undefined guard', () => {
  let wsInstances: unknown[]
  let MockWebSocket: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.useFakeTimers()
    wsInstances = []
    MockWebSocket = vi.fn().mockImplementation(() => {
      const inst = { onopen: null, onmessage: null, onerror: null, onclose: null, close: vi.fn() }
      wsInstances.push(inst)
      return inst
    })
    globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket
    useWarRoomStore.getState().reset()
    vi.stubEnv('VITE_MOCK_WAR_ROOM', 'false')
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('shows "Company not found" error state when companyId is missing from route', async () => {
    // Render WarRoomPage without a :id param — companyId will be undefined
    const WarRoomPage = (await import('../components/WarRoomPage')).default
    render(
      <MemoryRouter initialEntries={['/war-room']}>
        <Routes>
          {/* Route without :id param so useParams().id === undefined */}
          <Route path="/war-room" element={<WarRoomPage />} />
        </Routes>
      </MemoryRouter>
    )

    expect(screen.getByTestId('war-room-no-company')).toBeInTheDocument()
    expect(screen.getByText(/company not found/i)).toBeInTheDocument()
  })

  it('does NOT establish WebSocket connection when companyId is undefined', async () => {
    const WarRoomPage = (await import('../components/WarRoomPage')).default
    render(
      <MemoryRouter initialEntries={['/war-room']}>
        <Routes>
          <Route path="/war-room" element={<WarRoomPage />} />
        </Routes>
      </MemoryRouter>
    )

    expect(wsInstances.length).toBe(0)
  })

  it('renders normally when companyId is present', async () => {
    const WarRoomPage = (await import('../components/WarRoomPage')).default
    render(
      <MemoryRouter initialEntries={['/companies/comp-1/war-room']}>
        <Routes>
          <Route path="/companies/:id/war-room" element={<WarRoomPage />} />
        </Routes>
      </MemoryRouter>
    )

    // Should NOT show error state
    expect(screen.queryByTestId('war-room-no-company')).not.toBeInTheDocument()
  })
})

// ── SIRI-UX-377: KanbanBoard Create Task button aria-disabled ──────────────
describe('SIRI-UX-377: Create Task button — aria-disabled', () => {
  beforeEach(() => {
    useAgentStore.setState({ tasks: [], agents: [] })
    vi.clearAllMocks()
  })

  it('submit button has aria-disabled=true when title is empty', async () => {
    render(
      <ToastProvider>
        <MemoryRouter>
          <(await import('../components/KanbanBoard')).default companyId="c1" isLoaded={true} />
        </MemoryRouter>
      </ToastProvider>
    )

    // Open modal via New Task button (empty state renders EmptyState with CTA)
    const newBtn = screen.getByTestId('kanban-new-task-btn')
    fireEvent.click(newBtn)

    const submitBtn = await screen.findByTestId('create-task-submit-btn')
    // Title is empty — both disabled and aria-disabled should be true
    expect(submitBtn).toBeDisabled()
    expect(submitBtn).toHaveAttribute('aria-disabled', 'true')
  })

  it('submit button has aria-disabled=false when title is filled', async () => {
    render(
      <ToastProvider>
        <MemoryRouter>
          <(await import('../components/KanbanBoard')).default companyId="c1" isLoaded={true} />
        </MemoryRouter>
      </ToastProvider>
    )

    const newBtn = screen.getByTestId('kanban-new-task-btn')
    fireEvent.click(newBtn)

    const titleInput = await screen.findByTestId('create-task-title-input')
    fireEvent.change(titleInput, { target: { value: 'My new task' } })

    const submitBtn = screen.getByTestId('create-task-submit-btn')
    expect(submitBtn).toHaveAttribute('aria-disabled', 'false')
  })
})

// ── SIRI-UX-381: CompanyPage tab IDs namespaced per companyId ──────────────
vi.mock('../components/WarRoomPage', () => ({
  default: () => <div data-testid="war-room-page">War Room</div>,
}))
vi.mock('../components/KanbanBoard', () => ({
  default: () => <div data-testid="kanban-board">Board</div>,
}))
vi.mock('../components/AgentCard', () => ({
  default: ({ agent }: { agent: { id: string; name: string } }) => (
    <div data-testid={`agent-card-${agent.id}`}>{agent.name}</div>
  ),
}))
vi.mock('../components/AgentForm', () => ({
  default: ({ onSubmit }: { onSubmit: (d: unknown) => void }) => (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit({}) }}>
      <button type="submit">Submit</button>
    </form>
  ),
}))
vi.mock('../components/EmptyState', () => ({
  default: ({ ctaLabel, onCTA }: { ctaLabel?: string; onCTA?: () => void }) => (
    <div data-testid="empty-state">
      {ctaLabel && <button onClick={onCTA}>{ctaLabel}</button>}
    </div>
  ),
}))
vi.mock('../api/client', () => ({
  getStoredToken: vi.fn(() => null),
  BASE_URL: 'http://localhost:8000',
}))
vi.mock('../context/ToastContext', () => ({
  useToast: () => ({ error: vi.fn(), success: vi.fn(), info: vi.fn() }),
  ToastProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))
vi.mock('../store/agentStore', () => ({
  useAgentStore: vi.fn((selector: (s: unknown) => unknown) => {
    const store = {
      agents: [],
      tasks: [],
      currentCompany: { id: 'company-abc', name: 'Test Co' },
      setCurrentCompany: vi.fn(),
      setTasks: vi.fn(),
      setAgents: vi.fn(),
      setActiveCompanyTab: vi.fn(),
    }
    return selector(store)
  }),
}))

function renderCompanyPage(companyId = 'company-abc') {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ id: companyId, name: 'Test Co' }),
  })
  return render(
    <MemoryRouter initialEntries={[`/companies/${companyId}`]}>
      <Routes>
        <Route path="/companies/:id" element={<(await import('../components/CompanyPage')).default />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('SIRI-UX-381: CompanyPage — tab IDs contain companyId', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('tab button IDs include companyId', async () => {
    const CompanyPage = (await import('../components/CompanyPage')).default
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'company-abc', name: 'Test Co' }),
    })
    render(
      <MemoryRouter initialEntries={['/companies/company-abc']}>
        <Routes>
          <Route path="/companies/:id" element={<CompanyPage />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => {
      const tabs = screen.getAllByRole('tab')
      expect(tabs.length).toBeGreaterThan(0)
      // Each tab id should contain 'company-abc'
      for (const tab of tabs) {
        expect(tab.getAttribute('id')).toContain('company-abc')
      }
    })
  })

  it('tabpanel aria-labelledby matches tab id containing companyId', async () => {
    const CompanyPage = (await import('../components/CompanyPage')).default
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'company-abc', name: 'Test Co' }),
    })
    render(
      <MemoryRouter initialEntries={['/companies/company-abc']}>
        <Routes>
          <Route path="/companies/:id" element={<CompanyPage />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => {
      const tabpanels = screen.getAllByRole('tabpanel', { hidden: true })
      expect(tabpanels.length).toBeGreaterThan(0)
      for (const panel of tabpanels) {
        const labelledBy = panel.getAttribute('aria-labelledby')
        expect(labelledBy).toContain('company-abc')
      }
    })
  })
})
