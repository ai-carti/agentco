import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'

export default function ProtectedRoute() {
  const token = useAuthStore((s) => s.token)
  const isInitialized = useAuthStore((s) => s.isInitialized)
  const location = useLocation()

  // BUG-011: wait for initAuth() to complete before making routing decisions
  if (!isInitialized) {
    return null
  }

  // BUG-010: save current location in state so AuthPage can redirect back
  if (!token) {
    return <Navigate to="/auth" state={{ from: location }} replace />
  }

  return <Outlet />
}
