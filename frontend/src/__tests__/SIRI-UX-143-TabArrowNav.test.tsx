import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import CompanyPage from '../components/CompanyPage'

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

beforeEach(() => {
  vi.clearAllMocks()
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ id: '1', name: 'Test Co' }),
  })
})

function renderCompanyPage() {
  return render(
    <MemoryRouter initialEntries={['/companies/1']}>
      <Routes>
        <Route path="/companies/:id" element={<CompanyPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('SIRI-UX-143: tablist Arrow key navigation', () => {
  it('ArrowRight moves focus from War Room to Board tab', async () => {
    renderCompanyPage()
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'War Room' })).toBeInTheDocument()
    })

    const warRoomTab = screen.getByRole('tab', { name: 'War Room' })
    warRoomTab.focus()
    fireEvent.keyDown(warRoomTab, { key: 'ArrowRight' })

    expect(screen.getByRole('tab', { name: 'Board' })).toHaveFocus()
    expect(screen.getByRole('tab', { name: 'Board' })).toHaveAttribute('aria-selected', 'true')
  })

  it('ArrowRight wraps around from last tab (Agents) to first (War Room)', async () => {
    renderCompanyPage()
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Agents' })).toBeInTheDocument()
    })

    const agentsTab = screen.getByRole('tab', { name: 'Agents' })
    agentsTab.focus()
    fireEvent.keyDown(agentsTab, { key: 'ArrowRight' })

    expect(screen.getByRole('tab', { name: 'War Room' })).toHaveFocus()
    expect(screen.getByRole('tab', { name: 'War Room' })).toHaveAttribute('aria-selected', 'true')
  })

  it('ArrowLeft moves focus from Board to War Room tab', async () => {
    renderCompanyPage()
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Board' })).toBeInTheDocument()
    })

    // First click Board to make it active
    fireEvent.click(screen.getByRole('tab', { name: 'Board' }))
    const boardTab = screen.getByRole('tab', { name: 'Board' })
    boardTab.focus()
    fireEvent.keyDown(boardTab, { key: 'ArrowLeft' })

    expect(screen.getByRole('tab', { name: 'War Room' })).toHaveFocus()
    expect(screen.getByRole('tab', { name: 'War Room' })).toHaveAttribute('aria-selected', 'true')
  })

  it('ArrowLeft wraps around from first tab (War Room) to last (Agents)', async () => {
    renderCompanyPage()
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'War Room' })).toBeInTheDocument()
    })

    const warRoomTab = screen.getByRole('tab', { name: 'War Room' })
    warRoomTab.focus()
    fireEvent.keyDown(warRoomTab, { key: 'ArrowLeft' })

    expect(screen.getByRole('tab', { name: 'Agents' })).toHaveFocus()
    expect(screen.getByRole('tab', { name: 'Agents' })).toHaveAttribute('aria-selected', 'true')
  })

  it('tab buttons have tabIndex=-1 except the active one (roving tabindex pattern)', async () => {
    renderCompanyPage()
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'War Room' })).toBeInTheDocument()
    })

    const warRoomTab = screen.getByRole('tab', { name: 'War Room' })
    const boardTab = screen.getByRole('tab', { name: 'Board' })
    const agentsTab = screen.getByRole('tab', { name: 'Agents' })

    // Active tab should have tabIndex=0, others -1
    expect(warRoomTab).toHaveAttribute('tabindex', '0')
    expect(boardTab).toHaveAttribute('tabindex', '-1')
    expect(agentsTab).toHaveAttribute('tabindex', '-1')
  })
})
