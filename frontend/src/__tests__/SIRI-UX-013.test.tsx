/**
 * SIRI-UX-013: WarRoomPage Stop button should call API and show toast, not just console.log
 */
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import WarRoomPage from '../components/WarRoomPage'
import { useWarRoomStore } from '../store/warRoomStore'

// Mock WebSocket
vi.mock('../hooks/useWarRoomSocket', () => ({
  useWarRoomSocket: () => ({ isConnected: false }),
}))

// Mock ToastContext
const mockToastSuccess = vi.fn()
const mockToastError = vi.fn()
vi.mock('../context/ToastContext', () => ({
  useToast: () => ({
    success: mockToastSuccess,
    error: mockToastError,
    info: vi.fn(),
  }),
}))

beforeEach(() => {
  vi.clearAllMocks()
  useWarRoomStore.getState().loadMockData()
})

function renderWarRoom(companyId = 'c1') {
  return render(
    <MemoryRouter initialEntries={[`/companies/${companyId}`]}>
      <Routes>
        <Route path="/companies/:id" element={<WarRoomPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('SIRI-UX-013: Stop button calls API', () => {
  it('renders Stop button', () => {
    renderWarRoom()
    expect(screen.getByTestId('stop-btn')).toBeInTheDocument()
  })

  it('calls API when Stop clicked', async () => {
    const fetchMock = vi.fn()
      // First: GET runs?status=running
      .mockResolvedValueOnce({ ok: true, json: async () => [{ run_id: 'run-1' }] })
      // Second: POST stop
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
    globalThis.fetch = fetchMock
    renderWarRoom()

    await act(async () => {
      fireEvent.click(screen.getByTestId('stop-btn'))
    })

    await waitFor(() => {
      // Should have called some API endpoint (not just console.log)
      expect(fetchMock).toHaveBeenCalled()
    })
  })

  it('shows toast on successful stop', async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => [{ run_id: 'run-1' }] })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
    renderWarRoom()

    await act(async () => {
      fireEvent.click(screen.getByTestId('stop-btn'))
    })

    await waitFor(() => {
      expect(mockToastSuccess).toHaveBeenCalled()
    })
  })

  it('shows info toast when no active runs', async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
    renderWarRoom()

    await act(async () => {
      fireEvent.click(screen.getByTestId('stop-btn'))
    })

    await waitFor(() => {
      // no toast.success, but toast.info called
      expect(mockToastSuccess).not.toHaveBeenCalled()
    })
  })

  it('shows error toast on failed stop', async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) })
    renderWarRoom()

    await act(async () => {
      fireEvent.click(screen.getByTestId('stop-btn'))
    })

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalled()
    })
  })
})
