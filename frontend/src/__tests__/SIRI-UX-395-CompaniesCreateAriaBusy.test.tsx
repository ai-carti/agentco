/**
 * SIRI-UX-395 — CompaniesPage: Create button missing aria-busy when creating=true
 *
 * During company creation the button shows "Creating…" but lacks aria-busy="true".
 * Screen readers should announce busy state.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { ToastProvider } from '../context/ToastContext'
import CompaniesPage from '../components/CompaniesPage'

beforeEach(() => { vi.clearAllMocks() })

function renderCompanies() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <CompaniesPage />
      </ToastProvider>
    </MemoryRouter>
  )
}

describe('SIRI-UX-395 CompaniesPage — Create button aria-busy', () => {
  it('Create button has aria-busy="false" when not creating', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ id: 'c1', name: 'ACME' }],
    })
    renderCompanies()
    const newBtn = await screen.findByTestId('new-company-btn')
    fireEvent.click(newBtn)
    const input = screen.getByTestId('new-company-name-input')
    fireEvent.change(input, { target: { value: 'Test Corp' } })
    const createBtn = screen.getByTestId('new-company-create-btn')
    expect(createBtn).toHaveAttribute('aria-busy', 'false')
  })

  it('Create button has aria-busy="true" while creating', async () => {
    // First call: load companies. Second: slow create
    let resolveCreate: (v: unknown) => void
    const createPromise = new Promise((res) => { resolveCreate = res })
    let callCount = 0
    globalThis.fetch = vi.fn().mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return Promise.resolve({ ok: true, json: async () => [{ id: 'c1', name: 'ACME' }] })
      }
      return createPromise
    })
    renderCompanies()
    const newBtn = await screen.findByTestId('new-company-btn')
    fireEvent.click(newBtn)
    const input = screen.getByTestId('new-company-name-input')
    fireEvent.change(input, { target: { value: 'Test Corp' } })
    const createBtn = screen.getByTestId('new-company-create-btn')
    fireEvent.click(createBtn)
    await waitFor(() => {
      expect(screen.getByTestId('new-company-create-btn')).toHaveAttribute('aria-busy', 'true')
    })
    resolveCreate!({ ok: true, json: async () => ({ id: 'c2', name: 'Test Corp' }) })
  })
})
