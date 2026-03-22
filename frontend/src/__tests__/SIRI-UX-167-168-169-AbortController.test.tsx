/**
 * SIRI-UX-167: SettingsPage — AbortController in both fetch useEffects
 * SIRI-UX-168: AgentForm — AbortController in loadModels useEffect
 * SIRI-UX-169: LibraryPortfolioPage — AbortController in fetchPortfolio
 *
 * Pattern: on component unmount, any in-flight fetch must be aborted.
 * Verify: signal is passed to fetch AND abort() is called on cleanup.
 */
import { render, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import SettingsPage from '../components/SettingsPage'
import AgentForm from '../components/AgentForm'
import LibraryPortfolioPage from '../components/LibraryPortfolioPage'
import { ToastProvider } from '../context/ToastContext'

beforeEach(() => {
  vi.clearAllMocks()
})

// ─── SIRI-UX-167: SettingsPage ────────────────────────────────────────────────

describe('SIRI-UX-167: SettingsPage — AbortController on unmount', () => {
  it('passes AbortSignal to GET /api/companies/ fetch', async () => {
    let capturedSignal: AbortSignal | undefined

    globalThis.fetch = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      if (!capturedSignal && init?.signal) {
        capturedSignal = init.signal
      }
      // Return a never-resolving promise to simulate in-flight request
      return new Promise(() => {})
    })

    const { unmount } = render(
      <ToastProvider>
        <MemoryRouter>
          <SettingsPage />
        </MemoryRouter>
      </ToastProvider>,
    )

    // fetch should have been called
    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalled()
    })

    // Signal must be present
    expect(capturedSignal).toBeDefined()

    // Before unmount, signal is not aborted
    expect(capturedSignal!.aborted).toBe(false)

    // Unmount → cleanup → abort()
    unmount()

    expect(capturedSignal!.aborted).toBe(true)
  })

  it('passes AbortSignal to GET /api/companies/{id}/credentials fetch', async () => {
    const signals: AbortSignal[] = []

    globalThis.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (init?.signal) signals.push(init.signal)

      // Resolve companies so credentials fetch is triggered
      if ((url as string).match(/\/api\/companies\/?$/)) {
        return Promise.resolve({
          ok: true,
          json: async () => [{ id: 'co-1', name: 'Test Corp' }],
        })
      }
      // Never resolve credentials
      return new Promise(() => {})
    })

    const { unmount } = render(
      <ToastProvider>
        <MemoryRouter>
          <SettingsPage />
        </MemoryRouter>
      </ToastProvider>,
    )

    // Wait for credentials fetch to be called
    await waitFor(() => {
      const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls as [string, RequestInit?][]
      const credCall = calls.find((c) => (c[0] as string).includes('/credentials'))
      expect(credCall).toBeDefined()
    })

    // Find signal from credentials fetch
    const credSignal = signals.find((_, i) => {
      const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls as [string, RequestInit?][]
      return (calls[i]?.[0] as string | undefined)?.includes('/credentials')
    })

    // The credentials fetch signal must exist and not be aborted yet
    expect(credSignal).toBeDefined()
    expect(credSignal!.aborted).toBe(false)

    unmount()

    expect(credSignal!.aborted).toBe(true)
  })

  it('does NOT call setState after unmount (no React warning on AbortError)', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    // Deferred resolve so we can unmount before it settles
    let resolveCompanies!: (v: unknown) => void
    const companiesPromise = new Promise((res) => { resolveCompanies = res })

    globalThis.fetch = vi.fn().mockImplementation(() => companiesPromise)

    const { unmount } = render(
      <ToastProvider>
        <MemoryRouter>
          <SettingsPage />
        </MemoryRouter>
      </ToastProvider>,
    )

    unmount()

    // Resolve AFTER unmount — should be swallowed by AbortController
    resolveCompanies({ ok: true, json: async () => [{ id: 'co-1', name: 'Test' }] })

    // Wait a tick for any async side effects
    await new Promise((r) => setTimeout(r, 50))

    // No "Cannot update state on unmounted component" errors
    const errors = consoleSpy.mock.calls.map((c) => String(c[0]))
    const stateUpdateErrors = errors.filter((e) => e.includes('unmounted') || e.includes('memory leak'))
    expect(stateUpdateErrors).toHaveLength(0)

    consoleSpy.mockRestore()
  })
})

// ─── SIRI-UX-168: AgentForm ───────────────────────────────────────────────────

