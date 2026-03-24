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
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0.75rem 1.5rem',
        borderBottom: '1px solid #1e293b',
        background: '#0f172a',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
        {/* SIRI-UX-044: Logo only — nav links live in Sidebar */}
        <NavLink
          to="/"
          style={{ fontWeight: 700, fontSize: '1.1rem', color: '#f8fafc', textDecoration: 'none' }}
        >
          AgentCo
        </NavLink>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <GlobalSearch />
        {user && (
          <span style={{ color: '#9ca3af', fontSize: '0.875rem' }}>
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
