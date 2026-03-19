import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function renderWithRouter(initialPath: string, authenticated = false) {
  // Reset auth state
  const { setToken, clearToken } = useAuthStore.getState();
  if (authenticated) {
    setToken('test-token');
  } else {
    clearToken();
  }

  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/auth" element={<div>AUTH PAGE</div>} />
        <Route path="/" element={<div>COMPANIES PAGE</div>} />
        <Route path="/companies/:id" element={<div>COMPANY PAGE</div>} />
        <Route path="/companies/:id/agents/:agentId" element={<div>AGENT PAGE</div>} />
        <Route path="/settings" element={<div>SETTINGS PAGE</div>} />
      </Routes>
    </MemoryRouter>
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Routing structure', () => {
  it('renders /auth route', () => {
    renderWithRouter('/auth', false);
    expect(screen.getByText('AUTH PAGE')).toBeDefined();
  });

  it('renders / (companies list) route when authenticated', () => {
    renderWithRouter('/', true);
    expect(screen.getByText('COMPANIES PAGE')).toBeDefined();
  });

  it('renders /companies/:id route', () => {
    renderWithRouter('/companies/c1', true);
    expect(screen.getByText('COMPANY PAGE')).toBeDefined();
  });

  it('renders /companies/:id/agents/:agentId route', () => {
    renderWithRouter('/companies/c1/agents/a1', true);
    expect(screen.getByText('AGENT PAGE')).toBeDefined();
  });

  it('renders /settings route', () => {
    renderWithRouter('/settings', true);
    expect(screen.getByText('SETTINGS PAGE')).toBeDefined();
  });
});

describe('ProtectedRoute', () => {
  beforeEach(() => {
    useAuthStore.getState().clearToken();
  });

  it('useAuthStore: isAuthenticated returns false when no token', () => {
    const { isAuthenticated } = useAuthStore.getState();
    expect(isAuthenticated()).toBe(false);
  });

  it('useAuthStore: isAuthenticated returns true after setToken', () => {
    const { setToken, isAuthenticated } = useAuthStore.getState();
    setToken('my-token');
    expect(isAuthenticated()).toBe(true);
  });

  it('useAuthStore: isAuthenticated returns false after clearToken', () => {
    const { setToken, clearToken, isAuthenticated } = useAuthStore.getState();
    setToken('my-token');
    clearToken();
    expect(isAuthenticated()).toBe(false);
  });
});
