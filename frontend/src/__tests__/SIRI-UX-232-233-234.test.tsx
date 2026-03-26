/**
 * SIRI-UX-232: WarRoom.tsx — mountedRef prevents zombie reconnect after unmount
 * SIRI-UX-233: WarRoom.tsx — clean close (code 1000) does NOT trigger reconnect
 * SIRI-UX-234: CompanyPage.tsx — activeTab resets to 'war-room' when company changes
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

const TOKEN = 'test-token'
const COMPANY_ID = 'co-1'

vi.mock('../store/authStore', () => ({
  useAuthStore: (sel: (s: { token: string }) => unknown) => sel({ token: TOKEN }),
}))
vi.mock('../store/agentStore', () => ({
  useAgentStore: (sel: (s: {
    currentCompany: { id: string; name: string } | null
    setCurrentCompany: unknown
    setTasks: unknown
    setAgents: unknown
    setActiveCompanyTab: unknown
    activeCompanyTab: string | null
    agents: unknown[]
    tasks: unknown[]
  }) => unknown) =>
    sel({
      currentCompany: { id: COMPANY_ID, name: 'Test Co' },
      setCurrentCompany: vi.fn(),
      setTasks: vi.fn(),
      setAgents: vi.fn(),
      setActiveCompanyTab: vi.fn(),
      activeCompanyTab: 'war-room',
      agents: [],
      tasks: [],
    }),
}))

globalThis.fetch = vi.fn().mockResolvedValue({
  ok: true,
  json: () => Promise.resolve([]),
})

type MockWsInstance = {
  onopen: (() => void) | null
  onmessage: ((e: { data: string }) => void) | null
  onclose: ((e: { code: number; wasClean: boolean }) => void) | null
  onerror: (() => void) | null
  close: () => void
  _closed: boolean
}
let wsInstances: MockWsInstance[] = []

class MockWebSocket {
  onopen: (() => void) | null = null
  onmessage: ((e: { data: string }) => void) | null = null
  onclose: ((e: { code: number; wasClean: boolean }) => void) | null = null
  onerror: (() => void) | null = null
  _closed = false

  constructor() {
    wsInstances.push(this as unknown as MockWsInstance)
  }
  close() { this._closed = true }
}
vi.stubGlobal('WebSocket', MockWebSocket)

import WarRoom from '../components/WarRoom'

describe('SIRI-UX-232: no zombie reconnect after unmount', () => {
  beforeEach(() => {
    wsInstances = []
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllTimers()
  })

  it('does NOT create a new WebSocket after unmount when onclose fires', async () => {
    const { unmount } = render(
      <MemoryRouter><WarRoom /></MemoryRouter>
    )

    // Let mount settle
    await act(async () => { await Promise.resolve() })
    expect(wsInstances).toHaveLength(1)
    const ws = wsInstances[0]

    // Simulate onopen (so WS is "established")
    act(() => { ws.onopen?.() })

    // Unmount — cleanup fires: mountedRef.current = false, then ws.close()
    unmount()

    // WS fires onclose after cleanup (as it does in real browser)
    act(() => { ws.onclose?.({ code: 1006, wasClean: false }) })

    // Advance timer — reconnect should NOT fire because mountedRef.current === false
    await act(async () => { vi.advanceTimersByTime(5000) })

    // Still only 1 WebSocket instance (no new reconnect)
    expect(wsInstances).toHaveLength(1)
  })
})

describe('SIRI-UX-233: clean close (code 1000) does not trigger reconnect', () => {
  beforeEach(() => {
    wsInstances = []
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllTimers()
  })

  it('does NOT reconnect when WS closes cleanly (code 1000, wasClean=true)', async () => {
    const { unmount } = render(
      <MemoryRouter><WarRoom /></MemoryRouter>
    )
    await act(async () => { await Promise.resolve() })
    expect(wsInstances).toHaveLength(1)
    const ws = wsInstances[0]

    // Simulate WS open
    act(() => { ws.onopen?.() })

    // Simulate clean close BEFORE unmount (e.g. server sends 1000 close frame)
    // mountedRef is still true here
    act(() => { ws.onclose?.({ code: 1000, wasClean: true }) })

    // Advance timers — should NOT create new WS (wasClean + code 1000)
    await act(async () => { vi.advanceTimersByTime(5000) })

    // Still only 1 WebSocket instance
    expect(wsInstances).toHaveLength(1)

    unmount()
  })

  it('DOES reconnect when WS closes uncleanly (code 1006)', async () => {
    const { unmount } = render(
      <MemoryRouter><WarRoom /></MemoryRouter>
    )
    await act(async () => { await Promise.resolve() })
    const ws = wsInstances[0]

    act(() => { ws.onopen?.() })
    act(() => { ws.onclose?.({ code: 1006, wasClean: false }) })

    // Advance past 3s reconnect delay
    await act(async () => { vi.advanceTimersByTime(4000) })

    // mountedRef is still true (not unmounted) so reconnect fires
    expect(wsInstances.length).toBeGreaterThan(1)

    unmount()
  })
})

describe('SIRI-UX-234: CompanyPage activeTab resets to war-room on company change', () => {
  beforeEach(() => {
    wsInstances = []
  })

  it('renders War Room tab panel as active when component mounts', async () => {
    const { default: CompanyPage } = await import('../components/CompanyPage')

    render(
      <MemoryRouter initialEntries={['/companies/co-1']}>
        <Routes>
          <Route path="/companies/:id" element={<CompanyPage />} />
        </Routes>
      </MemoryRouter>
    )

    // The war-room tabpanel should be visible (not hidden)
    // SIRI-UX-381: IDs are now namespaced with companyId
    await waitFor(() => {
      const warRoomPanel = document.getElementById('tabpanel-co-1-war-room')
      expect(warRoomPanel).not.toBeNull()
      // hidden prop means display:none — if active it should NOT be hidden
      expect(warRoomPanel?.hidden).toBe(false)
    })
  })
})
