/**
 * SIRI-UX-155: CompanyPage — Agent creation modal missing useFocusTrap
 *
 * The Add Agent modal has aria-modal and Escape key handling, but Tab focus
 * can escape to the background. The fix: apply useFocusTrap to the modal content div.
 */
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import CompanyPage from '../components/CompanyPage'

function renderCompanyPage() {
  return render(
    <MemoryRouter initialEntries={['/companies/c1']}>
      <Routes>
        <Route path="/companies/:id" element={<CompanyPage />} />
      </Routes>
    </MemoryRouter>
  )
}

beforeEach(() => {
  vi.spyOn(globalThis, 'fetch').mockImplementation((url: RequestInfo | URL) => {
    const urlStr = url.toString()
    if (urlStr.includes('/tasks')) {
      return Promise.resolve({ ok: true, json: async () => [] } as Response)
    }
    if (urlStr.includes('/agents')) {
      return Promise.resolve({ ok: true, json: async () => [] } as Response)
    }
    // company endpoint
    return Promise.resolve({ ok: true, json: async () => ({ id: 'c1', name: 'Test Co' }) } as Response)
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('SIRI-UX-155: CompanyPage agent modal focus trap', () => {
  it('agent form modal has role="dialog" and aria-modal="true"', async () => {
    renderCompanyPage()

    // Navigate to agents tab
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /agents/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('tab', { name: /agents/i }))

    await waitFor(() => {
      expect(screen.getAllByText(/\+ add agent/i).length).toBeGreaterThan(0)
    })

    // Use the header-area "+ Add Agent" button
    const addAgentBtns = screen.getAllByText(/\+ add agent/i)
    fireEvent.click(addAgentBtns[0])

    await waitFor(() => {
      expect(screen.getByTestId('agent-form-modal')).toBeInTheDocument()
    })

    const modal = screen.getByTestId('agent-form-modal')
    expect(modal).toHaveAttribute('role', 'dialog')
    expect(modal).toHaveAttribute('aria-modal', 'true')
  })

  it('agent form modal content has a ref for focus trap', async () => {
    renderCompanyPage()

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /agents/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('tab', { name: /agents/i }))

    await waitFor(() => {
      expect(screen.getAllByText(/\+ add agent/i).length).toBeGreaterThan(0)
    })

    const addAgentBtns = screen.getAllByText(/\+ add agent/i)
    fireEvent.click(addAgentBtns[0])

    await waitFor(() => {
      expect(screen.getByTestId('agent-form-modal')).toBeInTheDocument()
    })

    // The inner modal content div should have data-testid for focus trap content
    const modalContent = screen.getByTestId('agent-form-modal-content')
    expect(modalContent).toBeInTheDocument()
  })
})
