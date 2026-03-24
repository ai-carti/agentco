/**
 * SIRI-UX-262: KanbanBoard.tsx — TaskCard uses JS onMouseEnter/onMouseLeave for hover
 *   Mutates borderColor (#374151→#6b7280) and boxShadow via JS handlers.
 *   Fix: add `.task-card` CSS class, remove JS hover handlers.
 *
 * SIRI-UX-263: CompanyPage.tsx — tab nav buttons use JS onMouseEnter/onMouseLeave for hover
 *   Mutate `color` (#64748b→#94a3b8) via JS when !isActive.
 *   Fix: add `.company-tab-btn` CSS class with :hover:not([aria-selected="true"]) style.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import KanbanBoard from '../components/KanbanBoard'
import CompanyPage from '../components/CompanyPage'
import { ToastProvider } from '../context/ToastContext'

// ─── shared mocks ─────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: false, json: vi.fn().mockResolvedValue([]) }),
  )
  vi.mock('../store/authStore', () => ({
    useAuthStore: (sel: (s: { token: string; user: null }) => unknown) =>
      sel({ token: 'test-token', user: null }),
  }))
  vi.mock('../store/agentStore', () => ({
    useAgentStore: (sel: (s: {
      currentCompany: { id: string; name: string }
      agents: Array<{ id: string; name: string; role: string }>
      tasks: Array<{ id: string; title: string; status: string; agent_id: string | null; description: string }>
      setTasks: () => void
      setActiveCompanyTab: (tab: string | null) => void
    }) => unknown) =>
      sel({
        currentCompany: { id: 'co-1', name: 'Acme' },
        agents: [],
        tasks: [
          { id: 'task-1', title: 'Do the thing', status: 'todo', agent_id: null, description: '' },
        ],
        setTasks: vi.fn(),
        setActiveCompanyTab: vi.fn(),
      }),
  }))
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

// ─── SIRI-UX-262 ─────────────────────────────────────────────────────────────

describe('SIRI-UX-262: KanbanBoard TaskCard uses CSS class for hover', () => {
  it('task card element has task-card CSS class (not relying solely on JS hover)', async () => {
    render(
      <MemoryRouter>
        <ToastProvider>
          <KanbanBoard companyId="co-1" />
        </ToastProvider>
      </MemoryRouter>,
    )

    // Find task card by accessible label
    const card = await screen.findByRole('button', { name: /Do the thing/i })
    expect(card.className).toContain('task-card')
  })
})

// ─── SIRI-UX-263 ─────────────────────────────────────────────────────────────

describe('SIRI-UX-263: CompanyPage tab buttons use CSS class for hover', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (url.includes('/agents')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve([]) })
        }
        if (url.includes('/tasks')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [], total: 0 }) })
        }
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({ id: 'co-1', name: 'Acme Corp', description: '' }),
        })
      }),
    )
  })

  it('tab nav buttons have company-tab-btn CSS class instead of only JS hover handlers', async () => {
    render(
      <MemoryRouter initialEntries={['/companies/co-1']}>
        <ToastProvider>
          <CompanyPage />
        </ToastProvider>
      </MemoryRouter>,
    )

    // Tabs should be visible — find by role="tab"
    const tabs = await screen.findAllByRole('tab')
    expect(tabs.length).toBeGreaterThan(0)
    for (const tab of tabs) {
      expect(tab.className).toContain('company-tab-btn')
    }
  })
})
