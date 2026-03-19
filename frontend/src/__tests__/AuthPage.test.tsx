import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import AuthPage from '../components/AuthPage'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

// Mutable store mock — tests can override login/token
const mockStore = {
  token: null as string | null,
  user: null as { id: string; email: string } | null,
  isLoading: false,
  error: null as string | null,
  isInitialized: true,
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
  clearError: vi.fn(),
}

vi.mock('../store/authStore', () => ({
  useAuthStore: vi.fn((selector?: (s: typeof mockStore) => unknown) => {
    if (typeof selector === 'function') return selector(mockStore)
    return mockStore
  }),
  // Static getState() used in handleSubmit after login
  useAuthStore_getState: vi.fn(() => mockStore),
}))

// Patch useAuthStore.getState on the mock
import { useAuthStore } from '../store/authStore'
;(useAuthStore as unknown as { getState: () => typeof mockStore }).getState = () => mockStore

function renderAuthPage(initialPath = '/auth', locationState?: object) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: initialPath, state: locationState }]}>
      <AuthPage />
    </MemoryRouter>
  )
}

describe('AuthPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockStore.token = null
    mockStore.error = null
    mockStore.isLoading = false
    mockStore.login = vi.fn()
    mockStore.register = vi.fn()
  })

  it('renders without crash', () => {
    renderAuthPage()
    expect(screen.getByTestId('auth-page')).toBeInTheDocument()
  })

  it('shows Sign In and Sign Up tabs', () => {
    renderAuthPage()
    const tabs = screen.getAllByRole('button', { name: /sign in|sign up/i })
    const tabTexts = tabs.map((t) => t.textContent)
    expect(tabTexts).toContain('Sign In')
    expect(tabTexts).toContain('Sign Up')
  })

  it('shows email and password fields', () => {
    renderAuthPage()
    expect(screen.getByPlaceholderText(/email/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/password/i)).toBeInTheDocument()
  })

  it('shows submit button with Sign In text', () => {
    renderAuthPage()
    const buttons = screen.getAllByRole('button')
    const submitBtn = buttons.find((b) => b.getAttribute('type') === 'submit')
    expect(submitBtn).toBeTruthy()
    expect(submitBtn?.textContent).toContain('Sign In')
  })

  it('switches to Sign Up tab on click — submit button shows Sign Up', () => {
    renderAuthPage()
    const allButtons = screen.getAllByRole('button')
    const signUpTabBtn = allButtons.find(
      (b) => b.textContent === 'Sign Up' && b.getAttribute('type') === 'button'
    )
    expect(signUpTabBtn).toBeTruthy()
    fireEvent.click(signUpTabBtn!)
    const buttons = screen.getAllByRole('button')
    const submitBtn = buttons.find((b) => b.getAttribute('type') === 'submit')
    expect(submitBtn?.textContent).toContain('Sign Up')
  })

  it('renders AgentCo title', () => {
    renderAuthPage()
    expect(screen.getByText('AgentCo')).toBeInTheDocument()
  })

  // UX-POLISH-006: no duplicate label+placeholder, Forgot password link present
  it('does not render duplicate label for email field', () => {
    renderAuthPage()
    // Labels removed — only placeholder remains
    expect(screen.queryByText(/^Email$/)).not.toBeInTheDocument()
    expect(screen.queryByText(/^Password$/)).not.toBeInTheDocument()
    expect(screen.getByPlaceholderText('Email')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Password')).toBeInTheDocument()
  })

  it('shows Forgot password? text (coming soon — not a broken link)', () => {
    renderAuthPage()
    // SIRI-UX-036: /forgot-password route doesn't exist — now shown as disabled span with tooltip
    expect(screen.getByText(/forgot password/i)).toBeInTheDocument()
    // Should NOT be a link anymore
    expect(screen.queryByRole('link', { name: /forgot password/i })).toBeNull()
  })

  // BUG-010: after login redirect to original URL
  describe('BUG-010: redirect to original URL after login', () => {
    it('navigates to / by default when no from state', async () => {
      mockStore.login = vi.fn(async () => {
        mockStore.token = 'new-token'
      })
      renderAuthPage('/auth')

      fireEvent.change(screen.getByPlaceholderText(/email/i), {
        target: { value: 'test@example.com' },
      })
      fireEvent.change(screen.getByPlaceholderText(/password/i), {
        target: { value: 'password123' },
      })
      fireEvent.submit(screen.getByTestId('auth-page').querySelector('form')!)

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true })
      })
    })

    it('navigates to original URL when from state is set', async () => {
      mockStore.login = vi.fn(async () => {
        mockStore.token = 'new-token'
      })
      renderAuthPage('/auth', { from: { pathname: '/companies/abc' } })

      fireEvent.change(screen.getByPlaceholderText(/email/i), {
        target: { value: 'test@example.com' },
      })
      fireEvent.change(screen.getByPlaceholderText(/password/i), {
        target: { value: 'password123' },
      })
      fireEvent.submit(screen.getByTestId('auth-page').querySelector('form')!)

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/companies/abc', { replace: true })
      })
    })

    it('does NOT navigate when login fails (token stays null)', async () => {
      mockStore.login = vi.fn(async () => {
        // token stays null, error set
        mockStore.error = 'Invalid credentials'
      })
      renderAuthPage('/auth', { from: { pathname: '/companies/abc' } })

      fireEvent.change(screen.getByPlaceholderText(/email/i), {
        target: { value: 'test@example.com' },
      })
      fireEvent.change(screen.getByPlaceholderText(/password/i), {
        target: { value: 'wrongpass' },
      })
      fireEvent.submit(screen.getByTestId('auth-page').querySelector('form')!)

      await waitFor(() => {
        expect(mockStore.login).toHaveBeenCalled()
      })
      expect(mockNavigate).not.toHaveBeenCalled()
    })
  })
})
