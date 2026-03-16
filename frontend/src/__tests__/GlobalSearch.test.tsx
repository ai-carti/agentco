import { render, screen, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import GlobalSearch from '../components/GlobalSearch'
import { useAgentStore } from '../store/agentStore'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

function renderSearch() {
  return render(
    <MemoryRouter>
      <GlobalSearch />
    </MemoryRouter>
  )
}

beforeEach(() => {
  useAgentStore.setState({
    agents: [
      { id: 'a1', name: 'Alice', role: 'Developer', status: 'idle' as const },
      { id: 'a2', name: 'Bob', role: 'DevOps', status: 'running' as const },
    ],
    tasks: [
      { id: 't1', title: 'Build login page', description: 'Create auth flow', status: 'todo' as const },
      { id: 't2', title: 'Deploy pipeline', description: 'CI/CD setup', status: 'in_progress' as const },
    ],
    currentCompany: { id: 'c1', name: 'Acme Corp' },
  })
  vi.useFakeTimers()
  mockNavigate.mockClear()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('GlobalSearch — UX-017', () => {
  it('renders search icon button in the component', () => {
    renderSearch()
    expect(screen.getByTestId('global-search-trigger')).toBeInTheDocument()
  })

  it('opens overlay when clicking the search icon', () => {
    renderSearch()
    fireEvent.click(screen.getByTestId('global-search-trigger'))
    expect(screen.getByTestId('global-search-overlay')).toBeInTheDocument()
    expect(screen.getByTestId('global-search-input')).toBeInTheDocument()
  })

  it('opens overlay on Cmd+K', () => {
    renderSearch()
    fireEvent.keyDown(document, { key: 'k', metaKey: true })
    expect(screen.getByTestId('global-search-overlay')).toBeInTheDocument()
  })

  it('opens overlay on Ctrl+K', () => {
    renderSearch()
    fireEvent.keyDown(document, { key: 'k', ctrlKey: true })
    expect(screen.getByTestId('global-search-overlay')).toBeInTheDocument()
  })

  it('closes overlay on Escape', () => {
    renderSearch()
    fireEvent.click(screen.getByTestId('global-search-trigger'))
    expect(screen.getByTestId('global-search-overlay')).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByTestId('global-search-overlay')).not.toBeInTheDocument()
  })

  it('searches with debounce 200ms, minimum 2 characters', () => {
    renderSearch()
    fireEvent.click(screen.getByTestId('global-search-trigger'))
    const input = screen.getByTestId('global-search-input')

    // 1 char — no results
    fireEvent.change(input, { target: { value: 'A' } })
    act(() => { vi.advanceTimersByTime(200) })
    expect(screen.queryByTestId('search-results')).not.toBeInTheDocument()

    // 2+ chars
    fireEvent.change(input, { target: { value: 'Ali' } })
    act(() => { vi.advanceTimersByTime(200) })
    expect(screen.getByTestId('search-results')).toBeInTheDocument()
  })

  it('searches agents by name and role', () => {
    renderSearch()
    fireEvent.click(screen.getByTestId('global-search-trigger'))
    const input = screen.getByTestId('global-search-input')
    fireEvent.change(input, { target: { value: 'Developer' } })
    act(() => { vi.advanceTimersByTime(200) })
    expect(screen.getByText('Alice')).toBeInTheDocument()
  })

  it('searches tasks by title and description', () => {
    renderSearch()
    fireEvent.click(screen.getByTestId('global-search-trigger'))
    const input = screen.getByTestId('global-search-input')
    fireEvent.change(input, { target: { value: 'auth flow' } })
    act(() => { vi.advanceTimersByTime(200) })
    expect(screen.getByText('Build login page')).toBeInTheDocument()
  })

  it('searches companies by name', () => {
    renderSearch()
    fireEvent.click(screen.getByTestId('global-search-trigger'))
    const input = screen.getByTestId('global-search-input')
    fireEvent.change(input, { target: { value: 'Acme' } })
    act(() => { vi.advanceTimersByTime(200) })
    expect(screen.getByText('Acme Corp')).toBeInTheDocument()
  })

  it('groups results by entity type', () => {
    renderSearch()
    fireEvent.click(screen.getByTestId('global-search-trigger'))
    const input = screen.getByTestId('global-search-input')
    // "Al" matches Alice (agent) only
    fireEvent.change(input, { target: { value: 'Ali' } })
    act(() => { vi.advanceTimersByTime(200) })
    expect(screen.getByTestId('search-group-agents')).toBeInTheDocument()
  })

  it('navigates to correct page on result click', () => {
    renderSearch()
    fireEvent.click(screen.getByTestId('global-search-trigger'))
    const input = screen.getByTestId('global-search-input')
    fireEvent.change(input, { target: { value: 'Acme' } })
    act(() => { vi.advanceTimersByTime(200) })
    fireEvent.click(screen.getByText('Acme Corp'))
    expect(mockNavigate).toHaveBeenCalledWith('/companies/c1')
  })

  it('supports keyboard navigation with arrow keys', () => {
    renderSearch()
    fireEvent.click(screen.getByTestId('global-search-trigger'))
    const input = screen.getByTestId('global-search-input')
    fireEvent.change(input, { target: { value: 'Ali' } })
    act(() => { vi.advanceTimersByTime(200) })

    // Arrow down selects first result
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    const selected = screen.getByTestId('search-result-active')
    expect(selected).toBeInTheDocument()

    // Enter navigates
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(mockNavigate).toHaveBeenCalled()
  })
})
