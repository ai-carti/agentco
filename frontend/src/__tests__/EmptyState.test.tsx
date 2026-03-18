import { render, screen, waitFor, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import EmptyState from '../components/EmptyState'
import CompaniesPage from '../components/CompaniesPage'
import CompanyPage from '../components/CompanyPage'
import WarRoom from '../components/WarRoom'
import KanbanBoard from '../components/KanbanBoard'
import AgentPage from '../components/AgentPage'
import { useAgentStore } from '../store/agentStore'
import { useAuthStore } from '../store/authStore'
import { ToastProvider } from '../context/ToastContext'

// mock WebSocket for WarRoom
class MockWS {
  static instances: MockWS[] = []
  onopen: (() => void) | null = null
  onmessage: ((e: { data: string }) => void) | null = null
  onclose: (() => void) | null = null
  close = vi.fn()
  constructor() { MockWS.instances.push(this) }
}

beforeEach(() => {
  MockWS.instances = []
  vi.stubGlobal('WebSocket', MockWS)
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }))
  useAuthStore.setState({ token: 'tok' })
  useAgentStore.setState({ currentCompany: { id: 'c1', name: 'TestCo' }, agents: [], tasks: [] })
  vi.clearAllMocks()
})

// --- EmptyState component ---
describe('EmptyState component', () => {
  it('renders emoji, title, subtitle', () => {
    render(
      <EmptyState
        emoji="🏢"
        title="No companies yet"
        subtitle="Create your first workspace"
      />
    )
    expect(screen.getByText('🏢')).toBeInTheDocument()
    expect(screen.getByText('No companies yet')).toBeInTheDocument()
    expect(screen.getByText('Create your first workspace')).toBeInTheDocument()
  })

  it('renders CTA button when provided', () => {
    const onCTA = vi.fn()
    render(
      <EmptyState
        emoji="🤖"
        title="Your AI team is waiting"
        subtitle="Add agents"
        ctaLabel="+ Add Agent"
        onCTA={onCTA}
      />
    )
    const btn = screen.getByRole('button', { name: '+ Add Agent' })
    expect(btn).toBeInTheDocument()
    fireEvent.click(btn)
    expect(onCTA).toHaveBeenCalledOnce()
  })

  it('does not render CTA when not provided', () => {
    render(
      <EmptyState emoji="📜" title="No history yet" subtitle="Nothing here" />
    )
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})

// --- CompaniesPage empty state ---
describe('CompaniesPage empty state', () => {
  it('shows loading indicator initially', () => {
    globalThis.fetch = vi.fn().mockReturnValue(new Promise(() => {}))
    render(<MemoryRouter><ToastProvider><CompaniesPage /></ToastProvider></MemoryRouter>)
    // Should show loading or nothing yet (not the onboarding page)
    expect(screen.queryByTestId('onboarding-page')).not.toBeInTheDocument()
  })

  it('shows onboarding when API returns empty array (M3-003)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => [] })
    render(<MemoryRouter><ToastProvider><CompaniesPage /></ToastProvider></MemoryRouter>)
    await waitFor(() => {
      expect(screen.getByTestId('onboarding-page')).toBeInTheDocument()
    })
    expect(screen.getByText(/Welcome to AgentCo/i)).toBeInTheDocument()
  })

  it('shows company list when data loaded', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ id: '1', name: 'Acme Corp' }],
    })
    render(<MemoryRouter><ToastProvider><CompaniesPage /></ToastProvider></MemoryRouter>)
    await waitFor(() => {
      expect(screen.getByText('Acme Corp')).toBeInTheDocument()
    })
    expect(screen.queryByTestId('onboarding-page')).not.toBeInTheDocument()
  })
})

