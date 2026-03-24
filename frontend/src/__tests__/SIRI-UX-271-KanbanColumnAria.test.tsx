/**
 * SIRI-UX-271: Kanban columns missing role="region" and aria-label
 * Screen readers should be able to navigate to each column as a named landmark.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import KanbanBoard from '../components/KanbanBoard'
import { useAgentStore } from '../store/agentStore'

const mockToast = { success: vi.fn(), error: vi.fn(), info: vi.fn() }
vi.mock('../context/ToastContext', () => ({
  useToast: () => mockToast,
}))

const SAMPLE_TASK: import('../store/agentStore').Task = {
  id: 't1',
  title: 'Sample Task',
  status: 'todo' as const,
}

beforeEach(() => {
  useAgentStore.setState({ tasks: [SAMPLE_TASK], agents: [], currentCompany: null })
})

describe('SIRI-UX-271: Kanban columns have ARIA region roles', () => {
  it('each column has role="region"', () => {
    render(
      <MemoryRouter>
        <KanbanBoard companyId="test-co" isLoaded />
      </MemoryRouter>
    )

    // Columns are rendered when tasks exist (non-empty board)
    const regions = screen.getAllByRole('region')
    const columnRegions = regions.filter((el) =>
      ['Backlog', 'Todo', 'In Progress', 'Done'].includes(el.getAttribute('aria-label') ?? '')
    )
    expect(columnRegions.length).toBe(4)
  })

  it('each column region has a descriptive aria-label', () => {
    render(
      <MemoryRouter>
        <KanbanBoard companyId="test-co" isLoaded />
      </MemoryRouter>
    )

    // All four Kanban columns are accessible as named regions
    expect(screen.getByRole('region', { name: 'Backlog' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Todo' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'In Progress' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Done' })).toBeTruthy()
  })
})
