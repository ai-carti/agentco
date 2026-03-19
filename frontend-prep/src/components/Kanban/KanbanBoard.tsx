import React from 'react';
import { TaskCard } from './TaskCard';
import type { Task, TaskStatus } from '../../store/useAppStore';

// ─── Column config ────────────────────────────────────────────────────────────

interface Column {
  id: TaskStatus;
  label: string;
  color: string;
}

const COLUMNS: Column[] = [
  { id: 'backlog', label: 'Backlog', color: 'border-gray-500' },
  { id: 'in_progress', label: 'In Progress', color: 'border-yellow-500' },
  { id: 'done', label: 'Done', color: 'border-green-500' },
];

// ─── Props ────────────────────────────────────────────────────────────────────

interface KanbanBoardProps {
  tasks: Task[];
}

// ─── Component ────────────────────────────────────────────────────────────────

export const KanbanBoard: React.FC<KanbanBoardProps> = ({ tasks }) => {
  const getColumnTasks = (status: TaskStatus) =>
    tasks.filter((t) => t.status === status);

  return (
    <section data-testid="kanban-board" className="flex flex-col gap-4">
      <h2 className="text-lg font-bold text-white">📋 Kanban</h2>

      <div className="grid grid-cols-3 gap-4">
        {COLUMNS.map((col) => {
          const colTasks = getColumnTasks(col.id);
          return (
            <div
              key={col.id}
              data-testid={`column-${col.id}`}
              className={`flex flex-col gap-2 rounded-xl border-t-2 bg-white/5 p-3 ${col.color}`}
            >
              {/* Header */}
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-white">{col.label}</span>
                <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-gray-300">
                  {colTasks.length}
                </span>
              </div>

              {/* Tasks */}
              <div className="flex flex-col gap-2">
                {colTasks.map((task) => (
                  <TaskCard key={task.id} task={task} />
                ))}
                {colTasks.length === 0 && (
                  <p className="py-4 text-center text-xs text-gray-600">Empty</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};
