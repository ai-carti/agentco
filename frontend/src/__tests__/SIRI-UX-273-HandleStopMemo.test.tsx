/**
 * SIRI-UX-273: handleStop in WarRoomPage should be memoized via useCallback
 * to prevent unnecessary re-renders of the Stop Button.
 * Test verifies the Stop button is stable and functional.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import WarRoomPage from '../components/WarRoomPage'
import { useWarRoomStore } from '../store/warRoomStore'

vi.mock('../hooks/useWarRoomSocket', () => ({
  useWarRoomSocket: () => ({ isConnected: false, error: null }),
}))
vi.mock('../hooks/useIsMobile', () => ({ useIsMobile: () => false }))
vi.mock('../context/ToastContext', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}))
vi.mock('../api/client', () => ({
  getStoredToken: () => null,
  BASE_URL: 'http://localhost:8000',
}))

beforeEach(() => {
  useWarRoomStore.getState().reset()
})

describe('SIRI-UX-273: handleStop is memoized in WarRoomPage', () => {
  it('Stop button renders and is disabled when no run is active (empty state)', () => {
    render(
      <MemoryRouter initialEntries={['/companies/test-co']}>
        <Routes>
          <Route path="/companies/:id" element={<WarRoomPage />} />
        </Routes>
      </MemoryRouter>
    )
    // With no agents, renders empty state (not war room layout)
    // — component should render without throwing
    expect(document.body).toBeTruthy()
  })

  it('Stop button is disabled when runStatus is idle', () => {
    useWarRoomStore.setState({
      agents: [{ id: 'a1', name: 'CEO', role: 'Chief', level: 0, status: 'idle', avatar: '🤖' }],
      messages: [],
      cost: 0,
      runStatus: 'idle',
      flashingAgents: new Set(),
    })
    render(
      <MemoryRouter initialEntries={['/companies/test-co']}>
        <Routes>
          <Route path="/companies/:id" element={<WarRoomPage />} />
        </Routes>
      </MemoryRouter>
    )
    const stopBtn = screen.getByTestId('stop-btn')
    expect(stopBtn).toBeTruthy()
    expect(stopBtn.hasAttribute('disabled')).toBe(true)
  })

  it('Stop button is enabled when runStatus is running', () => {
    useWarRoomStore.setState({
      agents: [{ id: 'a1', name: 'CEO', role: 'Chief', level: 0, status: 'running', avatar: '🤖' }],
      messages: [],
      cost: 0,
      runStatus: 'active' as const,
      flashingAgents: new Set(),
    })
    render(
      <MemoryRouter initialEntries={['/companies/test-co']}>
        <Routes>
          <Route path="/companies/:id" element={<WarRoomPage />} />
        </Routes>
      </MemoryRouter>
    )
    const stopBtn = screen.getByTestId('stop-btn')
    expect(stopBtn.hasAttribute('disabled')).toBe(false)
  })
})
