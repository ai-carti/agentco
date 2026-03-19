import React, { useState } from 'react';
import { Navigate, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';

export const AuthPage: React.FC = () => {
  const { token, setToken } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [apiKey, setApiKey] = useState('');
  const from = (location.state as { from?: { pathname: string } })?.from?.pathname ?? '/';

  // Already authenticated — redirect
  if (token) {
    return <Navigate to={from} replace />;
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKey.trim()) return;
    setToken(apiKey.trim());
    navigate(from, { replace: true });
  };

  return (
    <div className="flex h-screen items-center justify-center bg-gray-950">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-gray-900 p-8 shadow-2xl">
        <div className="mb-6 flex items-center gap-3">
          <span className="text-3xl">🤖</span>
          <div>
            <h1 className="text-xl font-bold text-white">AgentCo</h1>
            <p className="text-sm text-gray-400">Sign in to continue</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-300" htmlFor="apiKey">
              API Token
            </label>
            <input
              id="apiKey"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Enter your token..."
              className="rounded-lg border border-white/10 bg-gray-800 px-4 py-2.5 text-sm text-white placeholder-gray-500 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              autoFocus
            />
          </div>

          <button
            type="submit"
            className="mt-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-500 active:scale-95"
          >
            Continue →
          </button>
        </form>

        {/* Dev shortcut */}
        <p className="mt-4 text-center text-xs text-gray-600">
          Dev mode?{' '}
          <button
            className="text-indigo-400 hover:underline"
            onClick={() => { setToken('dev-token'); navigate(from, { replace: true }); }}
          >
            Skip auth
          </button>
        </p>
      </div>
    </div>
  );
};
