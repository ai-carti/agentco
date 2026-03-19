import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAppStore } from '../store/useAppStore';

const STATUS_COLORS = {
  idle: 'text-gray-400',
  thinking: 'text-yellow-400',
  done: 'text-green-400',
} as const;

const STATUS_LABELS = {
  idle: '⏸ Idle',
  thinking: '🧠 Thinking…',
  done: '✅ Done',
} as const;

export const AgentPage: React.FC = () => {
  const { id: companyId, agentId } = useParams<{ id: string; agentId: string }>();
  const agents = useAppStore((s) => s.agents);
  const tasks = useAppStore((s) => s.tasks);
  const agent = agents.find((a) => a.id === agentId);

  if (!agent) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-gray-500">
        <p className="text-5xl">🤔</p>
        <p>Agent not found</p>
        <Link to={`/companies/${companyId}`} className="text-indigo-400 hover:underline text-sm">
          ← Back to company
        </Link>
      </div>
    );
  }

  const agentTasks = tasks.filter((t) => t.assignee === agent.name);

  return (
    <div className="mx-auto max-w-2xl py-8">
      {/* Back */}
      <Link
        to={`/companies/${companyId}`}
        className="mb-6 inline-flex items-center gap-1 text-sm text-gray-400 hover:text-white transition"
      >
        ← Back to War Room
      </Link>

      {/* Header */}
      <div className="mb-8 flex items-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-indigo-900/50 text-3xl">
          🤖
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">{agent.name}</h1>
          <p className="text-gray-400">{agent.role}</p>
          <p className={`mt-1 text-sm font-medium ${STATUS_COLORS[agent.status]}`}>
            {STATUS_LABELS[agent.status]}
          </p>
        </div>
      </div>

      {/* Task portfolio */}
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">
          Task Portfolio
        </h2>
        {agentTasks.length > 0 ? (
          <div className="flex flex-col gap-2">
            {agentTasks.map((task) => (
              <div
                key={task.id}
                className="flex items-center justify-between rounded-lg border border-white/10 bg-gray-900 px-4 py-3"
              >
                <span className="text-sm text-white">{task.title}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    task.status === 'done'
                      ? 'bg-green-900/50 text-green-400'
                      : task.status === 'in_progress'
                      ? 'bg-yellow-900/50 text-yellow-400'
                      : 'bg-gray-800 text-gray-400'
                  }`}
                >
                  {task.status.replace('_', ' ')}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-600">No tasks assigned yet.</p>
        )}
      </div>
    </div>
  );
};
