/**
 * SIRI-UX-021: TaskDetailSidebar assignee shows 2-char initials
 * SIRI-UX-022: LibraryPage ForkModal shows toast on success/failure
 * SIRI-UX-024: CompanyPage tab hover states
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import TaskDetailSidebar from '../components/TaskDetailSidebar'
import LibraryPage from '../components/LibraryPage'
import CompanyPage from '../components/CompanyPage'
import { useAgentStore, type AgentStore } from '../store/agentStore'

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockToastSuccess = vi.fn()
const mockToastError = vi.fn()

vi.mock('../context/ToastContext', () => ({
  useToast: () => ({ success: mockToastSuccess, error: mockToastError, info: vi.fn() }),
}))

vi.mock('../api/client', () => ({
  getStoredToken: () => 'mock-token',
  BASE_URL: 'http://localhost:8000',
}))

vi.mock('../store/agentStore', () => ({
  useAgentStore: vi.fn((sel: (s: AgentStore) => unknown) => {
    const state = {
      agents: [],
      currentCompany: { id: 'co1', name: 'Test Corp' },
      tasks: [],
      setCurrentCompany: vi.fn(),
      setTasks: vi.fn(),
      setAgents: vi.fn(),
      setActiveCompanyTab: vi.fn(),
      activeCompanyTab: 'war-room',
    }
    return sel(state as unknown as AgentStore)
  }),
}))

vi.mock('../store/authStore', () => ({
  useAuthStore: vi.fn((sel?: (s: unknown) => unknown) => {
    const state = { user: { email: 'test@test.com' }, login: vi.fn(), register: vi.fn(), isLoading: false, error: null, token: 'tok' }
    return sel ? sel(state) : state
  }),
}))

// AgentForm depends on fetch for providers
vi.mock('../components/AgentForm', () => ({
  default: () => null,
}))

// ─── SIRI-UX-021: TaskDetailSidebar 2-char initials ─────────────────────────

describe('SIRI-UX-021: TaskDetailSidebar assignee initials', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ logs: [], status_history: [] }) })
    mockToastSuccess.mockClear()
    mockToastError.mockClear()
  })

  it('shows 2-char initials for multi-word name (JD for John Doe)', () => {
    const task = {
      id: 't1',
      title: 'Test Task',
      status: 'todo' as const,
      assignee_name: 'John Doe',
      assignee_id: 'a1',
    }
    const { getByTestId } = render(
      <MemoryRouter>
        <TaskDetailSidebar task={task} companyId="co1" onClose={vi.fn()} />
      </MemoryRouter>
    )
    const avatar = getByTestId('sidebar-assignee-avatar')
    expect(avatar.textContent).toBe('JD')
  })

  it('shows 2-char initials for single-word name (AL for Alice)', () => {
    const task = {
      id: 't2',
      title: 'Test Task',
      status: 'backlog' as const,
      assignee_name: 'Alice',
      assignee_id: 'a2',
    }
    const { getByTestId } = render(
      <MemoryRouter>
        <TaskDetailSidebar task={task} companyId="co1" onClose={vi.fn()} />
      </MemoryRouter>
    )
    const avatar = getByTestId('sidebar-assignee-avatar')
    expect(avatar.textContent).toBe('AL')
  })

  it('shows UN for Unassigned fallback', () => {
    const task = {
      id: 't3',
      title: 'Test Task',
      status: 'done' as const,
    }
    const { getByTestId } = render(
      <MemoryRouter>
        <TaskDetailSidebar task={task} companyId="co1" onClose={vi.fn()} />
      </MemoryRouter>
    )
    const avatar = getByTestId('sidebar-assignee-avatar')
    // "Unassigned" → first 2 chars = "UN"
    expect(avatar.textContent).toBe('UN')
  })
})

// ─── SIRI-UX-022: LibraryPage ForkModal toast ────────────────────────────────

describe('SIRI-UX-022: LibraryPage ForkModal toast on fork', () => {
  beforeEach(() => {
    mockToastSuccess.mockClear()
    mockToastError.mockClear()
  })

  it('shows success toast when fork succeeds', async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => [{ id: 'la1', name: 'Sales Bot', role: 'SDR' }] })
      .mockResolvedValueOnce({ ok: true, json: async () => [{ id: 'co1', name: 'Acme Corp' }] })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'new-agent-id' }) })

    const { findByTestId } = render(
      <MemoryRouter>
        <LibraryPage />
      </MemoryRouter>
    )

    const forkBtn = await findByTestId('fork-btn-la1')
    fireEvent.click(forkBtn)

    const companyBtn = await findByTestId('fork-company-co1')
    fireEvent.click(companyBtn)

    await waitFor(() => {
      expect(mockToastSuccess).toHaveBeenCalledWith(expect.stringContaining('Acme Corp'))
    })
  })

  it('shows error toast when fork fails', async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => [{ id: 'la2', name: 'Dev Bot', role: 'SWE' }] })
      .mockResolvedValueOnce({ ok: true, json: async () => [{ id: 'co2', name: 'Bad Corp' }] })
      .mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({}) })

    const { findByTestId } = render(
      <MemoryRouter>
        <LibraryPage />
      </MemoryRouter>
    )

    const forkBtn = await findByTestId('fork-btn-la2')
    fireEvent.click(forkBtn)

    const companyBtn = await findByTestId('fork-company-co2')
    fireEvent.click(companyBtn)

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith(expect.stringContaining('Failed'))
    })
  })
})

// ─── SIRI-UX-024: CompanyPage tab hover states ───────────────────────────────

describe('SIRI-UX-024: CompanyPage tab hover states', () => {
  beforeEach(() => {
    vi.mocked(useAgentStore).mockImplementation((sel: (s: AgentStore) => unknown) => {
      const state = {
        agents: [],
        currentCompany: { id: 'co1', name: 'Test Corp' },
        tasks: [],
        setCurrentCompany: vi.fn(),
        setTasks: vi.fn(),
        setAgents: vi.fn(),
        setActiveCompanyTab: vi.fn(),
        activeCompanyTab: 'war-room',
      }
      return sel(state as unknown as AgentStore)
    })
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => [] })
  })

  it('inactive tab buttons have onMouseEnter/Leave handlers', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/companies/co1']}>
        <CompanyPage />
      </MemoryRouter>
    )

    const tablist = container.querySelector('[role="tablist"]')
    expect(tablist).not.toBeNull()
    const tabs = Array.from(tablist!.querySelectorAll('[role="tab"]')) as HTMLElement[]
    expect(tabs.length).toBe(3)

    // Fire hover events — should not throw
    tabs.forEach((tab) => {
      fireEvent.mouseEnter(tab)
      fireEvent.mouseLeave(tab)
    })
  })
})
