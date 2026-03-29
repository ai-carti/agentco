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
        className="flex items-center justify-center min-h-screen bg-slate-900"
      >
        <div
          className="app-suspense-spinner w-8 h-8 rounded-full border-[3px] border-slate-800 border-t-blue-500"
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
