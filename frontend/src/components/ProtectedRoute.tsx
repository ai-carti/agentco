import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'

export default function ProtectedRoute() {
  const token = useAuthStore((s) => s.token)
  const isInitialized = useAuthStore((s) => s.isInitialized)
  const location = useLocation()

  // BUG-011: wait for initAuth() to complete before making routing decisions
  // SIRI-UX-398: show a loading indicator instead of null to avoid blank flash on F5/page load
  if (!isInitialized) {
    return (
      <div
        role="status"
        aria-label="Loading..."
        aria-busy="true"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          background: '#0f172a',
        }}
      >
        <div
          className="app-suspense-spinner"
          style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            border: '3px solid #1e293b',
            borderTopColor: '#3b82f6',
          }}
        />
      </div>
    )
  }

  // BUG-010: save current location in state so AuthPage can redirect back
  if (!token) {
    return <Navigate to="/auth" state={{ from: location }} replace />
  }

  return <Outlet />
}
