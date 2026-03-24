/**
 * SIRI-UX-258: LibraryPage.tsx — Portfolio Link & Fork button use JS hover instead of CSS class
 * SIRI-UX-259: Navbar.tsx — Logout button uses JS hover instead of CSS class
 * SIRI-UX-260: OnboardingPage.tsx — Launch Demo button & Skip link use JS hover
 * SIRI-UX-261: AgentEditPage.tsx — Cancel button uses JS hover instead of CSS class
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// ─── mocks ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => [],
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ─── SIRI-UX-258 ─────────────────────────────────────────────────────────────

describe('SIRI-UX-258: LibraryPage uses CSS classes for hover', () => {
  it('Fork button has library-fork-btn CSS class', async () => {
    const { default: LibraryPage } = await import('../components/LibraryPage')
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        { id: 'a1', name: 'TestAgent', role: 'Dev', model: 'gpt-4o', system_prompt: '', status: 'idle', last_task_at: null, company_id: null },
      ],
    })
    render(
      <MemoryRouter>
        <LibraryPage />
      </MemoryRouter>,
    )
    // Wait for agents to load
    await vi.waitFor(() => {
      expect(screen.queryByTestId('fork-btn-a1')).not.toBeNull()
    })
    const forkBtn = screen.getByTestId('fork-btn-a1')
    expect(forkBtn.className).toContain('library-fork-btn')
  })

  it('Portfolio link has library-portfolio-link CSS class', async () => {
    const { default: LibraryPage } = await import('../components/LibraryPage')
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        { id: 'a1', name: 'TestAgent', role: 'Dev', model: 'gpt-4o', system_prompt: '', status: 'idle', last_task_at: null, company_id: null },
      ],
    })
    render(
      <MemoryRouter>
        <LibraryPage />
      </MemoryRouter>,
    )
    // portfolio link has testid portfolio-link-{id}
    await vi.waitFor(() => {
      expect(screen.queryByTestId('portfolio-link-a1')).not.toBeNull()
    })
    const link = screen.getByTestId('portfolio-link-a1')
    expect(link.className).toContain('library-portfolio-link')
  })
})

// ─── SIRI-UX-259 ─────────────────────────────────────────────────────────────

describe('SIRI-UX-259: Navbar Logout button uses CSS class for hover', () => {
  it('Logout button has navbar-logout-btn CSS class', async () => {
    const { default: Navbar } = await import('../components/Navbar')
    const { useAuthStore } = await import('../store/authStore')
    useAuthStore.setState({ user: { id: 'u1', email: 'a@b.com' }, token: 'tok' })

    render(
      <MemoryRouter>
        <Navbar />
      </MemoryRouter>,
    )

    const logoutBtn = screen.getByText('Logout')
    expect(logoutBtn.className).toContain('navbar-logout-btn')
  })
})

// ─── SIRI-UX-260 ─────────────────────────────────────────────────────────────

describe('SIRI-UX-260: OnboardingPage buttons use CSS classes for hover', () => {
  it('Launch Demo button has onboarding-launch-btn CSS class', async () => {
    const { default: OnboardingPage } = await import('../components/OnboardingPage')
    render(
      <MemoryRouter>
        <OnboardingPage />
      </MemoryRouter>,
    )

    // The submit/launch button (data-testid="onboarding-use-template-btn")
    const launchBtn = screen.getByTestId('onboarding-use-template-btn')
    expect(launchBtn.className).toContain('onboarding-launch-btn')
  })

  it('Skip link has onboarding-skip-btn CSS class', async () => {
    const { default: OnboardingPage } = await import('../components/OnboardingPage')
    render(
      <MemoryRouter>
        <OnboardingPage />
      </MemoryRouter>,
    )

    const skipBtn = screen.getByTestId('onboarding-skip-btn')
    expect(skipBtn.className).toContain('onboarding-skip-btn')
  })
})

// ─── SIRI-UX-261 ─────────────────────────────────────────────────────────────

describe('SIRI-UX-261: AgentEditPage Cancel button uses CSS class for hover', () => {
  it('Cancel button has agent-edit-cancel-btn CSS class', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'a1',
        name: 'TestAgent',
        role: 'Dev',
        model: 'gpt-4o',
        system_prompt: 'hello',
        status: 'idle',
        last_task_at: null,
        company_id: 'co-1',
      }),
    })
    const { default: AgentEditPage } = await import('../components/AgentEditPage')
    // AgentEditPage uses useParams({ id, agentId }) — wrap with Route
    const { Route, Routes } = await import('react-router-dom')
    render(
      <MemoryRouter initialEntries={['/companies/co-1/agents/a1/edit']}>
        <Routes>
          <Route path="/companies/:id/agents/:agentId/edit" element={<AgentEditPage />} />
        </Routes>
      </MemoryRouter>,
    )

    await vi.waitFor(() => {
      expect(screen.queryByTestId('agent-edit-cancel')).not.toBeNull()
    })

    const cancelBtn = screen.getByTestId('agent-edit-cancel')
    expect(cancelBtn.className).toContain('agent-edit-cancel-btn')
  })
})
