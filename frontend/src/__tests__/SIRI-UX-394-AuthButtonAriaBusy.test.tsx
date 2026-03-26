/**
 * SIRI-UX-394 — AuthPage submit button missing aria-busy when isLoading=true
 *
 * The submit button shows "Loading…" text but has no aria-busy attribute.
 * Screen readers should be told the button is busy via aria-busy="true".
 */
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import AuthPage from '../components/AuthPage'
import { useAuthStore } from '../store/authStore'

beforeEach(() => {
  vi.clearAllMocks()
  useAuthStore.setState({ token: null, error: null, isLoading: false })
})

describe('SIRI-UX-394 AuthPage — submit button aria-busy', () => {
  it('submit button has aria-busy="false" initially', () => {
    render(<MemoryRouter><AuthPage /></MemoryRouter>)
    const btn = screen.getByRole('button', { name: /sign in/i })
    expect(btn).toHaveAttribute('aria-busy', 'false')
  })

  it('submit button has aria-busy="true" while loading', () => {
    // Simulate loading state
    useAuthStore.setState({ isLoading: true })
    render(<MemoryRouter><AuthPage /></MemoryRouter>)
    const btn = screen.getByRole('button', { name: /loading/i })
    expect(btn).toHaveAttribute('aria-busy', 'true')
  })
})
