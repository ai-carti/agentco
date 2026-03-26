/**
 * SIRI-UX-254: WarRoom.tsx — mountedRef not reset to true in useEffect
 *   React StrictMode double-invokes effects: cleanup sets mountedRef=false,
 *   second effect run never resets it → onclose skips reconnect → WS dead.
 *   Fix: add `mountedRef.current = true` at top of useEffect body.
 *
 * SIRI-UX-255: CompaniesPage.tsx — company list items use JS hover handlers
 *   (onMouseEnter/onMouseLeave) instead of CSS class, unlike Button.tsx/KanbanBoard
 *   fixed in SIRI-UX-249/250. Fix: add `companies-item` CSS class, remove JS hover.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { StrictMode } from 'react'
import WarRoom from '../components/WarRoom'
import CompaniesPage from '../components/CompaniesPage'
import { ToastProvider } from '../context/ToastContext'

// ─── shared WS mock ────────────────────────────────────────────────────────────

let wsInstances: Array<{
  onopen: (() => void) | null
  onclose: ((e: Partial<CloseEvent>) => void) | null
  onmessage: ((e: MessageEvent) => void) | null
  onerror: (() => void) | null
  close: ReturnType<typeof vi.fn>
  readyState: number
}> = []

function lastWs() {
  return wsInstances[wsInstances.length - 1]
}

beforeEach(() => {
  wsInstances = []
  vi.stubGlobal(
    'WebSocket',
    vi.fn(() => {
      const ws = {
        onopen: null as (() => void) | null,
        onclose: null as ((e: Partial<CloseEvent>) => void) | null,
        onmessage: null as ((e: MessageEvent) => void) | null,
        onerror: null as (() => void) | null,
        close: vi.fn(),
        send: vi.fn(),
        readyState: 1,
      }
      wsInstances.push(ws)
      return ws
    }),
  )
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: false, json: vi.fn().mockResolvedValue([]) }),
  )

  // Provide auth + company via module mocks
  vi.mock('../store/authStore', () => ({
    useAuthStore: (sel: (s: { token: string }) => unknown) =>
      sel({ token: 'test-token' }),
  }))
  vi.mock('../store/agentStore', () => ({
    useAgentStore: (sel: (s: {
      currentCompany: { id: string; name: string }
      agents: []
      tasks: []
    }) => unknown) =>
      sel({ currentCompany: { id: 'co-1', name: 'Acme' }, agents: [], tasks: [] }),
  }))
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

// ─── SIRI-UX-254 ────────────────────────────────────────────────────────────

describe('SIRI-UX-254: WarRoom mountedRef reset on effect re-run', () => {
  it('reconnects after WS close even when React StrictMode double-invokes the effect', async () => {
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout')

    render(
      <StrictMode>
        <MemoryRouter>
          <WarRoom />
        </MemoryRouter>
      </StrictMode>,
    )

    // In StrictMode, React runs effect → cleanup → effect again.
    // After second effect, a WS close (code 1006, non-clean) must schedule reconnect.
    // Without the fix: mountedRef.current stays false from cleanup → reconnect skipped.
    const ws = lastWs()
    act(() => { ws.onopen?.() })

    // Flush any pending state
    await waitFor(() => expect(wsInstances.length).toBeGreaterThanOrEqual(1))

    const reconnectSetTimeout = setTimeoutSpy.mock.calls.length

    act(() => {
      ws.onclose?.({ wasClean: false, code: 1006 })
    })

    await waitFor(() => {
      // At least one setTimeout should have been called after the close
      expect(setTimeoutSpy.mock.calls.length).toBeGreaterThan(reconnectSetTimeout)
    })
  })
})

// ─── SIRI-UX-255 ────────────────────────────────────────────────────────────

describe('SIRI-UX-255: CompaniesPage company items use CSS class for hover', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue([{ id: 'co-42', name: 'Test Corp' }]),
      }),
    )
  })

  it('company list item has companies-item CSS class instead of only JS hover handlers', async () => {
    render(
      <MemoryRouter>
        <ToastProvider>
          <CompaniesPage />
        </ToastProvider>
      </MemoryRouter>,
    )

    const item = await screen.findByTestId('company-item-co-42')
    // Should have CSS class for hover styling (not just JS onMouseEnter/onMouseLeave)
    expect(item.className).toContain('companies-item')
  })
})