// --- KanbanBoard empty state ---
describe('KanbanBoard empty state', () => {
  it('shows empty state when no tasks loaded', () => {
    useAgentStore.setState({ tasks: [] })
    render(<ToastProvider><KanbanBoard companyId="c1" isLoaded={true} /></ToastProvider>)
    expect(screen.getByText('No tasks yet')).toBeInTheDocument()
    // UX-POLISH-002: emoji replaced with SVG icon
    expect(screen.getByTestId('empty-state-icon')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /new task/i })).toBeInTheDocument()
  })

  it('does NOT show empty state while loading', () => {
    useAgentStore.setState({ tasks: [] })
    render(<ToastProvider><KanbanBoard companyId="c1" isLoaded={false} /></ToastProvider>)
    expect(screen.queryByText('No tasks yet')).not.toBeInTheDocument()
  })

  it('does NOT show empty state when tasks exist', () => {
    useAgentStore.setState({
      tasks: [{ id: 't1', title: 'My task', status: 'todo' }],
    })
    render(<ToastProvider><KanbanBoard companyId="c1" isLoaded={true} /></ToastProvider>)
    expect(screen.queryByText('No tasks yet')).not.toBeInTheDocument()
  })
})

// --- WarRoom empty state ---
describe('WarRoom empty state', () => {
  it('shows styled empty state when no runs after WS connected', () => {
    render(<MemoryRouter><WarRoom /></MemoryRouter>)
    // BUG-043: empty state shown only after WS connection is established
    act(() => {
      MockWS.instances[MockWS.instances.length - 1]?.onopen?.()
    })
    // UX-POLISH-002: emoji replaced with SVG icon
    expect(screen.getByTestId('empty-state-icon')).toBeInTheDocument()
    expect(screen.getByText('All quiet here')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /run a task/i })).toBeInTheDocument()
  })
})

// --- CompanyPage agents empty state (BUG-020, updated for UX-POLISH-003 tab layout) ---
describe('CompanyPage agents empty state', () => {
  it('shows tab navigation (War Room + Board) on company page', async () => {
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/agents')) return Promise.resolve({ ok: true, json: async () => [] })
      if (url.includes('/tasks')) return Promise.resolve({ ok: true, json: async () => [] })
      if (url.includes('/companies/')) return Promise.resolve({ ok: true, json: async () => ({ id: 'c1', name: 'TestCo' }) })
      return Promise.resolve({ ok: true, json: async () => [] })
    })
    render(
      <MemoryRouter initialEntries={['/companies/c1']}>
        <Routes>
          <Route path="/companies/:id" element={<ToastProvider><CompanyPage /></ToastProvider>} />
        </Routes>
      </MemoryRouter>
    )
    // UX-POLISH-003: company page now uses tabs instead of stacked layout
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /war room/i })).toBeInTheDocument()
    })
    expect(screen.getByRole('tab', { name: /board/i })).toBeInTheDocument()
    expect(screen.getByRole('tablist')).toBeInTheDocument()
  })

  it('does NOT show duplicate agents section below War Room', async () => {
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/agents')) return Promise.resolve({ ok: true, json: async () => [{ id: 'a1', name: 'CEO Agent', status: 'idle' }] })
      if (url.includes('/tasks')) return Promise.resolve({ ok: true, json: async () => [] })
      if (url.includes('/companies/')) return Promise.resolve({ ok: true, json: async () => ({ id: 'c1', name: 'TestCo' }) })
      return Promise.resolve({ ok: true, json: async () => [] })
    })
    render(
      <MemoryRouter initialEntries={['/companies/c1']}>
        <Routes>
          <Route path="/companies/:id" element={<ToastProvider><CompanyPage /></ToastProvider>} />
        </Routes>
      </MemoryRouter>
    )
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /war room/i })).toBeInTheDocument()
    })
    // "Agents (N)" heading appears exactly once (inside War Room sidebar), not duplicated below
    const agentsSections = screen.queryAllByText(/^Agents \(\d+\)$/)
    expect(agentsSections.length).toBeLessThanOrEqual(1)
  })
})

// --- AgentPage history empty state ---
describe('AgentPage history empty state', () => {
  it('shows history empty state', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => [] })
    render(
      <MemoryRouter initialEntries={['/companies/c1/agents/a1']}>
        <Routes>
          <Route path="/companies/:id/agents/:agentId" element={
            <ToastProvider><AgentPage /></ToastProvider>
          } />
        </Routes>
      </MemoryRouter>
    )
    // Expect history empty state to be present on the page
    await waitFor(() => {
      expect(screen.getByText(/no completed tasks yet/i)).toBeInTheDocument()
    })
    // UX-POLISH-002: emoji replaced with SVG icon
    expect(screen.getAllByTestId('empty-state-icon').length).toBeGreaterThanOrEqual(1)
  })
})
