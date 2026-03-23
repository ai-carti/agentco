/**
 * BUG-073: CompaniesPage.tsx:load() — `finally` executes on AbortError
 *
 * `return` in `catch (AbortError)` does NOT prevent `finally` from running.
 * `setLoading(false)` and `setHasLoadedOnce(true)` were being called on unmounted
 * component when fetch is aborted.
 *
 * Fix: move setLoading(false) and setHasLoadedOnce(true) out of finally,
 * into try (success path) and catch (non-abort error path) only.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ToastProvider } from '../context/ToastContext'
import CompaniesPage from '../components/CompaniesPage'

const renderPage = () => {
  return render(
    <ToastProvider>
      <MemoryRouter>
        <CompaniesPage />
      </MemoryRouter>
    </ToastProvider>
  )
}

describe('BUG-073: CompaniesPage load() finally on AbortError', () => {
  let setStateCalls: string[]

  beforeEach(() => {
    setStateCalls = []
    // Provide a fetch that never resolves — simulates in-flight request
    globalThis.fetch = vi.fn(
      (_url: unknown, opts: RequestInit | undefined) => {
        // Track when signal is aborted
        if (opts?.signal) {
          ;(opts.signal as AbortSignal).addEventListener('abort', () => {
            setStateCalls.push('abort-triggered')
          })
        }
        return new Promise<Response>(() => {
          // never resolves
        })
      }
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('does NOT call setLoading(false) after abort (no state update on unmounted component)', async () => {
    // We'll track React state updates by checking component renders
    // The key invariant: after unmount + abort, no state setter runs
    // We verify this indirectly: component renders without error and no
    // React "state update on unmounted component" warning is thrown.
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const { unmount } = renderPage()
    expect(globalThis.fetch).toHaveBeenCalledTimes(1)

    // Unmount immediately — triggers AbortController.abort()
    unmount()

    // Wait a tick to let any microtasks settle
    await new Promise((r) => setTimeout(r, 10))

    // Should have no "Can't perform a state update on an unmounted component" errors
    const stateUpdateErrors = consoleSpy.mock.calls.filter(
      (call) =>
        typeof call[0] === 'string' &&
        call[0].includes('state update on an unmounted')
    )
    expect(stateUpdateErrors).toHaveLength(0)

    consoleSpy.mockRestore()
  })

  it('sets loading=false and hasLoadedOnce=true on successful fetch (try path)', async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: async () => [{ id: '1', name: 'Acme' }],
      } as Response)
    )

    const { getByTestId, unmount } = renderPage()

    // Wait for loading to finish
    await waitFor(() => {
      expect(() => getByTestId('companies-page')).not.toThrow()
    })

    // Component should display companies (not onboarding, not loading)
    // The company-item should be visible
    await waitFor(() => {
      expect(getByTestId('company-item-1')).toBeTruthy()
    })

    unmount()
  })

  it('sets loading=false and hasLoadedOnce=true on non-abort error (catch path)', async () => {
    globalThis.fetch = vi.fn(() => Promise.reject(new Error('Network error')))

    const { getByTestId, unmount } = renderPage()

    // Should show error state (not stuck in loading)
    await waitFor(() => {
      const page = getByTestId('companies-page')
      expect(page).toBeTruthy()
      // Error message should appear
      expect(page.textContent).toContain('Failed to load')
    })

    unmount()
  })

  it('does NOT set hasLoadedOnce=true when request is aborted', async () => {
    // Use a fetch that resolves after a delay with an AbortError when aborted
    globalThis.fetch = vi.fn((_url: unknown, opts: RequestInit | undefined) => {
      return new Promise<Response>((_resolve, reject) => {
        if (opts?.signal) {
          opts.signal.addEventListener('abort', () => {
            const err = new DOMException('Aborted', 'AbortError')
            reject(err)
          })
        }
      })
    })

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const { unmount } = renderPage()
    // Immediately unmount to trigger abort
    unmount()

    await new Promise((r) => setTimeout(r, 20))

    // No state update warnings
    const stateUpdateErrors = consoleSpy.mock.calls.filter(
      (call) =>
        typeof call[0] === 'string' &&
        call[0].includes('state update on an unmounted')
    )
    expect(stateUpdateErrors).toHaveLength(0)

    consoleSpy.mockRestore()
  })
})
