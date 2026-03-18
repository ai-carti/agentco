import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import CompanyPage from '../components/CompanyPage'

// Mock child components
vi.mock('../components/WarRoomPage', () => ({
  default: () => <div data-testid="war-room-page">War Room Content</div>,
}))

vi.mock('../components/KanbanBoard', () => ({
  default: () => <div data-testid="kanban-board">Kanban Content</div>,
}))

vi.mock('../components/AgentCard', () => ({
  default: ({ agent }: { agent: { id: string; name: string } }) => (
    <div data-testid={`agent-card-${agent.id}`}>{agent.name}</div>
  ),
}))

vi.mock('../components/AgentForm', () => ({
  default: ({ onSubmit }: { onSubmit: (d: unknown) => void }) => (
    <form data-testid="agent-form" onSubmit={(e) => { e.preventDefault(); onSubmit({}) }}>
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

vi.mock('../store/agentStore', () => ({
  useAgentStore: vi.fn((selector: (s: unknown) => unknown) => {
    const store = {
      agents: [],
      currentCompany: { id: '1', name: 'Test Co' },
      setCurrentCompany: vi.fn(),
      setTasks: vi.fn(),
      setAgents: vi.fn(),
      setActiveCompanyTab: vi.fn(),
    }
    return selector(store)
  }),
}))

vi.mock('../api/client', () => ({
  getStoredToken: vi.fn(() => null),
}))

// Mock fetch
globalThis.fetch = vi.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve([]),
  }) as unknown as ReturnType<typeof fetch>
)

function renderCompanyPage() {
  return render(
    <MemoryRouter initialEntries={['/companies/1']}>
      <Routes>
        <Route path="/companies/:id" element={<CompanyPage />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('CompanyPage Layout (UX-POLISH-003)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders tab navigation with War Room and Board tabs', () => {
    renderCompanyPage()
    expect(screen.getByRole('tab', { name: /war room/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /board/i })).toBeInTheDocument()
  })

  it('shows War Room tab as active by default', () => {
    renderCompanyPage()
    const warRoomTab = screen.getByRole('tab', { name: /war room/i })
    expect(warRoomTab).toHaveAttribute('aria-selected', 'true')
  })

  it('shows WarRoomPage content when War Room tab is active', () => {
    renderCompanyPage()
    expect(screen.getByTestId('war-room-page')).toBeInTheDocument()
    expect(screen.queryByTestId('kanban-board')).not.toBeInTheDocument()
  })

  it('switches to Kanban board when Board tab is clicked', () => {
    renderCompanyPage()
    const boardTab = screen.getByRole('tab', { name: /board/i })
    fireEvent.click(boardTab)
    expect(screen.getByTestId('kanban-board')).toBeInTheDocument()
    expect(screen.queryByTestId('war-room-page')).not.toBeInTheDocument()
  })

  it('does not show duplicate standalone Agents section under War Room', () => {
    renderCompanyPage()
    // The "Agents (N)" heading should NOT appear as a standalone section below war room
    // (agents are shown inside WarRoomPage sidebar, not duplicated below)
    const agentsSections = screen.queryAllByText(/^Agents \(\d+\)$/)
    expect(agentsSections).toHaveLength(0)
  })

  it('Board tab contains kanban board', () => {
    renderCompanyPage()
    fireEvent.click(screen.getByRole('tab', { name: /board/i }))
    expect(screen.getByTestId('kanban-board')).toBeInTheDocument()
  })

  it('tab panel has correct aria attributes', () => {
    renderCompanyPage()
    expect(screen.getByRole('tablist')).toBeInTheDocument()
  })
})
