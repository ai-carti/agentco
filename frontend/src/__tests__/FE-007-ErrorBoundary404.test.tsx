import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import ErrorBoundary from '../components/ErrorBoundary'
import NotFoundPage from '../components/NotFoundPage'
import App from '../App'

// Mock auth to simulate authenticated user
const mockAuthStore = {
  token: 'test-token',
  user: { id: '1', email: 'siri@agentco.dev' },
  isLoading: false,
  error: null,
  isInitialized: true,
  initAuth: vi.fn(),
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
  clearError: vi.fn(),
}

vi.mock('../store/authStore', () => ({
  useAuthStore: vi.fn((selector?: (s: typeof mockAuthStore) => unknown) => {
    if (typeof selector === 'function') return selector(mockAuthStore)
    return mockAuthStore
  }),
}))

// Component that throws on render
function BrokenComponent(): React.ReactElement {
  throw new Error('Test crash')
}

describe('FE-007: ErrorBoundary + 404 page', () => {
  it('ErrorBoundary shows fallback UI when child throws', () => {
    // Suppress console.error for expected error
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <ErrorBoundary>
        <BrokenComponent />
      </ErrorBoundary>,
    )
    expect(screen.getByTestId('error-boundary-fallback')).toBeInTheDocument()
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument()
    consoleSpy.mockRestore()
  })

  it('ErrorBoundary fallback has a reload/retry button', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <ErrorBoundary>
        <BrokenComponent />
      </ErrorBoundary>,
    )
    expect(screen.getByTestId('error-boundary-reload-btn')).toBeInTheDocument()
    consoleSpy.mockRestore()
  })

  it('NotFoundPage renders 404 content', () => {
    render(
      <MemoryRouter>
        <NotFoundPage />
      </MemoryRouter>,
    )
    expect(screen.getByTestId('not-found-page')).toBeInTheDocument()
    expect(screen.getByText(/page not found/i)).toBeInTheDocument()
  })

  it('NotFoundPage has a "Go home" button', () => {
    render(
      <MemoryRouter>
        <NotFoundPage />
      </MemoryRouter>,
    )
    expect(screen.getByTestId('not-found-home-btn')).toBeInTheDocument()
  })

  it('App renders NotFoundPage for unknown routes (authenticated)', () => {
    render(
      <MemoryRouter initialEntries={['/this-route-does-not-exist-xyz']}>
        <App />
      </MemoryRouter>,
    )
    expect(screen.getByTestId('not-found-page')).toBeInTheDocument()
  })

  it('ErrorBoundary does NOT swallow children when no error', () => {
    render(
      <ErrorBoundary>
        <div data-testid="healthy-child">Works fine</div>
      </ErrorBoundary>,
    )
    expect(screen.getByTestId('healthy-child')).toBeInTheDocument()
    expect(screen.queryByTestId('error-boundary-fallback')).not.toBeInTheDocument()
  })
})
