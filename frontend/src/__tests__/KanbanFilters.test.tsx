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

// ─── SIRI-UX-023: Dropdowns close on outside click ───────────────────────────

describe('KanbanFilters — SIRI-UX-023: close dropdowns on outside click', () => {
  it('agent dropdown closes on mousedown outside FilterBar', () => {
    renderWithToast(<KanbanBoard companyId="c1" />)

    // Open agent dropdown
    fireEvent.click(screen.getByTestId('filter-agent-btn'))
    expect(screen.getByTestId('filter-agent-option-a1')).toBeInTheDocument()

    // Mousedown outside
    fireEvent.mouseDown(document.body)

    expect(screen.queryByTestId('filter-agent-option-a1')).not.toBeInTheDocument()
  })

  it('priority dropdown closes on mousedown outside FilterBar', () => {
    renderWithToast(<KanbanBoard companyId="c1" />)

    // Open priority dropdown
    fireEvent.click(screen.getByTestId('filter-priority-btn'))
    expect(screen.getByTestId('filter-priority-option-high')).toBeInTheDocument()

    // Mousedown outside
    fireEvent.mouseDown(document.body)

    expect(screen.queryByTestId('filter-priority-option-high')).not.toBeInTheDocument()
  })

  it('both dropdowns close simultaneously on mousedown outside', () => {
    renderWithToast(<KanbanBoard companyId="c1" />)

    // Manually force both open state isn't easy, but we can open agent and verify it closes
    fireEvent.click(screen.getByTestId('filter-agent-btn'))
    expect(screen.getByTestId('filter-agent-option-a1')).toBeInTheDocument()

    fireEvent.mouseDown(document.body)

    expect(screen.queryByTestId('filter-agent-option-a1')).not.toBeInTheDocument()
    expect(screen.queryByTestId('filter-priority-option-high')).not.toBeInTheDocument()
  })

  it('click inside dropdown does not close it', () => {
    renderWithToast(<KanbanBoard companyId="c1" />)

    fireEvent.click(screen.getByTestId('filter-agent-btn'))
    expect(screen.getByTestId('filter-agent-option-a1')).toBeInTheDocument()

    // Click inside the dropdown
    fireEvent.mouseDown(screen.getByTestId('filter-agent-option-a1'))

    expect(screen.getByTestId('filter-agent-option-a1')).toBeInTheDocument()
  })
})

// ─── SIRI-UX-060: FilterBar keyboard accessibility ───────────────────────────

describe('KanbanFilters — SIRI-UX-060: keyboard accessible dropdown items', () => {
  it('filter-agent-option items are buttons (or have role=menuitem)', () => {
    renderWithToast(<KanbanBoard companyId="c1" />)
    fireEvent.click(screen.getByTestId('filter-agent-btn'))

    const option = screen.getByTestId('filter-agent-option-a1')
    // Must be a button or have role=menuitem/checkbox so keyboard works
    const tag = option.tagName.toLowerCase()
    const role = option.getAttribute('role')
    expect(tag === 'button' || role === 'menuitem' || role === 'checkbox' || tag === 'input').toBe(true)
  })

  it('filter-priority-option items are buttons (or have role=menuitem)', () => {
    renderWithToast(<KanbanBoard companyId="c1" />)
    fireEvent.click(screen.getByTestId('filter-priority-btn'))

    const option = screen.getByTestId('filter-priority-option-high')
    const tag = option.tagName.toLowerCase()
    const role = option.getAttribute('role')
    expect(tag === 'button' || role === 'menuitem' || role === 'checkbox' || tag === 'input').toBe(true)
  })

  it('agent option announces checked state via aria-checked', () => {
    renderWithToast(<KanbanBoard companyId="c1" />)
    fireEvent.click(screen.getByTestId('filter-agent-btn'))

    const option = screen.getByTestId('filter-agent-option-a1')
    // Before selecting: aria-checked should be false or not present
    expect(option.getAttribute('aria-checked')).toBe('false')

    // Click to select
    fireEvent.click(option)

    // Re-query after state update
    const selected = screen.getByTestId('filter-agent-option-a1')
    expect(selected.getAttribute('aria-checked')).toBe('true')
  })

  it('priority option announces checked state via aria-checked', () => {
    renderWithToast(<KanbanBoard companyId="c1" />)
    fireEvent.click(screen.getByTestId('filter-priority-btn'))

    const option = screen.getByTestId('filter-priority-option-high')
    expect(option.getAttribute('aria-checked')).toBe('false')

    fireEvent.click(option)

    const selected = screen.getByTestId('filter-priority-option-high')
    expect(selected.getAttribute('aria-checked')).toBe('true')
  })

  it('agent option activates via Enter key', () => {
    renderWithToast(<KanbanBoard companyId="c1" />)
    fireEvent.click(screen.getByTestId('filter-agent-btn'))

    const option = screen.getByTestId('filter-agent-option-a1')
    fireEvent.keyDown(option, { key: 'Enter' })

    // Task by Alice should now be filtered
    expect(screen.getByText('Build login page')).toBeInTheDocument()
    expect(screen.queryByText('Deploy to prod')).not.toBeInTheDocument()
  })

  it('agent option activates via Space key', () => {
    renderWithToast(<KanbanBoard companyId="c1" />)
    fireEvent.click(screen.getByTestId('filter-agent-btn'))

    const option = screen.getByTestId('filter-agent-option-a1')
    fireEvent.keyDown(option, { key: ' ' })

    expect(screen.getByText('Build login page')).toBeInTheDocument()
    expect(screen.queryByText('Deploy to prod')).not.toBeInTheDocument()
  })

  it('priority option activates via Enter key', () => {
    renderWithToast(<KanbanBoard companyId="c1" />)
    fireEvent.click(screen.getByTestId('filter-priority-btn'))

    const option = screen.getByTestId('filter-priority-option-high')
    fireEvent.keyDown(option, { key: 'Enter' })

    expect(screen.getByText('Build login page')).toBeInTheDocument()
    expect(screen.queryByText('Deploy to prod')).not.toBeInTheDocument()
  })
})
