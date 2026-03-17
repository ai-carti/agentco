import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import App from '../App'

// Mock all page components to isolate routing logic
vi.mock('../components/AuthPage', () => ({
  default: () => <div data-testid="auth-page">AuthPage</div>,
}))
vi.mock('../components/WarRoom', () => ({
  default: () => <div data-testid="war-room">WarRoom</div>,
}))
vi.mock('../components/KanbanBoard', () => ({
  default: () => <div data-testid="kanban-board">KanbanBoard</div>,
}))
vi.mock('../components/WarRoomPage', () => ({
  default: () => <div data-testid="war-room-page">WarRoomPage</div>,
}))

// We'll control the token value per-test
const mockAuthStore = {
  token: null as string | null,
  user: null as { id: string; email: string } | null,
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

function renderWithRouter(route = '/') {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <App />
    </MemoryRouter>,
  )
}

describe('Routing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthStore.token = null
    mockAuthStore.user = null
    mockAuthStore.isInitialized = true
  })

  describe('unauthenticated user', () => {
    it('redirects / to /auth when no token', () => {
      renderWithRouter('/')
      expect(screen.getByTestId('auth-page')).toBeInTheDocument()
    })

    it('redirects /companies/123 to /auth when no token', () => {
      renderWithRouter('/companies/123')
      expect(screen.getByTestId('auth-page')).toBeInTheDocument()
    })

    it('redirects /settings to /auth when no token', () => {
      renderWithRouter('/settings')
      expect(screen.getByTestId('auth-page')).toBeInTheDocument()
    })

    it('shows auth page at /auth', () => {
      renderWithRouter('/auth')
      expect(screen.getByTestId('auth-page')).toBeInTheDocument()
    })
  })

  describe('authenticated user', () => {
    beforeEach(() => {
      mockAuthStore.token = 'test-token'
      mockAuthStore.user = { id: '1', email: 'siri@agentco.dev' }
    })

    it('renders company list at /', () => {
      renderWithRouter('/')
      expect(screen.getByTestId('companies-page')).toBeInTheDocument()
    })

    it('renders war room + kanban at /companies/:id', () => {
      renderWithRouter('/companies/abc')
      expect(screen.getByTestId('war-room')).toBeInTheDocument()
      expect(screen.getByTestId('kanban-board')).toBeInTheDocument()
    })

    it('renders agent page at /companies/:id/agents/:agentId', () => {
      renderWithRouter('/companies/abc/agents/agent-1')
      expect(screen.getByTestId('agent-page')).toBeInTheDocument()
    })

    it('renders war room page at /companies/:id/warroom', () => {
      renderWithRouter('/companies/abc/warroom')
      expect(screen.getByTestId('war-room-page')).toBeInTheDocument()
    })

    it('renders settings page at /settings', () => {
      renderWithRouter('/settings')
      expect(screen.getByTestId('settings-page')).toBeInTheDocument()
    })

    it('shows navbar with navigation links', () => {
      renderWithRouter('/')
      expect(screen.getByTestId('navbar')).toBeInTheDocument()
      expect(screen.getAllByRole('link', { name: /companies/i }).length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByRole('link', { name: /settings/i }).length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('deep link', () => {
    beforeEach(() => {
      mockAuthStore.token = 'test-token'
      mockAuthStore.user = { id: '1', email: 'siri@agentco.dev' }
    })

    it('directly navigating to /companies/:id renders company page', () => {
      renderWithRouter('/companies/deep-link-id')
      expect(screen.getByTestId('war-room')).toBeInTheDocument()
    })

    it('directly navigating to /companies/:id/agents/:agentId renders agent page', () => {
      renderWithRouter('/companies/c1/agents/a1')
      expect(screen.getByTestId('agent-page')).toBeInTheDocument()
    })
  })

  // BUG-011: race condition — isInitialized=false must show spinner, not redirect
  describe('BUG-011: race condition on page refresh', () => {
    it('renders null (spinner) when isInitialized=false, even with no token', () => {
      mockAuthStore.token = null
      mockAuthStore.isInitialized = false
      const { container } = renderWithRouter('/companies/deep-link-id')
      // ProtectedRoute returns null while initializing — auth-page should NOT appear
      expect(screen.queryByTestId('auth-page')).not.toBeInTheDocument()
      // container may be mostly empty (just the layout shell)
      expect(container).toBeTruthy()
    })

    it('redirects to /auth only after isInitialized=true with no token', () => {
      mockAuthStore.token = null
      mockAuthStore.isInitialized = true
      renderWithRouter('/companies/deep-link-id')
      expect(screen.getByTestId('auth-page')).toBeInTheDocument()
    })

    it('renders protected page after isInitialized=true with valid token', () => {
      mockAuthStore.token = 'valid-token'
      mockAuthStore.user = { id: '1', email: 'siri@agentco.dev' }
      mockAuthStore.isInitialized = true
      renderWithRouter('/companies/deep-link-id')
      expect(screen.getByTestId('war-room')).toBeInTheDocument()
    })
  })
})
