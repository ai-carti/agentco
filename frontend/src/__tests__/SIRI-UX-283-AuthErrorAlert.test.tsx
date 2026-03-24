/**
 * SIRI-UX-283: AuthPage error div missing role="alert".
 * Screen readers do not auto-announce errors (wrong password, etc.) to users
 * because the error element has no live region. Fix: add role="alert" to error div.
 */
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import AuthPage from '../components/AuthPage'

vi.mock('../store/authStore', () => ({
  useAuthStore: (selector: (s: unknown) => unknown) => {
    const state = {
      login: vi.fn(),
      register: vi.fn(),
      isLoading: false,
      error: 'Invalid credentials',
      token: null,
    }
    return typeof selector === 'function' ? selector(state) : state
  },
}))

describe('SIRI-UX-283: AuthPage error has role=alert', () => {
  it('error message div has role="alert" for screen reader auto-announcement', () => {
    render(
      <MemoryRouter>
        <AuthPage />
      </MemoryRouter>
    )
    // Error should be in a live region
    const alert = screen.getByRole('alert')
    expect(alert).toBeInTheDocument()
    expect(alert).toHaveTextContent('Invalid credentials')
  })
})
