/**
 * SIRI-UX-013 — WarRoomPage Stop button: API call, toast, state
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { useWarRoomStore } from '../store/warRoomStore'

// Mock useWarRoomSocket
vi.mock('../hooks/useWarRoomSocket', () => ({
  useWarRoomSocket: vi.fn(() => ({ isConnected: false, events: [], error: null })),
}))

// Mock getStoredToken
vi.mock('../api/client', () => ({
  getStoredToken: vi.fn(() => 'test-token'),
}))

import WarRoomPage from '../components/WarRoomPage'
import { ToastProvider } from '../context/ToastContext'

const COMPANY_ID = 'test-company-123'

function renderWarRoom() {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={[`/companies/${COMPANY_ID}/warroom`]}>
        <Routes>
          <Route path="/companies/:id/warroom" element={<WarRoomPage />} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  )
}

beforeEach(() => {
  useWarRoomStore.getState().reset()
  useWarRoomStore.getState().loadMockData()
  vi.restoreAllMocks()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('SIRI-UX-013: WarRoomPage Stop button', () => {
  it('renders Stop button', () => {
    renderWarRoom()
    expect(screen.getByTestId('stop-btn')).toBeInTheDocument()
  })

  it('calls POST API on stop button click', async () => {
    const mockFetch = vi.fn()

    // First call: GET runs list (RunOut schema uses `id`, not `run_id`)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ id: 'run-1' }, { id: 'run-2' }],
    })
    // Second and third: POST stop for each run
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) })

    vi.stubGlobal('fetch', mockFetch)

    renderWarRoom()

    const stopBtn = screen.getByTestId('stop-btn')
    fireEvent.click(stopBtn)

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled()
    })

    // First fetch: GET active runs
    expect(mockFetch.mock.calls[0][0]).toContain(`/api/companies/${COMPANY_ID}/runs`)
    expect(mockFetch.mock.calls[0][0]).toContain('status=running')

    // Subsequent fetches: POST stop for each run
    await waitFor(() => {
      const stopCalls = mockFetch.mock.calls.filter((c) => c[1]?.method === 'POST')
      expect(stopCalls.length).toBe(2)
      expect(stopCalls[0][0]).toContain(`/api/companies/${COMPANY_ID}/runs/run-1/stop`)
      expect(stopCalls[1][0]).toContain(`/api/companies/${COMPANY_ID}/runs/run-2/stop`)
    })
  })

  it('shows success toast when runs stopped', async () => {
    const mockFetch = vi.fn()
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ id: 'run-1' }],
    })
    mockFetch.mockResolvedValueOnce({ ok: true })

    vi.stubGlobal('fetch', mockFetch)

    renderWarRoom()

    fireEvent.click(screen.getByTestId('stop-btn'))

    // Toast success shows up (use getAllByText — banner may also match "Run stopped")
    await waitFor(() => {
      const matches = screen.getAllByText(/All runs stopped|Run stopped/i)
      expect(matches.length).toBeGreaterThan(0)
    })
  })

  it('shows info toast when no active runs', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    })

    vi.stubGlobal('fetch', mockFetch)

    renderWarRoom()

    fireEvent.click(screen.getByTestId('stop-btn'))

    await waitFor(() => {
      expect(screen.getByText(/No active runs/i)).toBeInTheDocument()
    })
  })

  it('shows error toast when API fails', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 500,
    })

    vi.stubGlobal('fetch', mockFetch)

    renderWarRoom()

    fireEvent.click(screen.getByTestId('stop-btn'))

    await waitFor(() => {
      expect(screen.getByText(/Failed to fetch runs/i)).toBeInTheDocument()
    })
  })

  it('button is disabled while stopping', async () => {
    let resolveStopFetch!: (v: unknown) => void
    const pendingStop = new Promise((resolve) => { resolveStopFetch = resolve })

    const mockFetch = vi.fn()
    // runs list
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ id: 'run-1' }],
    })
    // stop call — pending
    mockFetch.mockReturnValueOnce(pendingStop)

    vi.stubGlobal('fetch', mockFetch)

    renderWarRoom()

    const stopBtn = screen.getByTestId('stop-btn')
    fireEvent.click(stopBtn)


    // After click, button should show "Stopping..." and be disabled
    await waitFor(() => {
      expect(screen.getByTestId('stop-btn')).toBeDisabled()
    })

    // Resolve so test can clean up
    resolveStopFetch({ ok: true })
  })
})
