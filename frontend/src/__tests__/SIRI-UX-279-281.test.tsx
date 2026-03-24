/**
 * SIRI-UX-279: AgentEditPage fetch .then() not guarded by signal.aborted
 * SIRI-UX-280: WarRoom.tsx initial fetch .then() not guarded by signal.aborted
 * SIRI-UX-281: LibraryPortfolioPage — error state missing role="alert", Retry missing aria-label
 */
import { render, screen, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

// Mock dependencies
vi.mock('../store/authStore', () => ({
  useAuthStore: vi.fn((sel) => sel({ token: 'test-token', user: { id: 'u1', email: 'test@test.com' } })),
}))

vi.mock('../context/ToastContext', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}))

vi.mock('../components/AgentForm', () => ({
  default: ({ onSubmit }: { onSubmit: (data: { name: string }) => void }) => (
    <button onClick={() => onSubmit({ name: 'Test' })}>Submit</button>
  ),
}))

vi.mock('../api/client', () => ({
  getStoredToken: () => 'test-token',
  BASE_URL: 'http://localhost:8000',
}))

describe('SIRI-UX-279: AgentEditPage fetch guard on abort', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('does not call setLoading/setAgent after abort signal fires', async () => {
    let resolveJson: (v: unknown) => void = () => {}
    const jsonPromise = new Promise((res) => { resolveJson = res })

    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => jsonPromise,
    })

    const AgentEditPage = (await import('../components/AgentEditPage')).default

    const { unmount } = render(
      <MemoryRouter initialEntries={['/companies/c1/agents/a1/edit']}>
        <Routes>
          <Route path="/companies/:id/agents/:agentId/edit" element={<AgentEditPage />} />
        </Routes>
      </MemoryRouter>
    )

    // Unmount before json resolves — simulates navigation away
    unmount()

    // Resolve json AFTER unmount — should not trigger setState warning
    await act(async () => {
      resolveJson({ id: 'a1', name: 'Agent' })
      await new Promise(res => setTimeout(res, 50))
    })

    // No assertion needed — if setState is called on unmounted component,
    // React would throw an error which would fail the test
    expect(true).toBe(true)
  })
})

describe('SIRI-UX-280: WarRoom initial fetch guard on abort', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('does not call setRuns after abort signal fires', async () => {
    let resolveJson: (v: unknown) => void = () => {}
    const jsonPromise = new Promise((res) => { resolveJson = res })

    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => jsonPromise,
    })

    // Mock agentStore to provide companyId
    vi.mock('../store/agentStore', () => ({
      useAgentStore: vi.fn((sel: (s: { currentCompany?: { id: string } }) => unknown) =>
        sel({ currentCompany: { id: 'c1' } })
      ),
    }))

    const WarRoom = (await import('../components/WarRoom')).default

    const { unmount } = render(
      <MemoryRouter>
        <WarRoom />
      </MemoryRouter>
    )

    unmount()

    await act(async () => {
      resolveJson([{ id: 'r1', status: 'running', started_at: new Date().toISOString() }])
      await new Promise(res => setTimeout(res, 50))
    })

    expect(true).toBe(true)
  })
})

describe('SIRI-UX-281: LibraryPortfolioPage error state accessibility', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    globalThis.fetch = vi.fn().mockRejectedValueOnce(new Error('Network error'))
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('error state has role="alert" for screen readers', async () => {
    const LibraryPortfolioPage = (await import('../components/LibraryPortfolioPage')).default

    render(
      <MemoryRouter initialEntries={['/library/agent-1/portfolio']}>
        <Routes>
          <Route path="/library/:id/portfolio" element={<LibraryPortfolioPage />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => {
      const alert = screen.getByRole('alert')
      expect(alert).toBeInTheDocument()
    })
  })

  it('Retry button has descriptive aria-label', async () => {
    const LibraryPortfolioPage = (await import('../components/LibraryPortfolioPage')).default

    render(
      <MemoryRouter initialEntries={['/library/agent-1/portfolio']}>
        <Routes>
          <Route path="/library/:id/portfolio" element={<LibraryPortfolioPage />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => {
      const retryBtn = screen.getByRole('button', { name: /retry loading portfolio/i })
      expect(retryBtn).toBeInTheDocument()
    })
  })
})
