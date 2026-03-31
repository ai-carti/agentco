/**
 * SIRI-UX-452: KanbanBoard has overflow-x-auto so 6 columns scroll on narrow screens
 */
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import KanbanBoard from '../components/KanbanBoard'

describe('SIRI-UX-452: KanbanBoard overflow-x scrollable', () => {
  it('kanban-board container has overflow-x-auto class', () => {
    render(
      <MemoryRouter>
        <KanbanBoard companyId="co-1" isLoaded={true} hasMore={false} />
      </MemoryRouter>,
    )
    const board = screen.getByTestId('kanban-board')
    expect(board.className).toMatch(/overflow-x-auto/)
  })
})
