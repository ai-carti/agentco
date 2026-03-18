/**
 * BUG-040 — WarRoomPage mock interval must not run when isConnected=true
 */
import { render, screen, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { useWarRoomStore } from '../store/warRoomStore'

// Mock useWarRoomSocket to simulate connected state
vi.mock('../hooks/useWarRoomSocket', () => ({
  useWarRoomSocket: vi.fn(() => ({ isConnected: true, events: [], error: null })),
}))

function renderWarRoom(companyId = 'comp-1') {
  return render(
    <MemoryRouter initialEntries={[`/companies/${companyId}/warroom`]}>
      <Routes>
        <Route path="/companies/:id/warroom" element={<WarRoomPageDynamic />} />
      </Routes>
    </MemoryRouter>,
  )
}

// Dynamic import to ensure the mock is applied
import WarRoomPageDynamic from '../components/WarRoomPage'

beforeEach(() => {
  vi.useFakeTimers()
  useWarRoomStore.getState().reset()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('WarRoomPage — BUG-040 connected state', () => {
  it('does not add mock messages via interval when isConnected=true', () => {
    renderWarRoom()
    // Load mock data
    act(() => { vi.advanceTimersByTime(100) })

    const msgCountBefore = useWarRoomStore.getState().messages.length

    // Advance 3 seconds — interval should NOT fire
    act(() => { vi.advanceTimersByTime(3000) })

    const msgCountAfter = useWarRoomStore.getState().messages.length
    expect(msgCountAfter).toBe(msgCountBefore)
  })

  it('renders war room page when connected', () => {
    renderWarRoom()
    expect(screen.getByTestId('war-room-page')).toBeInTheDocument()
  })
})

// ─── SIRI-UX-025: isConnecting flag — no premature empty state ───────────────

describe('WarRoomPage — SIRI-UX-025: isConnecting skeleton/spinner', () => {
  it('shows skeleton/spinner when isConnected=true but no agents yet', () => {
    // Don't load mock data — simulate empty agents with real WS connected
    const original = useWarRoomStore.getState().loadMockData
    useWarRoomStore.setState({ loadMockData: () => {} } as any)

    render(
      <MemoryRouter initialEntries={['/companies/comp-1/warroom']}>
        <Routes>
          <Route path="/companies/:id/warroom" element={<WarRoomPageDynamic />} />
        </Routes>
      </MemoryRouter>,
    )

    // Should show connecting state, not "All quiet here"
    expect(screen.queryByText(/All quiet here/i)).not.toBeInTheDocument()
    expect(screen.getByTestId('war-room-connecting')).toBeInTheDocument()

    useWarRoomStore.setState({ loadMockData: original } as any)
  })

  it('shows actual content after agents arrive', () => {
    renderWarRoom()
    act(() => { vi.advanceTimersByTime(100) })

    // After mock data loads, agents are present — should show war room
    expect(screen.queryByTestId('war-room-connecting')).not.toBeInTheDocument()
    expect(screen.getByTestId('agent-panel')).toBeInTheDocument()
  })

  it('shows empty state after 3s timeout when still no agents and isConnected=true', () => {
    const original = useWarRoomStore.getState().loadMockData
    useWarRoomStore.setState({ loadMockData: () => {} } as any)

    render(
      <MemoryRouter initialEntries={['/companies/comp-1/warroom']}>
        <Routes>
          <Route path="/companies/:id/warroom" element={<WarRoomPageDynamic />} />
        </Routes>
      </MemoryRouter>,
    )

    // Before 3s — connecting state
    expect(screen.getByTestId('war-room-connecting')).toBeInTheDocument()

    // After 3s timeout
    act(() => { vi.advanceTimersByTime(3000) })

    expect(screen.queryByTestId('war-room-connecting')).not.toBeInTheDocument()
    expect(screen.getByText(/All quiet here/i)).toBeInTheDocument()

    useWarRoomStore.setState({ loadMockData: original } as any)
  })
})
