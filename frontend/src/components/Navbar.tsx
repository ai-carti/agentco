import { NavLink } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import GlobalSearch from './GlobalSearch'

export default function Navbar() {
  const { user, logout } = useAuthStore()

  // SIRI-UX-141: aria-label distinguishes this nav from Sidebar nav for screen readers
  return (
    <nav
      aria-label="Main navigation"
      data-testid="navbar"
      className="flex items-center justify-between px-6 py-3 border-b border-slate-800 bg-slate-900"
    >
      <div className="flex items-center gap-6">
        {/* SIRI-UX-044: Logo only — nav links live in Sidebar */}
        <NavLink
          to="/"
          className="font-bold text-lg text-slate-50 no-underline"
        >
          AgentCo
        </NavLink>
      </div>
      <div className="flex items-center gap-3">
        <GlobalSearch />
        {user && (
          <span className="text-gray-400 text-sm">
            {user.email}
          </span>
        )}
        {/* SIRI-UX-259: replaced JS hover with CSS class .navbar-logout-btn */}
        <button
          onClick={logout}
          className="navbar-logout-btn"
        >
          Logout
        </button>
      </div>
    </nav>
  )
}
