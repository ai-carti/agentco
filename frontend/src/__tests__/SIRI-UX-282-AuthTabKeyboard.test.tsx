/**
 * SIRI-UX-282: AuthPage tab buttons missing tabIndex management.
 * WAI-ARIA Authoring Practices Guide (APG) requires that in a tablist:
 * - only the active tab has tabIndex={0} (receives natural focus)
 * - inactive tabs have tabIndex={-1} (accessible only via ArrowLeft/ArrowRight)
 * Without this, Tab key lands on both tabs, which violates the roving tabindex pattern.
 */
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import AuthPage from '../components/AuthPage'

// Mock authStore
vi.mock('../store/authStore', () => ({
  useAuthStore: (selector: (s: unknown) => unknown) => {
    const state = { login: vi.fn(), register: vi.fn(), isLoading: false, error: null, token: null }
    return typeof selector === 'function' ? selector(state) : state
  },
}))

const renderAuth = () =>
  render(
    <MemoryRouter>
      <AuthPage />
    </MemoryRouter>
  )

describe('SIRI-UX-282: AuthPage tab roving tabindex', () => {
  it('active tab (Sign In) has tabIndex=0', () => {
    renderAuth()
    const signInTab = screen.getByRole('tab', { name: 'Sign In' })
    expect(signInTab).toHaveAttribute('tabindex', '0')
  })

  it('inactive tab (Sign Up) has tabIndex=-1', () => {
    renderAuth()
    const signUpTab = screen.getByRole('tab', { name: 'Sign Up' })
    expect(signUpTab).toHaveAttribute('tabindex', '-1')
  })
})
