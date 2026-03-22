import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import CompanySettingsPage from '../components/CompanySettingsPage'
import { ToastProvider } from '../context/ToastContext'

function renderSettings(companyId = 'c1') {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={[`/companies/${companyId}/settings`]}>
        <Routes>
          <Route path="/companies/:id/settings" element={<CompanySettingsPage />} />
          <Route path="/" element={<div data-testid="home-page">Home</div>} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('SIRI-UX-144: Delete permanently loading state', () => {
  it('shows "Deleting…" and disables button while DELETE is in-flight', async () => {
    let resolveDelete: (v: unknown) => void
    globalThis.fetch = vi.fn().mockImplementation((_url: string, opts?: RequestInit) => {
      if (opts?.method === 'DELETE') {
        return new Promise((resolve) => { resolveDelete = resolve })
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ id: 'c1', name: 'Acme Corp', description: '', owner_id: 'u1' }),
      })
    })

    renderSettings()
    await waitFor(() => {
      expect(screen.getByText('Delete this company')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Delete this company'))
    await waitFor(() => {
      expect(screen.getByTestId('confirm-delete-company-input')).toBeInTheDocument()
    })

    fireEvent.change(screen.getByTestId('confirm-delete-company-input'), {
      target: { value: 'Acme Corp' },
    })

    const confirmBtn = screen.getByTestId('confirm-delete-company-btn')
    expect(confirmBtn).not.toBeDisabled()

    fireEvent.click(confirmBtn)

    // While in-flight: button should be disabled and show "Deleting…"
    expect(screen.getByText('Deleting…')).toBeInTheDocument()
    expect(screen.getByTestId('confirm-delete-company-btn')).toBeDisabled()

    // Resolve the DELETE
    resolveDelete!({ ok: true, json: async () => ({}) })
    await waitFor(() => {
      expect(screen.getByTestId('home-page')).toBeInTheDocument()
    })
  })

  it('re-enables button after DELETE error', async () => {
    let rejectDelete: (err: unknown) => void
    globalThis.fetch = vi.fn().mockImplementation((_url: string, opts?: RequestInit) => {
      if (opts?.method === 'DELETE') {
        return new Promise((_resolve, reject) => { rejectDelete = reject })
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ id: 'c1', name: 'Acme Corp', description: '', owner_id: 'u1' }),
      })
    })

    renderSettings()
    await waitFor(() => {
      expect(screen.getByText('Delete this company')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Delete this company'))
    await waitFor(() => {
      expect(screen.getByTestId('confirm-delete-company-input')).toBeInTheDocument()
    })

    fireEvent.change(screen.getByTestId('confirm-delete-company-input'), {
      target: { value: 'Acme Corp' },
    })
    fireEvent.click(screen.getByTestId('confirm-delete-company-btn'))

    // In-flight: disabled
    expect(screen.getByTestId('confirm-delete-company-btn')).toBeDisabled()

    // Reject the DELETE
    rejectDelete!(new Error('Network error'))
    await waitFor(() => {
      // After error, button should be re-enabled (or at least not show "Deleting…")
      expect(screen.getByTestId('confirm-delete-company-btn')).not.toBeDisabled()
    })
  })

  it('prevents double-click: second click before response does not trigger second DELETE', async () => {
    let callCount = 0
    let resolveDelete: (v: unknown) => void
    globalThis.fetch = vi.fn().mockImplementation((_url: string, opts?: RequestInit) => {
      if (opts?.method === 'DELETE') {
        callCount++
        return new Promise((resolve) => { resolveDelete = resolve })
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ id: 'c1', name: 'Acme Corp', description: '', owner_id: 'u1' }),
      })
    })

    renderSettings()
    await waitFor(() => {
      expect(screen.getByText('Delete this company')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Delete this company'))
    await waitFor(() => {
      expect(screen.getByTestId('confirm-delete-company-input')).toBeInTheDocument()
    })

    fireEvent.change(screen.getByTestId('confirm-delete-company-input'), {
      target: { value: 'Acme Corp' },
    })

    const confirmBtn = screen.getByTestId('confirm-delete-company-btn')
    fireEvent.click(confirmBtn)
    // Try clicking again while disabled
    fireEvent.click(confirmBtn)
    fireEvent.click(confirmBtn)

    // Only one DELETE should have been fired
    expect(callCount).toBe(1)

    resolveDelete!({ ok: true, json: async () => ({}) })
    await waitFor(() => {
      expect(screen.getByTestId('home-page')).toBeInTheDocument()
    })
  })
})
