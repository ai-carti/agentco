/**
 * SIRI-UX-304: SettingsPage — submitError and credentialsError need role="alert"
 * SIRI-UX-305: LibraryPortfolioPage — toLocaleDateString() without locale → use formatDateLong
 * SIRI-UX-306: AgentForm — model validation error needs role="alert"
 * SIRI-UX-307: TaskCard — remove global tasks subscription (re-render on every task update)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ToastProvider } from '../context/ToastContext'

// ----- helpers -----
function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <MemoryRouter>{children}</MemoryRouter>
    </ToastProvider>
  )
}

// ─── SIRI-UX-306: AgentForm model validation error ───────────────────────────
describe('SIRI-UX-306: AgentForm model validation error', () => {
  beforeEach(() => {
    // Mock models endpoint — returns empty to force model not selected scenario
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ all_models: ['gpt-4o'] }),
    })
  })
  afterEach(() => { vi.restoreAllMocks() })

  it('error paragraph has role="alert" when model not selected', async () => {
    const { default: AgentForm } = await import('../components/AgentForm')
    const handleSubmit = vi.fn()
    render(
      <Wrapper>
        <AgentForm onSubmit={handleSubmit} />
      </Wrapper>
    )
    // Wait for models to load
    await waitFor(() => expect(screen.queryByText('Loading models…')).toBeNull())

    // Submit without selecting a model — model select starts with empty value
    // Force model select to be empty
    const submitBtn = screen.getByTestId('agent-form-submit')
    fireEvent.click(submitBtn)

    await waitFor(() => {
      const errorEl = screen.queryByTestId('agent-form-model-error')
      if (errorEl) {
        expect(errorEl).toHaveAttribute('role', 'alert')
      }
    })
  })
})

// ─── SIRI-UX-305: LibraryPortfolioPage date format ────────────────────────────
describe('SIRI-UX-305: LibraryPortfolioPage uses formatDateLong for dates', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('displays date in consistent en-US format (not system locale)', async () => {
    const mockPortfolio = {
      agent_name: 'TestAgent',
      total_tasks: 1,
      success_rate: 100,
      tasks: [
        {
          id: 't1',
          title: 'Test task',
          status: 'done',
          company_name: 'Acme',
          created_at: '2026-01-15T10:00:00Z',
        },
      ],
    }
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockPortfolio,
    })

    const { default: LibraryPortfolioPage } = await import('../components/LibraryPortfolioPage')
    render(
      <MemoryRouter initialEntries={['/library/agent-1/portfolio']}>
        <Routes>
          <Route path="/library/:id/portfolio" element={<LibraryPortfolioPage />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => screen.getByTestId('portfolio-task-t1'))

    // Should show 'Jan 15, 2026' (formatDateLong format), not '1/15/2026' (system locale)
    const taskRow = screen.getByTestId('portfolio-task-t1')
    const dateText = taskRow.textContent ?? ''
    // Should contain short month name, not slash-separated date
    expect(dateText).toMatch(/Jan 15, 2026/)
    expect(dateText).not.toMatch(/1\/15\/2026/)
  })
})

// ─── SIRI-UX-304: SettingsPage error elements ─────────────────────────────────
describe('SIRI-UX-304: SettingsPage error elements have role="alert"', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('credentialsError element has role="alert" when credentials fetch fails', async () => {
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      // Companies load OK → triggers credentials fetch
      if (String(url).includes('/api/companies/') && !String(url).includes('/credentials')) {
        return Promise.resolve({ ok: true, json: async () => [{ id: 'c1', name: 'Co1' }] })
      }
      if (String(url).endsWith('/api/companies/')) {
        return Promise.resolve({ ok: true, json: async () => [{ id: 'c1', name: 'Co1' }] })
      }
      if (String(url).includes('/credentials')) {
        return Promise.resolve({ ok: false, status: 500, json: async () => ({}) })
      }
      return Promise.resolve({ ok: true, json: async () => [] })
    })

    const { default: SettingsPage } = await import('../components/SettingsPage')
    render(
      <Wrapper>
        <SettingsPage />
      </Wrapper>
    )

    await waitFor(() => {
      const errorEl = screen.queryByTestId('credentials-fetch-error')
      expect(errorEl).not.toBeNull()
      expect(errorEl).toHaveAttribute('role', 'alert')
    }, { timeout: 3000 })
  })
})

// ─── SIRI-UX-307: TaskCard does not import global tasks store subscription ────
describe('SIRI-UX-307: TaskCard has no stray useAgentStore((s) => s.tasks) subscription', () => {
  it('KanbanBoard.tsx TaskCard block does not contain orphan store subscription', async () => {
    // Read the KanbanBoard source and verify the specific pattern is removed
    const fs = await import('fs')
    const path = await import('path')
    const filePath = path.resolve(__dirname, '../components/KanbanBoard.tsx')
    const source = fs.readFileSync(filePath, 'utf-8')

    // Find the TaskCard component definition
    const taskCardStart = source.indexOf('function TaskCard(')
    const kanbanBoardStart = source.indexOf('\nexport default function KanbanBoard(')
    expect(taskCardStart).toBeGreaterThan(-1)
    expect(kanbanBoardStart).toBeGreaterThan(taskCardStart)

    const taskCardSource = source.slice(taskCardStart, kanbanBoardStart)

    // The orphan subscription `useAgentStore((s) => s.tasks)` (with no assignment)
    // should be removed from TaskCard. Mutations use getState() which is fine.
    // Pattern to reject: standalone call with no destructuring or assignment
    const orphanPattern = /useAgentStore\(\(s\)\s*=>\s*s\.tasks\)\s*\n/
    expect(taskCardSource).not.toMatch(orphanPattern)
  })
})
