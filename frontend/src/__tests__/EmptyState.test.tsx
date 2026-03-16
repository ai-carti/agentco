import { render, screen, waitFor, fireEvent } from '@testing-library/react'
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
  onmessage: ((e: { data: string }) => void) | null = null
  onclose: (() => void) | null = null
  close = vi.fn()
  constructor() { MockWS.instances.push(this) }
}

beforeEach(() => {
  MockWS.instances = []
  vi.stubGlobal('WebSocket', MockWS)
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
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {}))
    render(<MemoryRouter><ToastProvider><CompaniesPage /></ToastProvider></MemoryRouter>)
    // Should show loading or nothing yet (not the empty state)
    expect(screen.queryByText('No companies yet')).not.toBeInTheDocument()
  })

  it('shows empty state when API returns empty array', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => [] })
    render(<MemoryRouter><ToastProvider><CompaniesPage /></ToastProvider></MemoryRouter>)
    await waitFor(() => {
      expect(screen.getByText('No companies yet')).toBeInTheDocument()
    })
    expect(screen.getByText('🏢')).toBeInTheDocument()
    // Both header button and EmptyState CTA exist
    expect(screen.getAllByRole('button', { name: /new company/i }).length).toBeGreaterThanOrEqual(1)
  })

  it('shows company list when data loaded', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ id: '1', name: 'Acme Corp' }],
    })
    render(<MemoryRouter><ToastProvider><CompaniesPage /></ToastProvider></MemoryRouter>)
    await waitFor(() => {
      expect(screen.getByText('Acme Corp')).toBeInTheDocument()
    })
    expect(screen.queryByText('No companies yet')).not.toBeInTheDocument()
  })
})

// --- KanbanBoard empty state ---
describe('KanbanBoard empty state', () => {
  it('shows empty state when no tasks loaded', () => {
    useAgentStore.setState({ tasks: [] })
    render(<ToastProvider><KanbanBoard companyId="c1" isLoaded={true} /></ToastProvider>)
    expect(screen.getByText('No tasks yet')).toBeInTheDocument()
    expect(screen.getByText('📋')).toBeInTheDocument()
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
  it('shows styled empty state when no runs', () => {
    render(<WarRoom />)
    expect(screen.getByText('💤')).toBeInTheDocument()
    expect(screen.getByText('All quiet here')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /run a task/i })).toBeInTheDocument()
  })
})

// --- CompanyPage agents empty state (BUG-020) ---
describe('CompanyPage agents empty state', () => {
  it('shows agents empty state when no agents loaded', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
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
    await waitFor(() => {
      expect(screen.getByText('Your AI team is waiting')).toBeInTheDocument()
    })
    expect(screen.getByText('🤖')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /add agent/i })).toBeInTheDocument()
  })

  it('does NOT show agents empty state when agents exist', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
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
      expect(screen.getByText('CEO Agent')).toBeInTheDocument()
    })
    expect(screen.queryByText('Your AI team is waiting')).not.toBeInTheDocument()
  })
})

// --- AgentPage history empty state ---
describe('AgentPage history empty state', () => {
  it('shows history empty state', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => [] })
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
    expect(screen.getByText('📜')).toBeInTheDocument()
  })
})
