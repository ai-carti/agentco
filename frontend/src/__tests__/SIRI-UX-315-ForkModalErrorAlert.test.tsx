/**
 * SIRI-UX-315: ForkModal error <p> missing role="alert"
 * ForkModal renders error messages without role="alert" — screen readers won't
 * announce fork failures. Same pattern fixed in SIRI-UX-300/301/304/306.
 */
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ToastProvider } from '../context/ToastContext'
import userEvent from '@testing-library/user-event'
import LibraryPage from '../components/LibraryPage'

describe('SIRI-UX-315: ForkModal error role="alert"', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (String(url).includes('/api/library')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([{ id: 'agent-1', name: 'TestBot', role: 'SWE' }]),
        })
      }
      if (String(url).includes('/api/companies') && !String(url).includes('fork')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([{ id: 'co-1', name: 'Acme' }]),
        })
      }
      // Fork endpoint fails
      return Promise.resolve({ ok: false, status: 500 })
    }) as typeof fetch
  })

  it('ForkModal error paragraph has role="alert" so screen reader announces failures', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <ToastProvider>
          <LibraryPage />
        </ToastProvider>
      </MemoryRouter>
    )

    // Wait for agents to load and open fork modal
    const forkBtn = await screen.findByTestId('fork-btn-agent-1')
    await user.click(forkBtn)

    // Fork modal opens — click company to trigger fork (which will fail)
    const companyBtn = await screen.findByTestId('fork-company-co-1')
    await user.click(companyBtn)

    // Error should appear with role="alert"
    const alertEl = await screen.findByRole('alert')
    expect(alertEl.tagName.toLowerCase()).toBe('p')
    expect(alertEl.textContent).toContain('Failed to fork')
  })
})
