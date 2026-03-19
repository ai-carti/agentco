import React, { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { WarRoom } from '../components/WarRoom/WarRoom';
import { KanbanBoard } from '../components/Kanban/KanbanBoard';
import { useAppStore } from '../store/useAppStore';

// Seed data per company (until API wired)
const SEED_AGENTS = [
  { id: '1', name: 'Alex', role: 'Backend Engineer', status: 'thinking' as const },
  { id: '2', name: 'Siri', role: 'Frontend Engineer', status: 'idle' as const },
  { id: '3', name: 'Tima', role: 'CTO', status: 'done' as const },
];

const SEED_TASKS = [
  { id: 't1', title: 'M0-001: Setup monorepo', status: 'in_progress' as const, assignee: 'Alex' },
  { id: 't2', title: 'M0-002: FastAPI skeleton', status: 'backlog' as const, assignee: 'Alex' },
  { id: 't3', title: 'M0-005: Frontend prep', status: 'in_progress' as const, assignee: 'Siri' },
  { id: 't4', title: 'M0-003: Define API contracts', status: 'done' as const, assignee: 'Tima' },
];

export const CompanyPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { setAgents, setTasks, setRunStatus } = useAppStore();
  const tasks = useAppStore((s) => s.tasks);

  useEffect(() => {
    // TODO: fetch from API using `id`
    setAgents(SEED_AGENTS);
    setTasks(SEED_TASKS);
    setRunStatus('running');
  }, [id, setAgents, setTasks, setRunStatus]);

  return (
    <div className="flex flex-col gap-8">
      <WarRoom />
      <KanbanBoard tasks={tasks} />
    </div>
  );
};
