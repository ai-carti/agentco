/**
 * SIRI-UX-382: CompaniesPage "New Company" modal input missing aria-label
 * The input has no <label> element — only a placeholder attribute.
 * Placeholder is not a reliable accessible name (WCAG 1.3.1).
 * Fix: add aria-label="Company name" on the input.
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

describe('SIRI-UX-382: CompaniesPage modal input aria-label', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve([]),
      } as Response)
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('new-company-name-input has aria-label="Company name"', () => {
    renderPage()
    // Open modal
    const openBtn = screen.getByTestId('new-company-btn')
    fireEvent.click(openBtn)
    // Input should have an accessible name via aria-label
    const input = screen.getByTestId('new-company-name-input')
    expect(input).toHaveAttribute('aria-label', 'Company name')
  })
})
