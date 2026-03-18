/**
 * SIRI-UX-015: CompaniesPage company items should be keyboard accessible
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import CompaniesPage from '../components/CompaniesPage'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

// Mock ToastContext
vi.mock('../context/ToastContext', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }),
  ToastProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

beforeEach(() => {
  vi.clearAllMocks()
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => [{ id: 'c1', name: 'Acme Corp' }],
  })
})

function renderPage() {
  return render(
    <MemoryRouter>
      <CompaniesPage />
    </MemoryRouter>,
  )
}

describe('SIRI-UX-015: CompaniesPage keyboard accessibility', () => {
  it('company items have tabIndex=0 for keyboard navigation', async () => {
    renderPage()
    await waitFor(() => {
      const item = screen.getByTestId('company-item-c1')
      expect(item).toHaveAttribute('tabindex', '0')
    })
  })

  it('company items have role="button" for screen readers', async () => {
    renderPage()
    await waitFor(() => {
      const item = screen.getByTestId('company-item-c1')
      expect(item).toHaveAttribute('role', 'button')
    })
  })

  it('Enter key navigates to company page', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByTestId('company-item-c1')).toBeInTheDocument()
    })
    fireEvent.keyDown(screen.getByTestId('company-item-c1'), { key: 'Enter', code: 'Enter' })
    expect(mockNavigate).toHaveBeenCalledWith('/companies/c1')
  })

  it('Space key navigates to company page', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByTestId('company-item-c1')).toBeInTheDocument()
    })
    fireEvent.keyDown(screen.getByTestId('company-item-c1'), { key: ' ', code: 'Space' })
    expect(mockNavigate).toHaveBeenCalledWith('/companies/c1')
  })
})
