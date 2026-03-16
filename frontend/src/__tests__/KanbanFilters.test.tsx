import { render, screen, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import KanbanBoard from '../components/KanbanBoard'
import { useAgentStore } from '../store/agentStore'
import { ToastProvider } from '../context/ToastContext'

function renderWithToast(ui: React.ReactElement) {
  return render(<ToastProvider>{ui}</ToastProvider>)
}

const TASKS = [
  { id: 't1', title: 'Build login page', status: 'todo' as const, assignee_id: 'a1', assignee_name: 'Alice', priority: 'high' as const },
  { id: 't2', title: 'Deploy to prod', status: 'in_progress' as const, assignee_id: 'a2', assignee_name: 'Bob', priority: 'medium' as const },
  { id: 't3', title: 'Fix search bug', status: 'todo' as const, assignee_id: 'a1', assignee_name: 'Alice', priority: 'low' as const },
  { id: 't4', title: 'Write tests', status: 'done' as const, assignee_id: 'a3', assignee_name: 'Carol', priority: 'high' as const },
  { id: 't5', title: 'Update docs', status: 'backlog' as const, assignee_id: 'a2', assignee_name: 'Bob', priority: 'low' as const },
]

const AGENTS = [
  { id: 'a1', name: 'Alice', role: 'Developer', status: 'idle' as const },
  { id: 'a2', name: 'Bob', role: 'DevOps', status: 'running' as const },
  { id: 'a3', name: 'Carol', role: 'QA', status: 'idle' as const },
]

beforeEach(() => {
  useAgentStore.setState({ tasks: TASKS, agents: AGENTS })
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('KanbanFilters — UX-014', () => {
  it('renders search input for filtering tasks', () => {
    renderWithToast(<KanbanBoard companyId="c1" />)
    expect(screen.getByTestId('kanban-search-input')).toBeInTheDocument()
  })

  it('filters tasks by title in real-time with debounce 150ms', () => {
    renderWithToast(<KanbanBoard companyId="c1" />)
    const input = screen.getByTestId('kanban-search-input')
    fireEvent.change(input, { target: { value: 'login' } })

    // Before debounce — all tasks still visible
    expect(screen.getByText('Build login page')).toBeInTheDocument()
    expect(screen.getByText('Deploy to prod')).toBeInTheDocument()

    // After debounce
    act(() => { vi.advanceTimersByTime(150) })
    expect(screen.getByText('Build login page')).toBeInTheDocument()
    expect(screen.queryByText('Deploy to prod')).not.toBeInTheDocument()
    expect(screen.queryByText('Fix search bug')).not.toBeInTheDocument()
  })

  it('renders Agent multiselect dropdown', () => {
    renderWithToast(<KanbanBoard companyId="c1" />)
    expect(screen.getByTestId('filter-agent-btn')).toBeInTheDocument()
  })

  it('filters tasks by selected agents (multiselect)', () => {
    renderWithToast(<KanbanBoard companyId="c1" />)
    fireEvent.click(screen.getByTestId('filter-agent-btn'))
    fireEvent.click(screen.getByTestId('filter-agent-option-a1'))

    // Only Alice tasks visible
    expect(screen.getByText('Build login page')).toBeInTheDocument()
    expect(screen.getByText('Fix search bug')).toBeInTheDocument()
    expect(screen.queryByText('Deploy to prod')).not.toBeInTheDocument()
    expect(screen.queryByText('Write tests')).not.toBeInTheDocument()
  })

  it('renders Priority multiselect dropdown', () => {
    renderWithToast(<KanbanBoard companyId="c1" />)
    expect(screen.getByTestId('filter-priority-btn')).toBeInTheDocument()
  })

  it('filters tasks by selected priorities (multiselect)', () => {
    renderWithToast(<KanbanBoard companyId="c1" />)
    fireEvent.click(screen.getByTestId('filter-priority-btn'))
    fireEvent.click(screen.getByTestId('filter-priority-option-high'))

    // Only high priority tasks visible
    expect(screen.getByText('Build login page')).toBeInTheDocument()
    expect(screen.getByText('Write tests')).toBeInTheDocument()
    expect(screen.queryByText('Deploy to prod')).not.toBeInTheDocument()
    expect(screen.queryByText('Fix search bug')).not.toBeInTheDocument()
  })

  it('applies all filters simultaneously with AND logic', () => {
    renderWithToast(<KanbanBoard companyId="c1" />)

    // Select agent Alice
    fireEvent.click(screen.getByTestId('filter-agent-btn'))
    fireEvent.click(screen.getByTestId('filter-agent-option-a1'))

    // Select priority high
    fireEvent.click(screen.getByTestId('filter-priority-btn'))
    fireEvent.click(screen.getByTestId('filter-priority-option-high'))

    // Only Alice + high = "Build login page"
    expect(screen.getByText('Build login page')).toBeInTheDocument()
    expect(screen.queryByText('Fix search bug')).not.toBeInTheDocument() // Alice but low
    expect(screen.queryByText('Write tests')).not.toBeInTheDocument() // high but Carol
  })

  it('shows filter badges with reset button when filters are active', () => {
    renderWithToast(<KanbanBoard companyId="c1" />)

    fireEvent.click(screen.getByTestId('filter-agent-btn'))
    fireEvent.click(screen.getByTestId('filter-agent-option-a1'))

    // Badge for Alice filter
    expect(screen.getByTestId('filter-badge-agent-a1')).toBeInTheDocument()
  })

  it('removes individual filter when clicking badge reset', () => {
    renderWithToast(<KanbanBoard companyId="c1" />)

    fireEvent.click(screen.getByTestId('filter-agent-btn'))
    fireEvent.click(screen.getByTestId('filter-agent-option-a1'))

    // Click the remove button on the badge
    fireEvent.click(screen.getByTestId('filter-badge-remove-agent-a1'))

    // All tasks visible again
    expect(screen.getByText('Build login page')).toBeInTheDocument()
    expect(screen.getByText('Deploy to prod')).toBeInTheDocument()
  })

  it('shows "Clear all" and resets all filters on click', () => {
    renderWithToast(<KanbanBoard companyId="c1" />)

    // Apply agent filter
    fireEvent.click(screen.getByTestId('filter-agent-btn'))
    fireEvent.click(screen.getByTestId('filter-agent-option-a1'))

    // Apply priority filter
    fireEvent.click(screen.getByTestId('filter-priority-btn'))
    fireEvent.click(screen.getByTestId('filter-priority-option-high'))

    expect(screen.getByTestId('filter-clear-all')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('filter-clear-all'))

    // All tasks visible
    expect(screen.getByText('Build login page')).toBeInTheDocument()
    expect(screen.getByText('Deploy to prod')).toBeInTheDocument()
    expect(screen.getByText('Fix search bug')).toBeInTheDocument()
    expect(screen.getByText('Write tests')).toBeInTheDocument()
    expect(screen.getByText('Update docs')).toBeInTheDocument()
  })

  it('shows mini empty state when no tasks match filters', () => {
    renderWithToast(<KanbanBoard companyId="c1" />)
    const input = screen.getByTestId('kanban-search-input')
    fireEvent.change(input, { target: { value: 'nonexistent xyz' } })
    act(() => { vi.advanceTimersByTime(150) })

    expect(screen.getByTestId('filter-empty-state')).toBeInTheDocument()
    expect(screen.getByText('No tasks match filters')).toBeInTheDocument()
  })
})
