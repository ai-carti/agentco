/**
 * SIRI-UX-289: ws-error-banner and run-status-banner must have role="alert"
 * so screen readers auto-announce them when they appear dynamically.
 */
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { useWarRoomStore } from '../store/warRoomStore'

// Minimal mock for useWarRoomSocket
vi.mock('../hooks/useWarRoomSocket', () => ({
  useWarRoomSocket: () => ({ isConnected: false, error: 'WebSocket error', events: [] }),
}))

vi.mock('../context/ToastContext', () => ({
  useToast: () => ({ error: vi.fn(), success: vi.fn(), info: vi.fn() }),
}))

vi.mock('../api/client', () => ({
  getStoredToken: () => 'mock-token',
}))

vi.mock('../hooks/useIsMobile', () => ({
  useIsMobile: () => false,
}))

// Stub fetch so no real network calls
beforeEach(() => {
  globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve([]) })
})

async function renderWarRoomPage() {
  const { default: WarRoomPage } = await import('../components/WarRoomPage')
  return render(
    <MemoryRouter initialEntries={['/companies/c1']}>
      <Routes>
        <Route path="/companies/:id" element={<WarRoomPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('SIRI-UX-289: WarRoomPage banners have role="alert"', () => {
  it('ws-error-banner has role="alert" for screen reader auto-announce', async () => {
    // Load mock data so agents list is non-empty (avoids empty/connecting state)
    useWarRoomStore.getState().loadMockData()
    await renderWarRoomPage()
    const banner = screen.getByTestId('ws-error-banner')
    expect(banner).toHaveAttribute('role', 'alert')
  })

  it('run-status-banner has role="alert" for screen reader auto-announce', async () => {
    useWarRoomStore.getState().loadMockData()
    useWarRoomStore.getState().setRunStatus('done')
    await renderWarRoomPage()
    const banner = screen.getByTestId('run-status-banner')
    expect(banner).toHaveAttribute('role', 'alert')
  })
})
