import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { KanbanBoard } from '../components/Kanban/KanbanBoard';

describe('KanbanBoard', () => {
  it('shows columns', () => {
    render(<KanbanBoard tasks={[]} />);
    expect(screen.getByText('Backlog')).toBeDefined();
    expect(screen.getByText('In Progress')).toBeDefined();
    expect(screen.getByText('Done')).toBeDefined();
  });

  it('renders tasks in correct columns', () => {
    const tasks = [
      { id: '1', title: 'Setup monorepo', status: 'backlog' as const, assignee: 'Alex' },
      { id: '2', title: 'Build API', status: 'in_progress' as const, assignee: 'Alex' },
      { id: '3', title: 'Design mockups', status: 'done' as const, assignee: 'Siri' },
    ];
    render(<KanbanBoard tasks={tasks} />);
    expect(screen.getByText('Setup monorepo')).toBeDefined();
    expect(screen.getByText('Build API')).toBeDefined();
    expect(screen.getByText('Design mockups')).toBeDefined();
  });
});
