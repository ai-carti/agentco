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
