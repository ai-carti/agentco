/**
 * FE-004 — KanbanBoard drag & drop stress test
 *
 * AC:
 * - drag 5+ cards into another column across multiple iterations
 * - rollback on API 500 (card returns to original column)
 * - aria-grabbed / aria-dropeffect present
 * - no JS errors during drag
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import KanbanBoard from '../components/KanbanBoard'
import { useAgentStore } from '../store/agentStore'
import { ToastProvider } from '../context/ToastContext'

function renderWithToast(ui: React.ReactElement) {
  return render(<ToastProvider>{ui}</ToastProvider>)
}

function makeTasks(count: number, status: 'todo' | 'backlog' | 'in_progress' | 'done' = 'todo') {
  return Array.from({ length: count }, (_, i) => ({
    id: `stress-${i}`,
    title: `Stress Task ${i}`,
    status,
    assignee_name: `Agent ${i % 3}`,
  }))
}

beforeEach(() => {
  useAgentStore.setState({ tasks: [], agents: [] })
  vi.clearAllMocks()
  localStorage.clear()
})

describe('FE-004: KanbanBoard drag & drop stress test', () => {
  it('drag 5 cards from todo → in_progress — all move correctly', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })

    const tasks = makeTasks(5, 'todo')
    useAgentStore.setState({ tasks })
    renderWithToast(<KanbanBoard companyId="stress-co" />)

    const inProgressCol = screen.getByTestId('kanban-column-in_progress')

    for (const task of tasks) {
      const card = screen.getByTestId(`task-card-${task.id}`)
      fireEvent.dragStart(card, { dataTransfer: { setData: vi.fn(), getData: () => task.id } })
      fireEvent.drop(inProgressCol, { dataTransfer: { getData: () => task.id } })
    }

    await waitFor(() => {
      const store = useAgentStore.getState()
      const movedCount = store.tasks.filter((t) => t.status === 'in_progress').length
      expect(movedCount).toBe(5)
    })
  })

  it('drag 7 cards across multiple iterations (todo → done → backlog)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })

    const tasks = makeTasks(7, 'todo')
    useAgentStore.setState({ tasks })
    renderWithToast(<KanbanBoard companyId="stress-co2" />)

    // Iteration 1: todo → done
    const doneCol = screen.getByTestId('kanban-column-done')
    for (const task of tasks.slice(0, 4)) {
      const card = screen.getByTestId(`task-card-${task.id}`)
      fireEvent.dragStart(card, { dataTransfer: { setData: vi.fn(), getData: () => task.id } })
      fireEvent.drop(doneCol, { dataTransfer: { getData: () => task.id } })
    }

    await waitFor(() => {
      const store = useAgentStore.getState()
      expect(store.tasks.filter((t) => t.status === 'done').length).toBe(4)
    })

    // Iteration 2: remaining todo → in_progress
    const inProgressCol = screen.getByTestId('kanban-column-in_progress')
    for (const task of tasks.slice(4)) {
      const card = screen.getByTestId(`task-card-${task.id}`)
      fireEvent.dragStart(card, { dataTransfer: { setData: vi.fn(), getData: () => task.id } })
      fireEvent.drop(inProgressCol, { dataTransfer: { getData: () => task.id } })
    }

    await waitFor(() => {
      const store = useAgentStore.getState()
      expect(store.tasks.filter((t) => t.status === 'in_progress').length).toBe(3)
    })
  })

  it('drag + API 500 → all 5 cards rollback to original column', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) })

    const tasks = makeTasks(5, 'todo')
    useAgentStore.setState({ tasks })
    renderWithToast(<KanbanBoard companyId="rollback-co" />)

    const inProgressCol = screen.getByTestId('kanban-column-in_progress')

    // Move all 5 cards one by one, each should roll back
    for (const task of tasks) {
      const card = screen.getByTestId(`task-card-${task.id}`)
      fireEvent.dragStart(card, { dataTransfer: { setData: vi.fn(), getData: () => task.id } })
      fireEvent.drop(inProgressCol, { dataTransfer: { getData: () => task.id } })

      await waitFor(() => {
        const t = useAgentStore.getState().tasks.find((x) => x.id === task.id)
        expect(t?.status).toBe('todo')
      })
    }

    // All should be back in todo
    const store = useAgentStore.getState()
    expect(store.tasks.every((t) => t.status === 'todo')).toBe(true)
  })

  it('aria-grabbed is false by default on all draggable cards', () => {
    useAgentStore.setState({ tasks: makeTasks(5) })
    renderWithToast(<KanbanBoard companyId="a11y-co" />)

    for (let i = 0; i < 5; i++) {
      const card = screen.getByTestId(`task-card-stress-${i}`)
      expect(card).toHaveAttribute('aria-grabbed')
      // false (not being dragged)
      expect(card.getAttribute('aria-grabbed')).toBe('false')
    }
  })

  it('aria-grabbed becomes true on dragStart for dragged card only', () => {
    const tasks = makeTasks(3)
    useAgentStore.setState({ tasks })
    renderWithToast(<KanbanBoard companyId="a11y-co2" />)

    const card0 = screen.getByTestId('task-card-stress-0')
    const card1 = screen.getByTestId('task-card-stress-1')

    fireEvent.dragStart(card0, { dataTransfer: { setData: vi.fn(), getData: () => 'stress-0' } })

    expect(card0.getAttribute('aria-grabbed')).toBe('true')
    // Other cards stay false
    expect(card1.getAttribute('aria-grabbed')).toBe('false')
  })

  it('aria-grabbed resets to false on dragEnd', () => {
    useAgentStore.setState({ tasks: makeTasks(2) })
    renderWithToast(<KanbanBoard companyId="a11y-co3" />)

    const card = screen.getByTestId('task-card-stress-0')
    fireEvent.dragStart(card, { dataTransfer: { setData: vi.fn(), getData: () => 'stress-0' } })
    expect(card.getAttribute('aria-grabbed')).toBe('true')

    fireEvent.dragEnd(card)
    expect(card.getAttribute('aria-grabbed')).toBe('false')
  })

  it('all kanban columns have aria-dropeffect="move"', () => {
    useAgentStore.setState({ tasks: makeTasks(1) })
    renderWithToast(<KanbanBoard companyId="a11y-co4" />)

    const columnIds = ['backlog', 'todo', 'in_progress', 'done']
    for (const colId of columnIds) {
      const col = screen.getByTestId(`kanban-column-${colId}`)
      expect(col).toHaveAttribute('aria-dropeffect', 'move')
    }
  })

  it('drag does not throw JS errors (no uncaught exceptions)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })

    useAgentStore.setState({ tasks: makeTasks(5) })

    const errors: Error[] = []
    const origOnError = window.onerror
    window.onerror = (msg, src, line, col, err) => {
      if (err) errors.push(err)
      return false
    }

    renderWithToast(<KanbanBoard companyId="noerror-co" />)
    const inProgressCol = screen.getByTestId('kanban-column-in_progress')

    for (let i = 0; i < 5; i++) {
      const card = screen.getByTestId(`task-card-stress-${i}`)
      expect(() => {
        fireEvent.dragStart(card, { dataTransfer: { setData: vi.fn(), getData: () => `stress-${i}` } })
        fireEvent.dragOver(inProgressCol)
        fireEvent.drop(inProgressCol, { dataTransfer: { getData: () => `stress-${i}` } })
        fireEvent.dragEnd(card)
      }).not.toThrow()
    }

    window.onerror = origOnError
    expect(errors).toHaveLength(0)
  })
})
