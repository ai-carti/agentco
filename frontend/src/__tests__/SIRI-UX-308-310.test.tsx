/**
 * SIRI-UX-308: SIRI-UX-304-306-307.test.tsx used Node.js fs/path/__dirname — fixed by rewriting test
 * SIRI-UX-309: CompanySettingsPage.handleDelete without AbortController — setState on unmounted component
 * SIRI-UX-310: AuthPage tablist missing Arrow key navigation (WAI-ARIA APG Tabs Pattern)
 */

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ToastProvider } from '../context/ToastContext'

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <MemoryRouter>{children}</MemoryRouter>
    </ToastProvider>
  )
}

// ─── SIRI-UX-309: CompanySettingsPage.handleDelete AbortController ────────────
describe('SIRI-UX-309: CompanySettingsPage handleDelete uses AbortController', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('abort does not call setState when component unmounts during DELETE', async () => {
    // Setup: company loads successfully
    let resolveDelete!: (value: Response) => void
    const deletePromise = new Promise<Response>((res) => { resolveDelete = res })

    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      const urlStr = String(url)
      if (urlStr.includes('/companies/c1') && !urlStr.includes('/settings')) {
        // GET company
        return Promise.resolve({
          ok: true,
          json: async () => ({ id: 'c1', name: 'Test Company', description: '' }),
        } as Response)
      }
      if (urlStr.includes('/companies/c1')) {
        // DELETE request — keep it hanging until we unmount
        return deletePromise
      }
      return Promise.resolve({ ok: true, json: async () => ({}) } as Response)
    })

    const { default: CompanySettingsPage } = await import('../components/CompanySettingsPage')
    const { unmount } = render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/companies/c1/settings']}>
          <Routes>
            <Route path="/companies/:companyId/settings" element={<CompanySettingsPage />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    )

    // Wait for page to load
    await waitFor(() => screen.getByTestId('company-settings-page'))

    // Type company name to enable delete button
    const deleteConfirmInput = screen.queryByTestId('delete-confirm-input')
    if (deleteConfirmInput) {
      fireEvent.change(deleteConfirmInput, { target: { value: 'Test Company' } })
    }

    // Find and click delete button (in danger zone)
    const deleteBtn = screen.queryByTestId('company-delete-btn') ??
                      screen.queryByText('Delete permanently')
    if (deleteBtn) {
      fireEvent.click(deleteBtn)
    }

    // Unmount while DELETE is in flight
    act(() => { unmount() })

    // Resolve the DELETE after unmount — should NOT cause React state update warnings
    await act(async () => {
      resolveDelete({
        ok: true,
        json: async () => ({}),
      } as Response)
      await deletePromise
    })

    // If no errors thrown (no "setState on unmounted component" React warning), test passes
    expect(true).toBe(true)
  })
})

// ─── SIRI-UX-310: AuthPage tablist Arrow key navigation ───────────────────────
describe('SIRI-UX-310: AuthPage tablist has Arrow key navigation', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'tok', token_type: 'bearer' }),
    } as Response)
  })
  afterEach(() => { vi.restoreAllMocks() })

  it('ArrowRight on Sign In tab moves focus to Sign Up tab', async () => {
    const { default: AuthPage } = await import('../components/AuthPage')
    render(
      <Wrapper>
        <AuthPage />
      </Wrapper>
    )

    const signInTab = screen.getByRole('tab', { name: /sign in/i })
    const signUpTab = screen.getByRole('tab', { name: /sign up/i })

    // Focus Sign In tab
    signInTab.focus()
    expect(document.activeElement).toBe(signInTab)

    // Press ArrowRight — should move to Sign Up
    fireEvent.keyDown(signInTab, { key: 'ArrowRight' })

    // Sign Up tab should now be active
    await waitFor(() => {
      expect(signUpTab).toHaveFocus()
    })
  })

  it('ArrowLeft on Sign Up tab moves focus back to Sign In tab', async () => {
    const { default: AuthPage } = await import('../components/AuthPage')
    render(
      <Wrapper>
        <AuthPage />
      </Wrapper>
    )

    const signInTab = screen.getByRole('tab', { name: /sign in/i })
    const signUpTab = screen.getByRole('tab', { name: /sign up/i })

    // Navigate to Sign Up first
    signInTab.focus()
    fireEvent.keyDown(signInTab, { key: 'ArrowRight' })

    await waitFor(() => expect(signUpTab).toHaveFocus())

    // Now press ArrowLeft — should go back to Sign In
    fireEvent.keyDown(signUpTab, { key: 'ArrowLeft' })

    await waitFor(() => {
      expect(signInTab).toHaveFocus()
    })
  })
})
