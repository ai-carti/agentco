/**
 * SIRI-UX-127: CompanyPage error state tests
 * Verifies that fetch errors on /companies/:id, /tasks, /agents
 * result in a visible <div role="alert"> in the DOM instead of a silent empty page.
 */
import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ToastProvider } from '../context/ToastContext'
import CompanyPage from '../components/CompanyPage'
import { useAgentStore } from '../store/agentStore'
import { useAuthStore } from '../store/authStore'

// Mock heavy child components to avoid WS / Kanban complexity
vi.mock('../components/WarRoomPage', () => ({
  default: () => <div data-testid="war-room-page">War Room</div>,
}))
vi.mock('../components/KanbanBoard', () => ({
  default: () => <div data-testid="kanban-board">Kanban</div>,
}))

function renderCompanyPage() {
  return render(
    <MemoryRouter initialEntries={['/companies/c1']}>
      <Routes>
        <Route
          path="/companies/:id"
          element={
            <ToastProvider>
              <CompanyPage />
            </ToastProvider>
          }
        />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  useAuthStore.setState({ token: 'test-token' })
  useAgentStore.setState({ currentCompany: null, agents: [], tasks: [] })
  vi.clearAllMocks()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('SIRI-UX-127: CompanyPage shows error state on fetch failures', () => {
  it('shows role=alert when /companies/:id returns 500', async () => {
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/agents')) {
        return Promise.resolve({ ok: true, json: async () => [] })
      }
      if (url.includes('/tasks')) {
        return Promise.resolve({ ok: true, json: async () => [] })
      }
      // company endpoint fails
      return Promise.resolve({ ok: false, status: 500, json: async () => ({}) })
    })

    renderCompanyPage()

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
  })

  it('shows role=alert when /tasks returns 401', async () => {
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/agents')) {
        return Promise.resolve({ ok: true, json: async () => [] })
      }
      if (url.includes('/tasks')) {
        return Promise.resolve({ ok: false, status: 401, json: async () => ({}) })
      }
      return Promise.resolve({ ok: true, json: async () => ({ id: 'c1', name: 'TestCo' }) })
    })

    renderCompanyPage()

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
  })

  it('shows role=alert when /agents returns 403', async () => {
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/agents')) {
        return Promise.resolve({ ok: false, status: 403, json: async () => ({}) })
      }
      if (url.includes('/tasks')) {
        return Promise.resolve({ ok: true, json: async () => [] })
      }
      return Promise.resolve({ ok: true, json: async () => ({ id: 'c1', name: 'TestCo' }) })
    })

    renderCompanyPage()

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
  })

  it('shows role=alert when fetch rejects (network error)', async () => {
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/agents')) {
        return Promise.resolve({ ok: true, json: async () => [] })
      }
      if (url.includes('/tasks')) {
        return Promise.resolve({ ok: true, json: async () => [] })
      }
      // network-level rejection
      return Promise.reject(new Error('Network failure'))
    })

    renderCompanyPage()

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
  })

  it('alert contains meaningful error text', async () => {
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/agents')) {
        return Promise.resolve({ ok: true, json: async () => [] })
      }
      if (url.includes('/tasks')) {
        return Promise.resolve({ ok: true, json: async () => [] })
      }
      return Promise.resolve({ ok: false, status: 500, json: async () => ({}) })
    })

    renderCompanyPage()

    await waitFor(() => {
      const alert = screen.getByRole('alert')
      expect(alert.textContent).toBeTruthy()
      expect(alert.textContent!.length).toBeGreaterThan(0)
    })
  })

  it('does NOT show role=alert when all fetches succeed', async () => {
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/agents')) {
        return Promise.resolve({ ok: true, json: async () => [] })
      }
      if (url.includes('/tasks')) {
        return Promise.resolve({ ok: true, json: async () => [] })
      }
      return Promise.resolve({ ok: true, json: async () => ({ id: 'c1', name: 'TestCo' }) })
    })

    renderCompanyPage()

    // Wait a bit for fetches to complete
    await waitFor(() => {
      expect(screen.getByTestId('company-page')).toBeInTheDocument()
    })

    // Allow async effects to settle
    await new Promise((r) => setTimeout(r, 100))

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
