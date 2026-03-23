/**
 * SIRI-UX-179: CompaniesPage load() should use AbortController so fetch is
 * cancelled when the component unmounts — prevents setState on unmounted component.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render } from '@testing-library/react'
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

describe('SIRI-UX-179: CompaniesPage AbortController on unmount', () => {
  let abortSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    abortSpy = vi.fn()
    // Provide a fetch that never resolves so we can verify abort is called on unmount
    globalThis.fetch = vi.fn(
      () =>
        new Promise<Response>(() => {
          // intentionally never resolves — we unmount before it does
        })
    )
    // Patch AbortController to spy on abort()
    const OriginalAbortController = globalThis.AbortController
    vi.spyOn(globalThis, 'AbortController').mockImplementation(() => {
      const ctrl = new OriginalAbortController()
      const originalAbort = ctrl.abort.bind(ctrl)
      ctrl.abort = vi.fn((...args) => {
        abortSpy()
        return originalAbort(...args)
      }) as typeof ctrl.abort
      return ctrl
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('aborts in-flight fetch when component unmounts', () => {
    const { unmount } = renderPage()
    // Component mounted and fetch started
    expect(globalThis.fetch).toHaveBeenCalled()
    // Unmount — should trigger cleanup and abort
    unmount()
    expect(abortSpy).toHaveBeenCalledTimes(1)
  })

  it('passes AbortSignal to fetch', () => {
    const { unmount } = renderPage()
    const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    const fetchOptions = fetchCall?.[1] as RequestInit | undefined
    expect(fetchOptions?.signal).toBeInstanceOf(AbortSignal)
    unmount()
  })
})
