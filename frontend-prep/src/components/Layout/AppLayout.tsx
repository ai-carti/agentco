import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAppStore } from '../../store/useAppStore';
import { useAuthStore } from '../../store/useAuthStore';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AppLayoutProps {
  children: React.ReactNode;
}

// ─── Run status badge ─────────────────────────────────────────────────────────

const RUN_STATUS_COLORS = {
  idle: 'bg-gray-500',
  running: 'bg-green-500 animate-pulse',
  paused: 'bg-yellow-500',
  completed: 'bg-blue-500',
  error: 'bg-red-500',
} as const;

// ─── Component ────────────────────────────────────────────────────────────────

export const AppLayout: React.FC<AppLayoutProps> = ({ children }) => {
  const runStatus = useAppStore((s) => s.runStatus);
  const clearToken = useAuthStore((s) => s.clearToken);
  const navigate = useNavigate();

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `rounded-lg px-3 py-2 text-sm font-medium transition ${
      isActive
        ? 'bg-white/10 text-white'
        : 'text-gray-400 hover:bg-white/10 hover:text-white'
    }`;

  return (
    <div className="flex h-screen bg-gray-950 text-white">
      {/* Sidebar */}
      <aside className="flex w-56 flex-col border-r border-white/10 bg-gray-900 p-4">
        {/* Logo */}
        <NavLink to="/" className="mb-8 flex items-center gap-2 hover:opacity-80 transition">
          <span className="text-xl">🤖</span>
          <span className="text-lg font-bold tracking-tight">AgentCo</span>
        </NavLink>

        {/* Nav */}
        <nav className="flex flex-col gap-1">
          <NavLink to="/" end className={navLinkClass}>
            🏢 Companies
          </NavLink>
          <NavLink to="/settings" className={navLinkClass}>
            ⚙️ Settings
          </NavLink>
        </nav>

        {/* Run status + logout */}
        <div className="mt-auto flex flex-col gap-2">
          <div className="flex items-center gap-2 rounded-lg bg-white/5 p-3">
            <span className={`h-2.5 w-2.5 rounded-full ${RUN_STATUS_COLORS[runStatus]}`} />
            <span className="text-xs capitalize text-gray-300">Run: {runStatus}</span>
          </div>
          <button
            onClick={() => { clearToken(); navigate('/auth'); }}
            className="rounded-lg px-3 py-2 text-left text-xs text-gray-600 transition hover:text-red-400"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex flex-1 flex-col overflow-auto p-6">{children}</main>
    </div>
  );
};
