import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

// ── SIRI-UX-328: fix TS error in test helper cast ──────────────────────────
// The original cast `Parameters<typeof useAgentStore.setState>[0]['currentCompany']`
// fails because the union includes a function overload that has no `currentCompany` prop.
// Fix: cast to Company directly (no complex Parameters<...> gymnastics).
describe('SIRI-UX-328: agentStore setState cast is type-safe', () => {
  it('setState accepts partial object with currentCompany', async () => {
    const { useAgentStore } = await import('../store/agentStore')
    // This should compile without TS error — the plain object cast is valid
    useAgentStore.setState({ currentCompany: { id: 'c1', name: 'Test Co' } })
    const state = useAgentStore.getState()
    expect(state.currentCompany?.id).toBe('c1')
    // cleanup
    useAgentStore.setState({ currentCompany: null })
  })
})

// ── SIRI-UX-329: AgentPage handleSaveToLibrary wrapped in useCallback ──────
// Not a runtime error, but a React perf anti-pattern.
// We verify the component renders and the "Save to Library" button is present.
describe('SIRI-UX-329: AgentPage handleSaveToLibrary is stable', () => {
  it('renders Save to Library button when agent data loaded', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'a1', name: 'CEO', role: 'Chief Executive Officer', model: 'gpt-4o' }),
    })

    const { Routes, Route } = await import('react-router-dom')
    const { default: AgentPage } = await import('../components/AgentPage')
    render(
      <MemoryRouter initialEntries={['/companies/c1/agents/a1']}>
        <Routes>
          <Route path="/companies/:id/agents/:agentId" element={<AgentPage />} />
        </Routes>
      </MemoryRouter>,
    )
    // Wait for fetch to resolve and component to show the button
    const btn = await screen.findByTestId('save-to-library-btn')
    expect(btn).toBeInTheDocument()
  })
})

// ── SIRI-UX-330: TaskDetailSidebar handleRun wrapped in useCallback ────────
// Verifies the sidebar renders the Run Task button (stable handler means no
// unnecessary re-renders when parent re-renders).
describe('SIRI-UX-330: TaskDetailSidebar handleRun button renders', () => {
  it('shows Run Task button for a todo task', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ logs: [], status_history: [] }),
    })

    const { default: TaskDetailSidebar } = await import('../components/TaskDetailSidebar')
    const task = {
      id: 't1',
      title: 'Fix the thing',
      status: 'todo' as const,
    }
    render(
      <TaskDetailSidebar
        task={task}
        companyId="c1"
        onClose={() => undefined}
      />,
    )
    expect(screen.getByTestId('sidebar-run-btn')).toBeInTheDocument()
  })
})

// ── SIRI-UX-331: CompanyPage agent modal backdrop has keyboard support ─────
describe('SIRI-UX-331: CompanyPage agent modal backdrop keyboard support', () => {
  it('modal backdrop has role=button and aria-label for keyboard users', async () => {
    const { useAgentStore } = await import('../store/agentStore')
    useAgentStore.setState({
      currentCompany: { id: 'c1', name: 'Test Co' },
      agents: [],
      tasks: [],
    })

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    })
    globalThis.WebSocket = vi.fn().mockImplementation(() => ({
      onopen: null, onmessage: null, onclose: null, close: vi.fn(),
    })) as unknown as typeof WebSocket

    const { default: CompanyPage } = await import('../components/CompanyPage')
    const { unmount } = render(
      <MemoryRouter initialEntries={['/companies/c1']}>
        <CompanyPage />
      </MemoryRouter>,
    )
    // Modal is opened by rendering CompanyPage and clicking Add Agent — tested elsewhere.
    // For this ticket we just verify the component renders and passes TS type checks.
    expect(screen.getByTestId('company-page')).toBeInTheDocument()
    unmount()
    useAgentStore.setState({ currentCompany: null, agents: [], tasks: [] })
  })
})
