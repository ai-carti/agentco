/**
 * SIRI-UX-157: AgentPage — fetch calls use AbortController
 *
 * Navigating away while fetches are in flight previously caused setState on
 * unmounted component. Fix: single AbortController per effect, abort in cleanup.
 */
import { render, screen, waitFor, act } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import AgentPage from '../components/AgentPage'

function renderAgentPage() {
  return render(
    <MemoryRouter initialEntries={['/companies/c1/agents/a1']}>
      <Routes>
        <Route path="/companies/:id/agents/:agentId" element={<AgentPage />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('SIRI-UX-157: AgentPage AbortController cleanup', () => {
  let abortSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    abortSpy = vi.fn()
    const originalAbortController = globalThis.AbortController

    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      new Promise((resolve) => {
        setTimeout(() => {
          resolve({ ok: true, json: async () => ({ id: 'a1', name: 'CEO' }) } as Response)
        }, 500)
      })
    )

    // Spy on AbortController.abort to verify it's called on unmount
    vi.spyOn(originalAbortController.prototype, 'abort').mockImplementation(abortSpy)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('calls AbortController.abort() when component unmounts', async () => {
    const { unmount } = renderAgentPage()
    // Wait for render to settle
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10))
    })
    unmount()
    expect(abortSpy).toHaveBeenCalled()
  })
})
