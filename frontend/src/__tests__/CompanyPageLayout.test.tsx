import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
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

// SIRI-UX-127: mock ToastContext to capture toast.error calls
const mockToastError = vi.fn()
vi.mock('../context/ToastContext', () => ({
  useToast: () => ({
    success: vi.fn(),
    error: mockToastError,
    info: vi.fn(),
  }),
  ToastProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

// Mock fetch — default: success with empty data
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
    mockToastError.mockClear()
    // Restore default fetch mock
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => [],
    })
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

// ──────────────────────────────────────────────────────────────────────────────
// SIRI-UX-127: CompanyPage calls toast.error on fetch failures (not silent fail)
// ──────────────────────────────────────────────────────────────────────────────
describe('SIRI-UX-127: CompanyPage calls toast.error on fetch failure', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockToastError.mockClear()
  })

  it('calls toast.error when fetches fail with network error', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

    renderCompanyPage()

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalled()
    })

    expect(mockToastError.mock.calls[0][0]).toMatch(/failed|error/i)
  })

  it('calls toast.error when fetch returns non-ok response (401)', async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValue({ ok: false, status: 401, json: async () => ({}) } as Response)

    renderCompanyPage()

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalled()
    })

    expect(mockToastError.mock.calls[0][0]).toMatch(/failed|error/i)
  })
})
