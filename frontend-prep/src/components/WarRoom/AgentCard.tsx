import React from 'react';
import type { AgentStatus } from '../../store/useAppStore';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AgentCardProps {
  name: string;
  role: string;
  status: AgentStatus;
}

// ─── Status helpers ───────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<AgentStatus, { label: string; color: string; pulse: boolean }> = {
  idle: { label: 'Idle', color: 'bg-gray-400', pulse: false },
  thinking: { label: 'Thinking...', color: 'bg-yellow-400', pulse: true },
  done: { label: 'Done', color: 'bg-green-400', pulse: false },
};

// ─── Component ────────────────────────────────────────────────────────────────

export const AgentCard: React.FC<AgentCardProps> = ({ name, role, status }) => {
  const cfg = STATUS_CONFIG[status];

  return (
    <div
      data-testid="agent-card"
      className="flex flex-col gap-2 rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm transition hover:bg-white/10"
    >
      {/* Avatar placeholder */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-600 text-sm font-bold text-white">
          {name.charAt(0).toUpperCase()}
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-white">{name}</span>
          <span className="text-xs text-gray-400">{role}</span>
        </div>
      </div>

      {/* Status badge */}
      <div className="flex items-center gap-2">
        <span
          className={`h-2 w-2 rounded-full ${cfg.color} ${cfg.pulse ? 'animate-pulse' : ''}`}
        />
        <span className="text-xs text-gray-300">{cfg.label}</span>
      </div>
    </div>
  );
};
