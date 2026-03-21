/**
 * FE-005 — KanbanBoard performance stress test
 *
 * AC:
 * - Render 100 mock tasks without crashes
 * - limit=50 included in GET /tasks
 */
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import KanbanBoard from '../components/KanbanBoard'
import { useAgentStore } from '../store/agentStore'
import { ToastProvider } from '../context/ToastContext'

function renderWithToast(ui: React.ReactElement) {
  return render(<ToastProvider>{ui}</ToastProvider>)
}

beforeEach(() => {
  useAgentStore.setState({ tasks: [], agents: [] })
  vi.clearAllMocks()
})

describe('FE-005: KanbanBoard performance with 100 tasks', () => {
  it('renders 100 task cards without crashing', () => {
    const manyTasks = Array.from({ length: 100 }, (_, i) => ({
      id: `perf-${i}`,
      title: `Perf Task ${i}`,
      status: (['todo', 'in_progress', 'done', 'backlog'] as const)[i % 4],
      assignee_name: `Agent ${i % 5}`,
    }))

    useAgentStore.setState({ tasks: manyTasks })

    expect(() => {
      renderWithToast(<KanbanBoard companyId="perf-co" isLoaded />)
    }).not.toThrow()

    const cards = screen.getAllByTestId(/^task-card-perf-/)
    expect(cards.length).toBe(100)
  })

  it('renders 100 tasks distributed across 4 columns correctly', () => {
    const statuses = ['todo', 'in_progress', 'done', 'backlog'] as const
    const tasks = Array.from({ length: 100 }, (_, i) => ({
      id: `dist-${i}`,
      title: `Task ${i}`,
      status: statuses[i % 4],
    }))

    useAgentStore.setState({ tasks })
    renderWithToast(<KanbanBoard companyId="perf-co2" isLoaded />)

    // 25 cards per column
    for (const col of statuses) {
      const column = screen.getByTestId(`kanban-column-${col}`)
      // Column header shows count
      expect(column.textContent).toContain('25')
    }
  })

  it('no console.error during 100-task render', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const tasks = Array.from({ length: 100 }, (_, i) => ({
      id: `noerr-${i}`,
      title: `Task ${i}`,
      status: 'todo' as const,
    }))
    useAgentStore.setState({ tasks })

    renderWithToast(<KanbanBoard companyId="noerr-co" isLoaded />)

    expect(consoleSpy).not.toHaveBeenCalled()
    consoleSpy.mockRestore()
  })

  it('Load More button visible when hasMore=true with 100 tasks', () => {
    const tasks = Array.from({ length: 100 }, (_, i) => ({
      id: `lm-${i}`,
      title: `Task ${i}`,
      status: 'todo' as const,
    }))
    useAgentStore.setState({ tasks })

    renderWithToast(
      <KanbanBoard companyId="lm-co" isLoaded hasMore={true} onLoadMore={vi.fn()} />
    )

    expect(screen.getByTestId('kanban-load-more-btn')).toBeInTheDocument()
  })
})
