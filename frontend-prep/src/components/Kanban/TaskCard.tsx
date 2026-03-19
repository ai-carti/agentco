import React from 'react';
import type { Task } from '../../store/useAppStore';

// ─── Component ────────────────────────────────────────────────────────────────

interface TaskCardProps {
  task: Task;
}

export const TaskCard: React.FC<TaskCardProps> = ({ task }) => {
  return (
    <div
      data-testid="task-card"
      className="rounded-lg border border-white/10 bg-white/5 p-3 text-sm transition hover:bg-white/10"
    >
      <p className="font-medium text-white">{task.title}</p>
      {task.description && (
        <p className="mt-1 text-xs text-gray-400 line-clamp-2">{task.description}</p>
      )}
      {task.assignee && (
        <div className="mt-2 flex items-center gap-1">
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-600 text-[10px] font-bold text-white">
            {task.assignee.charAt(0).toUpperCase()}
          </div>
          <span className="text-xs text-gray-400">{task.assignee}</span>
        </div>
      )}
    </div>
  );
};
