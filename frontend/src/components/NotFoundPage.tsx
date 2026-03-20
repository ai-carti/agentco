import { useNavigate } from 'react-router-dom'

export default function NotFoundPage() {
  const navigate = useNavigate()

  return (
    <div
      data-testid="not-found-page"
      style={{
        padding: '3rem 1.5rem',
        textAlign: 'center',
        color: '#9ca3af',
        minHeight: '60vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>404</div>
      <div
        style={{
          fontSize: '1.25rem',
          fontWeight: 700,
          color: '#f1f5f9',
          marginBottom: '0.5rem',
        }}
      >
        Page not found
      </div>
      <div
        style={{
          fontSize: '0.875rem',
          color: '#6b7280',
          marginBottom: '1.5rem',
        }}
      >
        The page you're looking for doesn't exist.
      </div>
      <button
        data-testid="not-found-home-btn"
        onClick={() => navigate('/')}
        style={{
          padding: '0.5rem 1.25rem',
          background: '#2563eb',
          color: '#fff',
          border: 'none',
          borderRadius: 6,
          fontSize: '0.875rem',
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        Go home
      </button>
    </div>
  )
}
