import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'

type Tab = 'signin' | 'signup'

export default function AuthPage() {
  const [tab, setTab] = useState<Tab>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const { login, register, isLoading, error } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation()

  // BUG-010: read the "from" location saved by ProtectedRoute
  // BUG-012: guard against redirect loop back to /auth
  const rawFrom = (location.state as { from?: Location })?.from?.pathname
  const from = rawFrom && rawFrom !== '/auth' ? rawFrom : '/'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (tab === 'signin') {
      await login(email, password)
    } else {
      await register(email, password)
    }
    // BUG-010: navigate to original URL after successful auth
    // Only navigate if no error — check store state after action
    const token = useAuthStore.getState().token
    if (token) {
      navigate(from, { replace: true })
    }
  }

  const styles = {
    page: {
      minHeight: '100vh',
      background: '#0a0a0f',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'sans-serif',
    } as React.CSSProperties,
    card: {
      width: '100%',
      maxWidth: 400,
      padding: '2rem',
      background: '#111118',
      borderRadius: 12,
      border: '1px solid #1e1e2e',
    } as React.CSSProperties,
    tabs: {
      display: 'flex',
      gap: 0,
      marginBottom: '1.5rem',
      borderBottom: '1px solid #1e1e2e',
    } as React.CSSProperties,
    tab: (active: boolean): React.CSSProperties => ({
      padding: '0.6rem 1.2rem',
      background: 'none',
      border: 'none',
      cursor: 'pointer',
      color: active ? '#6c47ff' : '#6b7280',
      fontWeight: active ? 600 : 400,
      borderBottom: active ? '2px solid #6c47ff' : '2px solid transparent',
      marginBottom: -1,
      fontSize: '0.95rem',
      transition: 'color 0.15s',
    }),
    label: {
      display: 'block',
      color: '#9ca3af',
      fontSize: '0.8rem',
      marginBottom: '0.35rem',
      textTransform: 'uppercase' as const,
      letterSpacing: '0.05em',
    } as React.CSSProperties,
    input: {
      width: '100%',
      padding: '0.65rem 0.9rem',
      background: '#0a0a0f',
      border: '1px solid #1e1e2e',
      borderRadius: 8,
      color: '#f8fafc',
      fontSize: '0.95rem',
      outline: 'none',
      boxSizing: 'border-box' as const,
      marginBottom: '1rem',
    } as React.CSSProperties,
    button: {
      width: '100%',
      padding: '0.75rem',
      background: '#6c47ff',
      color: '#fff',
      border: 'none',
      borderRadius: 8,
      fontSize: '1rem',
      fontWeight: 600,
      cursor: 'pointer',
      marginTop: '0.5rem',
      opacity: isLoading ? 0.7 : 1,
    } as React.CSSProperties,
    error: {
      color: '#ef4444',
      fontSize: '0.875rem',
      marginBottom: '1rem',
      padding: '0.5rem 0.75rem',
      background: '#1f0a0a',
      borderRadius: 6,
      border: '1px solid #3f1010',
    } as React.CSSProperties,
    title: {
      color: '#f8fafc',
      fontSize: '1.4rem',
      fontWeight: 700,
      marginBottom: '1.5rem',
      textAlign: 'center' as const,
    } as React.CSSProperties,
  }

  return (
    <div data-testid="auth-page" style={styles.page}>
      <div style={styles.card}>
        <h1 style={styles.title}>AgentCo</h1>

        <p
          data-testid="auth-tagline"
          style={{
            textAlign: 'center',
            color: '#6b7280',
            fontSize: '0.85rem',
            margin: '-0.75rem 0 1.5rem',
            lineHeight: 1.5,
          }}
        >
          Your AI team, working 24/7
        </p>

        <div role="tablist" style={styles.tabs}>
          <button
            id="tab-signin"
            role="tab"
            aria-selected={tab === 'signin'}
            aria-controls="tabpanel-auth"
            style={styles.tab(tab === 'signin')}
            onClick={() => setTab('signin')}
            type="button"
          >
            Sign In
          </button>
          <button
            id="tab-signup"
            role="tab"
            aria-selected={tab === 'signup'}
            aria-controls="tabpanel-auth"
            style={styles.tab(tab === 'signup')}
            onClick={() => setTab('signup')}
            type="button"
          >
            Sign Up
          </button>
        </div>

        {/* SIRI-UX-108: aria-labelledby links tabpanel to active tab for screen readers */}
        <div
          id="tabpanel-auth"
          role="tabpanel"
          aria-labelledby={tab === 'signin' ? 'tab-signin' : 'tab-signup'}
        >
        {error && <div style={styles.error}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <input
            id="auth-email"
            aria-label="Email address"
            style={styles.input}
            className="input-focus-ring"
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />

          <input
            id="auth-password"
            aria-label="Password"
            style={styles.input}
            className="input-focus-ring"
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete={tab === 'signin' ? 'current-password' : 'new-password'}
          />

          <div style={{ textAlign: 'right', marginTop: '-0.75rem', marginBottom: '1rem' }}>
            <span
              title="Coming soon"
              style={{ color: '#6b7280', fontSize: '0.8rem', cursor: 'default' }}
            >
              Forgot password?
            </span>
          </div>

          <button style={styles.button} type="submit" disabled={isLoading}>
            {isLoading ? 'Loading…' : tab === 'signin' ? 'Sign In' : 'Sign Up'}
          </button>
        </form>
        </div>
      </div>
    </div>
  )
}
