import React from 'react';
import { Link } from 'react-router-dom';

// Mock data until M1-002 API is wired
const MOCK_COMPANIES = [
  { id: 'c1', name: 'Startup Alpha', status: 'running', agents: 3, tasks: 7 },
  { id: 'c2', name: 'Beta Corp', status: 'idle', agents: 2, tasks: 4 },
];

const STATUS_COLORS: Record<string, string> = {
  running: 'bg-green-500 animate-pulse',
  idle: 'bg-gray-500',
  paused: 'bg-yellow-500',
};

export const CompaniesPage: React.FC = () => {
  return (
    <div className="mx-auto max-w-3xl py-10">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Companies</h1>
        <button className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 transition">
          + New Company
        </button>
      </div>

      <div className="flex flex-col gap-3">
        {MOCK_COMPANIES.map((company) => (
          <Link
            key={company.id}
            to={`/companies/${company.id}`}
            className="flex items-center justify-between rounded-xl border border-white/10 bg-gray-900 p-5 transition hover:border-indigo-500/50 hover:bg-gray-800"
          >
            <div className="flex items-center gap-3">
              <span className={`h-2.5 w-2.5 rounded-full ${STATUS_COLORS[company.status] ?? 'bg-gray-500'}`} />
              <div>
                <p className="font-semibold text-white">{company.name}</p>
                <p className="text-xs text-gray-400">
                  {company.agents} agents · {company.tasks} tasks
                </p>
              </div>
            </div>
            <span className="text-gray-500">→</span>
          </Link>
        ))}
      </div>

      {MOCK_COMPANIES.length === 0 && (
        <div className="mt-20 text-center text-gray-500">
          <p className="text-4xl">🏢</p>
          <p className="mt-2">No companies yet. Create your first one!</p>
        </div>
      )}
    </div>
  );
};
