/**
 * SIRI-UX-372: handleCreate should be wrapped in useCallback
 * SIRI-UX-373: + New Company button and modal Create button must have data-testid
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ToastProvider } from '../context/ToastContext'
import CompaniesPage from '../components/CompaniesPage'

const renderPage = () =>
  render(
    <ToastProvider>
      <MemoryRouter>
        <CompaniesPage />
      </MemoryRouter>
    </ToastProvider>
  )

describe('SIRI-UX-373: data-testid on new-company buttons', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve([{ id: 'c1', name: 'Acme' }]),
      } as Response)
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders + New Company button with data-testid="new-company-btn"', () => {
    renderPage()
    expect(screen.getByTestId('new-company-btn')).toBeInTheDocument()
  })

  it('renders modal Create button with data-testid="new-company-create-btn" after opening modal', async () => {
    renderPage()
    const openBtn = screen.getByTestId('new-company-btn')
    fireEvent.click(openBtn)
    expect(screen.getByTestId('new-company-create-btn')).toBeInTheDocument()
  })
})
