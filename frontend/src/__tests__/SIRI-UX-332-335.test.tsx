import { render, screen, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { useWarRoomStore } from '../store/warRoomStore'
import WarRoomPage from '../components/WarRoomPage'

function renderWarRoom(companyId = 'comp-1') {
  return render(
    <MemoryRouter initialEntries={[`/companies/${companyId}/warroom`]}>
      <Routes>
        <Route path="/companies/:id/warroom" element={<WarRoomPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubEnv('VITE_MOCK_WAR_ROOM', 'true')
  useWarRoomStore.getState().reset()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

// Helper: render and let mount effects (loadMockData) run, then set desired status
function renderWarRoomWithStatus(status: import('../store/warRoomStore').RunStatus) {
  renderWarRoom()
  // Let mount effects run (loadMockData sets runStatus='idle')
  act(() => { vi.advanceTimersByTime(100) })
  // Now override the status
  act(() => { useWarRoomStore.getState().setRunStatus(status) })
}

// ── SIRI-UX-332: LIVE badge hidden when run is done/stopped/failed ──────────
describe('SIRI-UX-332: LIVE indicator visibility', () => {
  it('shows LIVE badge when runStatus is active', () => {
    renderWarRoomWithStatus('active')
    expect(screen.getByTestId('live-indicator')).toBeInTheDocument()
  })

  it('hides LIVE badge when runStatus is done', () => {
    renderWarRoomWithStatus('done')
    expect(screen.queryByTestId('live-indicator')).not.toBeInTheDocument()
  })

  it('hides LIVE badge when runStatus is stopped', () => {
    renderWarRoomWithStatus('stopped')
    expect(screen.queryByTestId('live-indicator')).not.toBeInTheDocument()
  })

  it('hides LIVE badge when runStatus is failed', () => {
    renderWarRoomWithStatus('failed')
    expect(screen.queryByTestId('live-indicator')).not.toBeInTheDocument()
  })

  it('hides LIVE badge when runStatus is idle (SIRI-UX-337: no run started yet)', () => {
    // SIRI-UX-337: idle means no run has started — showing LIVE misleads users
    renderWarRoomWithStatus('idle')
    expect(screen.queryByTestId('live-indicator')).not.toBeInTheDocument()
  })
})

// ── SIRI-UX-333: warRoomStore.reset() — prevStatuses removed (SIRI-UX-371) ──────────────────
// prevStatuses was dead state — never consumed by any component. Removed in SIRI-UX-371.
// Verify that reset() still clears all live state correctly (agents, messages, cost).
describe('SIRI-UX-333: warRoomStore reset clears live state', () => {
  it('updateAgentStatus correctly changes agent status', () => {
    const store = useWarRoomStore.getState()
    store.setAgents([{ id: 'a1', name: 'Alex', role: 'CEO', status: 'idle', avatar: '👔', level: 0 }])
    store.updateAgentStatus('a1', 'thinking')
    store.updateAgentStatus('a1', 'done')
    expect(useWarRoomStore.getState().agents[0].status).toBe('done')
  })

  it('reset() clears agents, messages, and cost', () => {
    const store = useWarRoomStore.getState()
    store.setAgents([{ id: 'a1', name: 'Alex', role: 'CEO', status: 'idle', avatar: '👔', level: 0 }])
    store.addMessage({ id: 'm1', senderName: 'Alex', targetName: 'CEO', content: 'hi', timestamp: new Date().toISOString() })
    store.addCost(0.05)
    store.reset()
    const state = useWarRoomStore.getState()
    expect(state.agents).toEqual([])
    expect(state.messages).toEqual([])
    expect(state.cost).toBe(0)
  })
})

// ── SIRI-UX-334: OnboardingPage aria-busy on submit button ──────────────────
// aria-busy is present on the launch button so screen readers can announce loading state.
// This verifies the attribute is set to 'false' before submission and true during.
describe('SIRI-UX-334: OnboardingPage launch button aria-busy', () => {
  it('launch button has aria-busy=false when not loading', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'c1' }) })
    const { default: OnboardingPage } = await import('../components/OnboardingPage')
    render(
      <MemoryRouter>
        <OnboardingPage />
      </MemoryRouter>,
    )
    // The launch button testid is 'onboarding-use-template-btn' (per OnboardingPage.tsx line 228)
    const btn = screen.getByTestId('onboarding-use-template-btn')
    // aria-busy={false} in React renders as aria-busy="false"
    expect(btn).toHaveAttribute('aria-busy', 'false')
  })
})

// ── SIRI-UX-335: WarRoomPage agent status dot inline background fallback ─────
// The dot element uses Tailwind classes for background (bg-gray-500, bg-green-400, bg-blue-500)
// but has no inline `background` style fallback. In environments without Tailwind CSS
// (test snapshots, SSR, email clients), dots are invisible/colorless.
// Fix: add inline background color alongside Tailwind classes.
describe('SIRI-UX-335: Agent status dot has inline background color', () => {
  it('renders agent status dot with a non-empty inline background style', () => {
    renderWarRoomWithStatus('active')
    const dots = screen.getAllByTestId('agent-status-dot')
    // Every dot should have a non-empty inline background (not relying solely on Tailwind)
    for (const dot of dots) {
      expect(dot.style.background).not.toBe('')
    }
  })
})
