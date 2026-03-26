/**
 * SIRI-UX-354: TaskCard handlers (handleRun/Edit/Delete/Assign) wrapped in useCallback
 * SIRI-UX-361: KanbanBoard handleCreateTask wrapped in useCallback
 * SIRI-UX-362: TaskDetailSidebar.handleRun bare catch logs error
 * SIRI-UX-360: JWT token in WS URL — documented as known issue in WarRoom.tsx + ROADMAP
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { act } from 'react'

// ─── Store / context mocks ───────────────────────────────────────────────────
vi.mock('../store/agentStore', () => {
  const setTasks = vi.fn()
  const state = {
    tasks: [
      {
        id: 't1', title: 'Alpha', status: 'todo', description: '',
        assignee_name: null, assignee_id: null, priority: null, due_date: null,
      },
    ],
    agents: [{ id: 'a1', name: 'Alice' }],
    currentCompany: { id: 'c1', name: 'ACME' },
    setTasks,
    setAgents: vi.fn(),
  }
  return {
    useAgentStore: (sel: (s: typeof state) => unknown) => sel(state),
    // expose getState for mutations
    __esModule: true,
  }
})

vi.mock('../api/client', () => ({
  getStoredToken: () => 'tok',
  BASE_URL: 'http://localhost:8000',
}))

vi.mock('../context/ToastContext', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}))

vi.mock('../hooks/useFocusTrap', () => ({
  useFocusTrap: () => ({ current: null }),
}))

vi.mock('../utils/taskUtils', () => ({
  STATUS_COLORS: {
    todo: { bg: '#374151', text: '#d1d5db' },
    backlog: { bg: '#292524', text: '#a8a29e' },
    in_progress: { bg: '#1d4ed8', text: '#bfdbfe' },
    done: { bg: '#065f46', text: '#a7f3d0' },
  },
  PRIORITY_COLORS: {
    high: { bg: '#7f1d1d', text: '#fca5a5', label: 'High' },
    medium: { bg: '#78350f', text: '#fcd34d', label: 'Medium' },
    low: { bg: '#1f2937', text: '#9ca3af', label: 'Low' },
  },
  getAvatarColor: () => '#7c3aed',
  getInitials: (n: string) => n.slice(0, 2).toUpperCase(),
  formatDueDate: () => ({ label: 'Jan 1', overdue: false }),
  formatTimeHMS: () => '00:00:00',
  formatDateLong: () => 'Jan 1, 2026',
  relativeTime: () => '1m ago',
}))

vi.mock('../components/EmptyState', () => ({ default: () => null }))
vi.mock('../components/SkeletonCard', () => ({ default: () => null }))
vi.mock('../components/Button', () => ({
  default: ({
    children, onClick, disabled, ...rest
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { children: React.ReactNode }) => (
    <button onClick={onClick} disabled={disabled} {...rest}>{children}</button>
  ),
}))

// ─── SIRI-UX-354: TaskCard handlers use useCallback ─────────────────────────
// We verify the handlers are present and work (behavioral), not inspect closure refs
// (which is impossible from the outside). The key fix is they don't crash on re-render.
describe('SIRI-UX-354: TaskCard handlers (handleRun/Edit/Delete/Assign) are useCallback-wrapped', () => {
  it('TaskCard renders Run button which fires on click without throwing', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    }) as unknown as typeof fetch

    const KanbanBoard = (await import('../components/KanbanBoard')).default
    render(<KanbanBoard companyId="c1" isLoaded />)

    const runBtn = screen.getByTestId('run-btn-t1')
    expect(runBtn).toBeTruthy()
    await act(async () => {
      fireEvent.click(runBtn)
    })
    // Should not throw; fetch was called
    expect(globalThis.fetch).toHaveBeenCalled()
  })

  it('TaskCard opens Edit modal via menu without throwing', async () => {
    const KanbanBoard = (await import('../components/KanbanBoard')).default
    render(<KanbanBoard companyId="c1" isLoaded />)

    const menuBtn = screen.getByTestId('task-menu-t1')
    await act(async () => { fireEvent.click(menuBtn) })

    const editBtn = screen.getByRole('menuitem', { name: 'Edit' })
    await act(async () => { fireEvent.click(editBtn) })

    expect(screen.getByTestId('edit-task-modal')).toBeTruthy()
  })

  it('TaskCard opens Delete confirm via menu without throwing', async () => {
    const KanbanBoard = (await import('../components/KanbanBoard')).default
    render(<KanbanBoard companyId="c1" isLoaded />)

    const menuBtn = screen.getByTestId('task-menu-t1')
    await act(async () => { fireEvent.click(menuBtn) })

    const deleteBtn = screen.getByRole('menuitem', { name: 'Delete' })
    await act(async () => { fireEvent.click(deleteBtn) })

    expect(screen.getByTestId('confirm-delete-dialog')).toBeTruthy()
  })

  it('TaskCard opens Assign dialog via menu without throwing', async () => {
    const KanbanBoard = (await import('../components/KanbanBoard')).default
    render(<KanbanBoard companyId="c1" isLoaded />)

    const menuBtn = screen.getByTestId('task-menu-t1')
    await act(async () => { fireEvent.click(menuBtn) })

    const assignBtn = screen.getByRole('menuitem', { name: 'Assign' })
    await act(async () => { fireEvent.click(assignBtn) })

    expect(screen.getByTestId('assign-dropdown')).toBeTruthy()
  })

  // Source-level check: all 4 handlers use useCallback in TaskCard
  it('KanbanBoard.tsx source: handleRun, handleEdit, handleDelete, handleAssign are useCallback-wrapped', async () => {
    const modules = import.meta.glob('../components/KanbanBoard.tsx', {
      query: '?raw',
      import: 'default',
      eager: true,
    })
    const src = Object.values(modules)[0] as string
    // All 4 handlers must be defined with useCallback
    expect(src).toContain('const handleRun = useCallback(')
    expect(src).toContain('const handleEdit = useCallback(')
    expect(src).toContain('const handleDelete = useCallback(')
    expect(src).toContain('const handleAssign = useCallback(')
  })
})

// ─── SIRI-UX-361: handleCreateTask uses useCallback ─────────────────────────
describe('SIRI-UX-361: handleCreateTask in KanbanBoard is useCallback-wrapped', () => {
  it('KanbanBoard.tsx source: handleCreateTask is wrapped in useCallback', async () => {
    const modules = import.meta.glob('../components/KanbanBoard.tsx', {
      query: '?raw',
      import: 'default',
      eager: true,
    })
    const src = Object.values(modules)[0] as string
    expect(src).toContain('const handleCreateTask = useCallback(')
  })

  it('Create Task modal opens and submitting calls fetch', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 't2', title: 'New Task', status: 'todo', description: '',
        assignee_name: null, assignee_id: null, priority: null, due_date: null,
      }),
    }) as unknown as typeof fetch

    const KanbanBoard = (await import('../components/KanbanBoard')).default
    render(<KanbanBoard companyId="c1" isLoaded />)

    // Open modal
    const newBtn = screen.getByTestId('kanban-new-task-btn')
    await act(async () => { fireEvent.click(newBtn) })

    const titleInput = screen.getByTestId('create-task-title-input')
    await act(async () => { fireEvent.change(titleInput, { target: { value: 'New Task' } }) })

    const submitBtn = screen.getByTestId('create-task-submit-btn')
    await act(async () => { fireEvent.click(submitBtn) })

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/tasks'),
        expect.objectContaining({ method: 'POST' }),
      )
    })
  })
})

// ─── SIRI-UX-362: TaskDetailSidebar.handleRun logs error in catch ────────────
describe('SIRI-UX-362: TaskDetailSidebar handleRun catch logs error', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ logs: [], status_history: [] }),
    }) as unknown as typeof fetch
  })

  it('TaskDetailSidebar.tsx source: catch block in handleRun calls console.error', async () => {
    const modules = import.meta.glob('../components/TaskDetailSidebar.tsx', {
      query: '?raw',
      import: 'default',
      eager: true,
    })
    const src = Object.values(modules)[0] as string
    // The handleRun catch must log the error
    expect(src).toContain("console.error('handleRun failed:'")
  })

  it('console.error is called when handleRun fetch throws a network error', async () => {
    // Make the run fetch throw after the logs fetch succeeds
    let fetchCallCount = 0
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      fetchCallCount++
      // First call is logs (GET), second is run (POST)
      if (url.includes('/run')) {
        return Promise.reject(new Error('Network error'))
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ logs: [], status_history: [] }),
      })
    }) as unknown as typeof fetch

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const TaskDetailSidebar = (await import('../components/TaskDetailSidebar')).default
    const task = {
      id: 't1', title: 'Alpha', status: 'todo' as const,
      description: undefined, assignee_name: undefined, assignee_id: undefined,
      priority: undefined, due_date: undefined,
    }

    await act(async () => {
      render(<TaskDetailSidebar task={task} companyId="c1" onClose={vi.fn()} />)
    })

    const runBtn = screen.getByTestId('sidebar-run-btn')
    await act(async () => { fireEvent.click(runBtn) })

    await waitFor(() => {
      expect(errorSpy).toHaveBeenCalledWith(
        'handleRun failed:',
        expect.any(Error),
      )
    })

    errorSpy.mockRestore()
    expect(fetchCallCount).toBeGreaterThan(0)
  })
})

// ─── SIRI-UX-360: JWT token in WS URL documented ────────────────────────────
describe('SIRI-UX-360: WarRoom.tsx has TODO comment about JWT in WS URL', () => {
  it('WarRoom.tsx source contains TODO comment about JWT token in WS URL', async () => {
    const modules = import.meta.glob('../components/WarRoom.tsx', {
      query: '?raw',
      import: 'default',
      eager: true,
    })
    const src = Object.values(modules)[0] as string
    // Should contain a TODO comment explaining the security concern
    expect(src).toMatch(/TODO.*SIRI-UX-360|SIRI-UX-360.*TODO/i)
  })
})
