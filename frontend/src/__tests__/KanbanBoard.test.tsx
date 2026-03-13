import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import KanbanBoard from '../components/KanbanBoard'

describe('KanbanBoard', () => {
  it('renders without crash', () => {
    render(<KanbanBoard />)
    expect(screen.getByTestId('kanban-board')).toBeInTheDocument()
  })

  it('shows default columns', () => {
    render(<KanbanBoard />)
    expect(screen.getByText(/todo/i)).toBeInTheDocument()
    expect(screen.getByText(/in progress/i)).toBeInTheDocument()
    expect(screen.getByText(/done/i)).toBeInTheDocument()
  })
})
