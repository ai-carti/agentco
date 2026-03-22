/**
 * SIRI-UX-148: CompaniesPage shows error banner when fetch fails
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// Mock ToastContext
vi.mock('../context/ToastContext', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}))

describe('SIRI-UX-148: CompaniesPage error state', () => {
  beforeEach(() => {
    // Simulate network failure
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'))
  })

  it('shows an error banner when companies fetch fails', async () => {
    await act(async () => {
      const { default: CompaniesPage } = await import('../components/CompaniesPage')
      render(
        <MemoryRouter>
          <CompaniesPage />
        </MemoryRouter>
      )
    })

    // Should show error alert, not a blank page
    const alert = screen.getByRole('alert')
    expect(alert).toBeInTheDocument()
    expect(alert.textContent).toMatch(/failed to load|error|try again/i)
  })
})
