import React from 'react';
import { AgentCard } from './AgentCard';
import { useAppStore } from '../../store/useAppStore';
import type { Agent } from '../../store/useAppStore';

// ─── Props ────────────────────────────────────────────────────────────────────

interface WarRoomProps {
  /** Override agents from store (useful for testing / storybook) */
  agents?: Agent[];
}

// ─── Component ────────────────────────────────────────────────────────────────

export const WarRoom: React.FC<WarRoomProps> = ({ agents: agentsProp }) => {
  const storeAgents = useAppStore((s) => s.agents);
  const agents = agentsProp ?? storeAgents;

  return (
    <section data-testid="war-room" className="flex flex-col gap-4">
      <h2 className="text-lg font-bold text-white">⚔️ War Room</h2>

      {agents.length === 0 ? (
        <p className="text-sm text-gray-500">No agents deployed yet.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {agents.map((agent) => (
            <AgentCard
              key={agent.id}
              name={agent.name}
              role={agent.role}
              status={agent.status}
            />
          ))}
        </div>
      )}
    </section>
  );
};
