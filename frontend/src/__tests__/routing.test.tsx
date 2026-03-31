import { render, screen, waitFor } from '@testing-library/react'
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
// SIRI-UX-449: WarRoomPage is no longer a top-level lazy route — it's embedded in CompanyPage.
// Mock is kept for CompanyPage's internal import but not tested as a standalone route.
vi.mock('../components/WarRoomPage', () => ({
  default: () => <div data-testid="war-room-page">WarRoomPage</div>,
}))
vi.mock('../components/CompaniesPage', () => ({
  default: () => <div data-testid="companies-page">CompaniesPage</div>,
}))
vi.mock('../components/CompanyPage', () => ({
  default: () => <div data-testid="war-room-page">CompanyPage</div>,
}))
vi.mock('../components/AgentPage', () => ({
  default: () => <div data-testid="agent-page">AgentPage</div>,
}))
vi.mock('../components/AgentEditPage', () => ({
  default: () => <div data-testid="agent-edit-page">AgentEditPage</div>,
}))
vi.mock('../components/SettingsPage', () => ({
  default: () => <div data-testid="settings-page">SettingsPage</div>,
}))
vi.mock('../components/CompanySettingsPage', () => ({
  default: () => <div data-testid="company-settings-page">CompanySettingsPage</div>,
}))
vi.mock('../components/OnboardingPage', () => ({
  default: () => <div data-testid="onboarding-page">OnboardingPage</div>,
}))
vi.mock('../components/LibraryPage', () => ({
  default: () => <div data-testid="library-page">LibraryPage</div>,
}))
vi.mock('../components/LibraryPortfolioPage', () => ({
  default: () => <div data-testid="library-portfolio-page">LibraryPortfolioPage</div>,
}))
vi.mock('../pages/BillingPage', () => ({
  default: () => <div data-testid="billing-page">BillingPage</div>,
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

    it('renders company list at /', async () => {
      renderWithRouter('/')
      await waitFor(() => expect(screen.getByTestId('companies-page')).toBeInTheDocument())
    })

    it('renders war room + kanban at /companies/:id', async () => {
      renderWithRouter('/companies/abc')
      // CompanyPage (mocked as war-room-page testid) renders at /companies/:id
      await waitFor(() => expect(screen.getByTestId('war-room-page')).toBeInTheDocument())
    })

    it('renders agent page at /companies/:id/agents/:agentId', async () => {
      renderWithRouter('/companies/abc/agents/agent-1')
      await waitFor(() => expect(screen.getByTestId('agent-page')).toBeInTheDocument())
    })

    // SIRI-UX-449: /companies/:id/warroom route removed — dead route (War Room is a tab in CompanyPage)
    it('/companies/:id/warroom renders 404 (route no longer registered)', async () => {
      renderWithRouter('/companies/abc/warroom')
      await waitFor(() => expect(screen.getByTestId('not-found-page')).toBeInTheDocument())
    })

    it('renders settings page at /settings', async () => {
      renderWithRouter('/settings')
      await waitFor(() => expect(screen.getByTestId('settings-page')).toBeInTheDocument())
    })

    // SIRI-UX-044: Navbar has logo only; nav links live in Sidebar (single source of truth)
    it('shows navbar with logo; nav links are in Sidebar', () => {
      renderWithRouter('/')
      const navbar = screen.getByTestId('navbar')
      expect(navbar).toBeInTheDocument()
      // "AgentCo" logo is always present in navbar
      expect(navbar.querySelector('a[href="/"]')).toBeTruthy()
      // Navbar must NOT contain Companies/Settings nav links — those belong to Sidebar
      expect(navbar.querySelector('[data-testid="sidebar-nav-companies"]')).toBeNull()
      expect(navbar.querySelector('[data-testid="sidebar-nav-settings"]')).toBeNull()
      // Navigation links (Companies, Settings) come from Sidebar, not Navbar
      expect(screen.getAllByRole('link', { name: /companies/i }).length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByRole('link', { name: /settings/i }).length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('deep link', () => {
    beforeEach(() => {
      mockAuthStore.token = 'test-token'
      mockAuthStore.user = { id: '1', email: 'siri@agentco.dev' }
    })

    it('directly navigating to /companies/:id renders company page', async () => {
      renderWithRouter('/companies/deep-link-id')
      await waitFor(() => expect(screen.getByTestId('war-room-page')).toBeInTheDocument())
    })

    it('directly navigating to /companies/:id/agents/:agentId renders agent page', async () => {
      renderWithRouter('/companies/c1/agents/a1')
      await waitFor(() => expect(screen.getByTestId('agent-page')).toBeInTheDocument())
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

    it('renders protected page after isInitialized=true with valid token', async () => {
      mockAuthStore.token = 'valid-token'
      mockAuthStore.user = { id: '1', email: 'siri@agentco.dev' }
      mockAuthStore.isInitialized = true
      renderWithRouter('/companies/deep-link-id')
      await waitFor(() => expect(screen.getByTestId('war-room-page')).toBeInTheDocument())
    })
  })
})
