import { Link } from 'react-router-dom'

export default function SettingsPage() {
  return (
    <div data-testid="settings-page" style={{ padding: '1rem' }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0, marginBottom: '1rem' }}>
        Settings
      </h1>
      <p style={{ color: '#9ca3af' }}>LLM credentials</p>
      <div style={{ marginTop: '1.5rem' }}>
        <Link
          to="/settings/billing"
          data-testid="settings-billing-link"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.5rem 1rem',
            background: '#1e293b',
            border: '1px solid #334155',
            borderRadius: 6,
            color: '#f1f5f9',
            textDecoration: 'none',
            fontSize: '0.9rem',
          }}
        >
          💳 Billing
        </Link>
      </div>
    </div>
  )
}
