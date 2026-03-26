/**
 * SIRI-UX-368: KanbanBoard closeCreateModal — abort in-flight createTask POST on close
 * SIRI-UX-369: TaskDetailSidebar sidebar-assignee-avatar missing aria-label
 * SIRI-UX-370: CompanyPage company-avatar in CompanyHeader missing aria-label
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { act } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

// ─── SIRI-UX-368: closeCreateModal aborts in-flight createTask fetch ─────────
describe('SIRI-UX-368: closeCreateModal aborts in-flight createTask POST', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('KanbanBoard.tsx source: closeCreateModal calls createTaskAbortRef.current?.abort()', async () => {
    const modules = import.meta.glob('../components/KanbanBoard.tsx', {
      query: '?raw',
      import: 'default',
      eager: true,
    })
    const src = Object.values(modules)[0] as string
    // closeCreateModal must call abort on the createTask abort ref
    expect(src).toContain('createTaskAbortRef.current?.abort()')
    // It should appear inside closeCreateModal (near the SIRI-UX-368 comment or setShowCreateModal)
    const closeIdx = src.indexOf('closeCreateModal = useCallback')
    const setShowIdx = src.indexOf('setShowCreateModal(false)', closeIdx)
    const abortIdx = src.indexOf('createTaskAbortRef.current?.abort()', closeIdx)
    expect(abortIdx).toBeGreaterThan(closeIdx)
    expect(abortIdx).toBeLessThan(setShowIdx)
  })
})

// ─── SIRI-UX-369: sidebar-assignee-avatar has aria-label ────────────────────
describe('SIRI-UX-369: TaskDetailSidebar assignee avatar has aria-label', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ logs: [], status_history: [] }),
    }) as unknown as typeof fetch
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('sidebar-assignee-avatar has aria-label with assignee name', async () => {
    const TaskDetailSidebar = (await import('../components/TaskDetailSidebar')).default
    const task = {
      id: 't1',
      title: 'My Task',
      status: 'todo' as const,
      assignee_name: 'Jane Doe',
      assignee_id: 'a1',
      description: undefined,
      priority: undefined,
      due_date: undefined,
    }

    await act(async () => {
      render(<TaskDetailSidebar task={task} companyId="c1" onClose={vi.fn()} />)
    })

    await vi.runAllTimersAsync()

    const avatar = screen.getByTestId('sidebar-assignee-avatar')
    expect(avatar).toHaveAttribute('aria-label', 'Jane Doe')
    expect(avatar).toHaveAttribute('title', 'Jane Doe')
  })

  it('sidebar-assignee-avatar shows "Unassigned" when no assignee', async () => {
    const TaskDetailSidebar = (await import('../components/TaskDetailSidebar')).default
    const task = {
      id: 't2',
      title: 'Unassigned Task',
      status: 'backlog' as const,
      description: undefined,
      assignee_name: undefined,
      assignee_id: undefined,
      priority: undefined,
      due_date: undefined,
    }

    await act(async () => {
      render(<TaskDetailSidebar task={task} companyId="c1" onClose={vi.fn()} />)
    })

    await vi.runAllTimersAsync()

    const avatar = screen.getByTestId('sidebar-assignee-avatar')
    expect(avatar).toHaveAttribute('aria-label', 'Unassigned')
    expect(avatar).toHaveAttribute('title', 'Unassigned')
  })
})

// ─── SIRI-UX-370: company-avatar in CompanyHeader has aria-label ─────────────
describe('SIRI-UX-370: CompanyPage CompanyHeader company-avatar has aria-label', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      const urlStr = String(url)
      if (urlStr.includes('/agents')) {
        return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }))
      }
      if (urlStr.includes('/tasks')) {
        return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }))
      }
      // company fetch
      return Promise.resolve(
        new Response(JSON.stringify({ id: 'co-1', name: 'Acme Corp' }), { status: 200 })
      )
    }) as unknown as typeof fetch
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('company-avatar has aria-label with company name', async () => {
    const CompanyPage = (await import('../components/CompanyPage')).default

    await act(async () => {
      render(
        <MemoryRouter initialEntries={['/companies/co-1']}>
          <Routes>
            <Route path="/companies/:id" element={<CompanyPage />} />
          </Routes>
        </MemoryRouter>
      )
    })

    await vi.runAllTimersAsync()

    const avatar = screen.queryByTestId('company-avatar')
    expect(avatar).toBeTruthy()
    expect(avatar).toHaveAttribute('aria-label', 'Acme Corp')
    expect(avatar).toHaveAttribute('title', 'Acme Corp')
  })

  it('CompanyPage.tsx source: company-avatar has aria-label={name} and title={name}', async () => {
    const modules = import.meta.glob('../components/CompanyPage.tsx', {
      query: '?raw',
      import: 'default',
      eager: true,
    })
    const src = Object.values(modules)[0] as string
    expect(src).toContain('aria-label={name}')
    expect(src).toContain('title={name}')
  })
})
