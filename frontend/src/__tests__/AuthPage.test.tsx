import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import AuthPage from '../components/AuthPage'

// Mock the authStore
vi.mock('../store/authStore', () => ({
  useAuthStore: vi.fn(() => ({
    token: null,
    user: null,
    isLoading: false,
    error: null,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
  })),
}))

describe('AuthPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders without crash', () => {
    render(<AuthPage />)
    expect(screen.getByTestId('auth-page')).toBeInTheDocument()
  })

  it('shows Sign In and Sign Up tabs', () => {
    render(<AuthPage />)
    // Both tab buttons should be present
    const tabs = screen.getAllByRole('button', { name: /sign in|sign up/i })
    const tabTexts = tabs.map((t) => t.textContent)
    expect(tabTexts).toContain('Sign In')
    expect(tabTexts).toContain('Sign Up')
  })

  it('shows email and password fields', () => {
    render(<AuthPage />)
    expect(screen.getByPlaceholderText(/email/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/password/i)).toBeInTheDocument()
  })

  it('shows submit button with Sign In text', () => {
    render(<AuthPage />)
    // The submit button is type="submit"
    const buttons = screen.getAllByRole('button')
    const submitBtn = buttons.find((b) => b.getAttribute('type') === 'submit')
    expect(submitBtn).toBeTruthy()
    expect(submitBtn?.textContent).toContain('Sign In')
  })

  it('switches to Sign Up tab on click — submit button shows Sign Up', () => {
    render(<AuthPage />)
    // Find the tab button (type=button) for Sign Up
    const allButtons = screen.getAllByRole('button')
    const signUpTabBtn = allButtons.find(
      (b) => b.textContent === 'Sign Up' && b.getAttribute('type') === 'button'
    )
    expect(signUpTabBtn).toBeTruthy()
    fireEvent.click(signUpTabBtn!)
    // After switching, submit button should say "Sign Up"
    const buttons = screen.getAllByRole('button')
    const submitBtn = buttons.find((b) => b.getAttribute('type') === 'submit')
    expect(submitBtn?.textContent).toContain('Sign Up')
  })

  it('renders AgentCo title', () => {
    render(<AuthPage />)
    expect(screen.getByText('AgentCo')).toBeInTheDocument()
  })
})
