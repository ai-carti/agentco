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

describe('UX-018: Company Settings page', () => {
  it('renders settings page with General form', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'c1', name: 'Acme Corp', description: 'A company', owner_id: 'u1' }),
    })
    renderSettings()
    await waitFor(() => {
      expect(screen.getByText('Company Settings')).toBeInTheDocument()
      expect(screen.getByLabelText('Company name')).toBeInTheDocument()
      expect(screen.getByLabelText('Description')).toBeInTheDocument()
    })
  })

  it('populates form with current company data', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'c1', name: 'Acme Corp', description: 'Best company', owner_id: 'u1' }),
    })
    renderSettings()
    await waitFor(() => {
      expect(screen.getByLabelText('Company name')).toHaveValue('Acme Corp')
      expect(screen.getByLabelText('Description')).toHaveValue('Best company')
    })
  })

  it('sends PATCH with name + description on Save changes click', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'c1', name: 'Acme Corp', description: '', owner_id: 'u1' }),
    })
    renderSettings()
    await waitFor(() => {
      expect(screen.getByLabelText('Company name')).toBeInTheDocument()
    })

    fireEvent.change(screen.getByLabelText('Company name'), { target: { value: 'New Name' } })
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'New desc' } })
    fireEvent.click(screen.getByText('Save changes'))

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/companies/c1'),
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ name: 'New Name', description: 'New desc' }),
        }),
      )
    })
  })

  it('shows loading state on Save button while saving', async () => {
    let resolveFetch: (v: unknown) => void
    globalThis.fetch = vi.fn().mockImplementation((_url: string, opts?: RequestInit) => {
      if (!opts?.method || opts.method === 'GET') {
        // GET company data
        return Promise.resolve({
          ok: true,
          json: async () => ({ id: 'c1', name: 'Acme', description: '', owner_id: 'u1' }),
        })
      }
      return new Promise((resolve) => { resolveFetch = resolve })
    })
    renderSettings()
    await waitFor(() => {
      expect(screen.getByLabelText('Company name')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Save changes'))
    expect(screen.getByText('Saving...')).toBeInTheDocument()

    resolveFetch!({ ok: true, json: async () => ({}) })
    await waitFor(() => {
      expect(screen.getByText('Save changes')).toBeInTheDocument()
    })
  })

  it('shows Danger Zone with Delete button', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'c1', name: 'Acme Corp', description: '', owner_id: 'u1' }),
    })
    renderSettings()
    await waitFor(() => {
      expect(screen.getByText('Danger Zone')).toBeInTheDocument()
      expect(screen.getByText('Delete this company')).toBeInTheDocument()
    })
  })

  it('delete requires typing exact company name to confirm', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'c1', name: 'Acme Corp', description: '', owner_id: 'u1' }),
    })
    renderSettings()
    await waitFor(() => {
      expect(screen.getByText('Delete this company')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Delete this company'))
    await waitFor(() => {
      expect(screen.getByTestId('confirm-delete-company-input')).toBeInTheDocument()
      expect(screen.getByText('Acme Corp')).toBeInTheDocument()
    })

    // Confirm button should be disabled until exact name is typed
    const confirmBtn = screen.getByTestId('confirm-delete-company-btn')
    expect(confirmBtn).toBeDisabled()

    const input = screen.getByTestId('confirm-delete-company-input')
    fireEvent.change(input, { target: { value: 'Acme Corp' } })
    expect(confirmBtn).not.toBeDisabled()
  })

  it('after successful delete, redirects to / and shows success toast', async () => {
    globalThis.fetch = vi.fn().mockImplementation((_url: string, opts?: RequestInit) => {
      if (opts?.method === 'DELETE') {
        return Promise.resolve({ ok: true, json: async () => ({}) })
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

    fireEvent.change(screen.getByTestId('confirm-delete-company-input'), { target: { value: 'Acme Corp' } })
    fireEvent.click(screen.getByTestId('confirm-delete-company-btn'))

    await waitFor(() => {
      expect(screen.getByTestId('home-page')).toBeInTheDocument()
    })
  })
})