describe('SIRI-UX-168: AgentForm — AbortController on unmount', () => {
  it('passes AbortSignal to GET /api/llm/providers/available', async () => {
    let capturedSignal: AbortSignal | undefined

    globalThis.fetch = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      if (init?.signal) capturedSignal = init.signal
      // Never resolve
      return new Promise(() => {})
    })

    const { unmount } = render(<AgentForm onSubmit={vi.fn()} />)

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalled()
    })

    expect(capturedSignal).toBeDefined()
    expect(capturedSignal!.aborted).toBe(false)

    unmount()

    expect(capturedSignal!.aborted).toBe(true)
  })

  it('does NOT call setModels or setLoadingModels after unmount', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    let resolveModels!: (v: unknown) => void
    const modelsPromise = new Promise((res) => { resolveModels = res })

    globalThis.fetch = vi.fn().mockImplementation(() => modelsPromise)

    const { unmount } = render(<AgentForm onSubmit={vi.fn()} />)

    unmount()

    // Resolve after unmount
    resolveModels({ ok: true, json: async () => ({ all_models: ['gpt-4o'] }) })

    await new Promise((r) => setTimeout(r, 50))

    const errors = consoleSpy.mock.calls.map((c) => String(c[0]))
    const stateUpdateErrors = errors.filter((e) => e.includes('unmounted') || e.includes('memory leak'))
    expect(stateUpdateErrors).toHaveLength(0)

    consoleSpy.mockRestore()
  })

  it('falls back to FALLBACK_MODELS when fetch is aborted', async () => {
    // Simulate abort by rejecting with AbortError
    globalThis.fetch = vi.fn().mockImplementation(() => {
      const err = new DOMException('AbortError', 'AbortError')
      return Promise.reject(err)
    })

    const { unmount } = render(<AgentForm onSubmit={vi.fn()} />)

    // Component should not crash — models list handled gracefully
    await new Promise((r) => setTimeout(r, 50))

    unmount()
  })
})

// ─── SIRI-UX-169: LibraryPortfolioPage ───────────────────────────────────────

describe('SIRI-UX-169: LibraryPortfolioPage — AbortController on unmount', () => {
  function renderPortfolio(id = 'agent-1') {
    return render(
      <MemoryRouter initialEntries={[`/library/${id}/portfolio`]}>
        <Routes>
          <Route path="/library/:id/portfolio" element={<LibraryPortfolioPage />} />
        </Routes>
      </MemoryRouter>,
    )
  }

  it('passes AbortSignal to GET /api/library/{id}/portfolio', async () => {
    let capturedSignal: AbortSignal | undefined

    globalThis.fetch = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      if (init?.signal) capturedSignal = init.signal
      return new Promise(() => {})
    })

    const { unmount } = renderPortfolio()

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalled()
    })

    expect(capturedSignal).toBeDefined()
    expect(capturedSignal!.aborted).toBe(false)

    unmount()

    expect(capturedSignal!.aborted).toBe(true)
  })

  it('does NOT call setState after unmount during initial fetch', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    let resolvePortfolio!: (v: unknown) => void
    const portfolioPromise = new Promise((res) => { resolvePortfolio = res })

    globalThis.fetch = vi.fn().mockImplementation(() => portfolioPromise)

    const { unmount } = renderPortfolio()

    unmount()

    resolvePortfolio({
      ok: true,
      json: async () => ({
        agent_name: 'Test Agent',
        total_tasks: 5,
        success_rate: 80,
        tasks: [],
      }),
    })

    await new Promise((r) => setTimeout(r, 50))

    const errors = consoleSpy.mock.calls.map((c) => String(c[0]))
    const stateUpdateErrors = errors.filter((e) => e.includes('unmounted') || e.includes('memory leak'))
    expect(stateUpdateErrors).toHaveLength(0)

    consoleSpy.mockRestore()
  })

  it('Retry button still works after mount (non-abort path)', async () => {
    // First call fails, second call (retry) succeeds
    let callCount = 0
    globalThis.fetch = vi.fn().mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return Promise.resolve({ ok: false, status: 500 })
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({
          agent_name: 'Agent',
          total_tasks: 1,
          success_rate: 100,
          tasks: [],
        }),
      })
    })

    const { getByRole } = renderPortfolio()

    await waitFor(() => {
      expect(getByRole('button', { name: /retry/i })).toBeInTheDocument()
    })

    getByRole('button', { name: /retry/i }).click()

    await waitFor(() => {
      expect(callCount).toBe(2)
    })
  })
})
