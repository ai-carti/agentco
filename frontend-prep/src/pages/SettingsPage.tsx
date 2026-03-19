import React, { useState } from 'react';
import { useAuthStore } from '../store/useAuthStore';
import { useNavigate } from 'react-router-dom';

const LLM_PROVIDERS = [
  { id: 'openai', label: 'OpenAI', placeholder: 'sk-...' },
  { id: 'anthropic', label: 'Anthropic', placeholder: 'sk-ant-...' },
  { id: 'groq', label: 'Groq', placeholder: 'gsk_...' },
];

export const SettingsPage: React.FC = () => {
  const clearToken = useAuthStore((s) => s.clearToken);
  const navigate = useNavigate();
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    // TODO: persist to backend
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleLogout = () => {
    clearToken();
    navigate('/auth');
  };

  return (
    <div className="mx-auto max-w-lg py-10">
      <h1 className="mb-2 text-2xl font-bold text-white">Settings</h1>
      <p className="mb-8 text-sm text-gray-400">Configure LLM providers and credentials.</p>

      <form onSubmit={handleSave} className="flex flex-col gap-5">
        {LLM_PROVIDERS.map((p) => (
          <div key={p.id} className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-300" htmlFor={p.id}>
              {p.label} API Key
            </label>
            <input
              id={p.id}
              type="password"
              value={keys[p.id] ?? ''}
              onChange={(e) => setKeys((k) => ({ ...k, [p.id]: e.target.value }))}
              placeholder={p.placeholder}
              className="rounded-lg border border-white/10 bg-gray-800 px-4 py-2.5 text-sm text-white placeholder-gray-600 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        ))}

        <button
          type="submit"
          className="mt-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-500"
        >
          {saved ? '✓ Saved!' : 'Save credentials'}
        </button>
      </form>

      <hr className="my-8 border-white/10" />

      <button
        onClick={handleLogout}
        className="w-full rounded-lg border border-red-800/50 bg-red-900/20 px-4 py-2.5 text-sm font-medium text-red-400 transition hover:bg-red-900/40"
      >
        Sign out
      </button>
    </div>
  );
};
