/**
 * SIRI-UX-016: WarRoomPage auto-scroll anchor rendered
 * SIRI-UX-017: WarRoomPage mobile agent panel toggle button
 * SIRI-UX-018: CompanyPage tab hover handlers
 * SIRI-UX-019: LibraryPage Fork/Portfolio hover handlers
 * SIRI-UX-020: AuthPage input focus rings
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { useAgentStore, type AgentStore } from '../store/agentStore'

// ─── Mock stores & context ───────────────────────────────────────────────────
vi.mock('../store/warRoomStore', () => ({
  useWarRoomStore: vi.fn((sel: (s: AgentStore) => unknown) => {
    const state = {
      agents: [{ id: 'a1', name: 'CEO', role: 'Chief Executive Officer', avatar: '🤖', level: 0, status: 'thinking' as const }],
      messages: [
        { id: 'm1', senderName: 'CEO', targetName: 'CPO', content: 'Hello', timestamp: new Date().toISOString() },
      ],
      cost: 0.0012,
      flashingAgents: new Set<string>(),
      loadMockData: vi.fn(),
      addMessage: vi.fn(),
      updateAgentStatus: vi.fn(),
      addCost: vi.fn(),
      clearFlash: vi.fn(),
    }
    return sel(state as unknown as AgentStore)
  }),
  getNextMockEvent: vi.fn(() => ({
    message: { id: 'm2', senderName: 'CEO', targetName: 'CPO', content: 'Update', timestamp: new Date().toISOString() },
    statusUpdate: null,
  })),
}))

vi.mock('../hooks/useWarRoomSocket', () => ({
  useWarRoomSocket: () => ({ isConnected: false }),
}))

vi.mock('../context/ToastContext', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}))

vi.mock('../api/client', () => ({
  getStoredToken: () => 'mock-token',
}))

vi.mock('../store/agentStore', () => ({
  useAgentStore: vi.fn((sel: (s: AgentStore) => unknown) => {
    const state = {
      agents: [],
      currentCompany: { id: 'co1', name: 'Test Corp' },
      tasks: [],
      setCurrentCompany: vi.fn(),
      setTasks: vi.fn(),
      setAgents: vi.fn(),
      setActiveCompanyTab: vi.fn(),
      activeCompanyTab: null,
    }
    return sel(state as unknown as AgentStore)
  }),
}))

vi.mock('../store/authStore', () => ({
  useAuthStore: vi.fn((sel?: (s: unknown) => unknown) => {
    const state = { user: { email: 'test@test.com' }, login: vi.fn(), register: vi.fn(), isLoading: false, error: null, token: 'tok' }
    return sel ? sel(state) : state
  }),
}))

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('SIRI-UX-016: WarRoomPage auto-scroll anchor', () => {
  it('renders feed-end scroll anchor div', async () => {
    const { default: WarRoomPage } = await import('../components/WarRoomPage')
    const { container } = render(
      <MemoryRouter initialEntries={['/companies/co1']}>
        <WarRoomPage />
      </MemoryRouter>
    )
    // The scroll anchor is the last child of the feed container
    const feed = container.querySelector('[data-testid="activity-feed"]')
    expect(feed).not.toBeNull()
    // feedEndRef div is rendered inside the feed scroll area
    const feedScrollArea = feed!.querySelector('div > div:last-child')
    expect(feedScrollArea).not.toBeNull()
  })
})

describe('SIRI-UX-018: CompanyPage tab hover states', () => {
  beforeEach(() => {
    // Reset mock to have agents loaded
    vi.mocked(useAgentStore).mockImplementation((sel: (s: AgentStore) => unknown) => {
      const state = {
        agents: [],
        currentCompany: { id: 'co1', name: 'Test Corp' },
        tasks: [],
        setCurrentCompany: vi.fn(),
        setTasks: vi.fn(),
        setAgents: vi.fn(),
        setActiveCompanyTab: vi.fn(),
        activeCompanyTab: 'war-room',
      }
      return sel(state as unknown as AgentStore)
    })
  })

  it('tab buttons have onMouseEnter handler', async () => {
    const { default: CompanyPage } = await import('../components/CompanyPage')
    const { container } = render(
      <MemoryRouter initialEntries={['/companies/co1']}>
        <CompanyPage />
      </MemoryRouter>
    )
    const tablist = container.querySelector('[role="tablist"]')
    expect(tablist).not.toBeNull()
    const tabs = tablist!.querySelectorAll('[role="tab"]')
    expect(tabs.length).toBe(3)
    // Fire hover on inactive tab — should not throw
    fireEvent.mouseEnter(tabs[1])
    fireEvent.mouseLeave(tabs[1])
  })
})

describe('SIRI-UX-019: LibraryPage Fork/Portfolio hover states', () => {
  it('Fork button has hover transitions', async () => {
    // Mock fetch for library agents
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ id: 'la1', name: 'Sales Bot', role: 'SDR', avatar: '🤖' }],
    })
    const { default: LibraryPage } = await import('../components/LibraryPage')
    const { findByTestId } = render(
      <MemoryRouter>
        <LibraryPage />
      </MemoryRouter>
    )
    const forkBtn = await findByTestId('fork-btn-la1')
    expect(forkBtn).toBeInTheDocument()
    // Has transition style
    expect(forkBtn.style.transition).toContain('background')
    // Hover doesn't throw
    fireEvent.mouseEnter(forkBtn)
    expect(forkBtn.style.background).toBe('rgb(29, 78, 216)')
    fireEvent.mouseLeave(forkBtn)
    expect(forkBtn.style.background).toBe('rgb(37, 99, 235)')
  })
})

describe('SIRI-UX-020: AuthPage input focus rings', () => {
  it('email input shows focus border on focus', async () => {
    const { default: AuthPage } = await import('../components/AuthPage')
    render(
      <MemoryRouter>
        <AuthPage />
      </MemoryRouter>
    )
    const emailInput = screen.getByLabelText('Email address') as HTMLInputElement
    fireEvent.focus(emailInput)
    expect(emailInput.style.borderColor).toBe('rgb(108, 71, 255)')
    fireEvent.blur(emailInput)
    expect(emailInput.style.borderColor).toBe('rgb(30, 30, 46)')
  })

  it('password input shows focus border on focus', async () => {
    const { default: AuthPage } = await import('../components/AuthPage')
    render(
      <MemoryRouter>
        <AuthPage />
      </MemoryRouter>
    )
    const passwordInput = screen.getByLabelText('Password') as HTMLInputElement
    fireEvent.focus(passwordInput)
    expect(passwordInput.style.borderColor).toBe('rgb(108, 71, 255)')
    fireEvent.blur(passwordInput)
    expect(passwordInput.style.borderColor).toBe('rgb(30, 30, 46)')
  })
})
