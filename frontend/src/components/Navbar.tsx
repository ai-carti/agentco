import { NavLink } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import GlobalSearch from './GlobalSearch'

export default function Navbar() {
  const { user, logout } = useAuthStore()

  return (
    <nav
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
        <NavLink
          to="/"
          style={{ fontWeight: 700, fontSize: '1.1rem', color: '#f8fafc', textDecoration: 'none' }}
        >
          AgentCo
        </NavLink>
        <NavLink
          to="/"
          end
          style={({ isActive }) => ({
            color: isActive ? '#f8fafc' : '#9ca3af',
            textDecoration: 'none',
            fontSize: '0.9rem',
          })}
        >
          Companies
        </NavLink>
        <NavLink
          to="/settings"
          style={({ isActive }) => ({
            color: isActive ? '#f8fafc' : '#9ca3af',
            textDecoration: 'none',
            fontSize: '0.9rem',
          })}
        >
          Settings
        </NavLink>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <GlobalSearch />
        {user && (
          <span style={{ color: '#9ca3af', fontSize: '0.875rem' }}>
            {user.email}
          </span>
        )}
        <button
          onClick={logout}
          style={{
            padding: '0.35rem 0.9rem',
            background: 'transparent',
            border: '1px solid #374151',
            borderRadius: 6,
            color: '#9ca3af',
            fontSize: '0.8rem',
            cursor: 'pointer',
            transition: 'border-color 0.15s, color 0.15s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = '#6b7280'
            e.currentTarget.style.color = '#e5e7eb'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = '#374151'
            e.currentTarget.style.color = '#9ca3af'
          }}
        >
          Logout
        </button>
      </div>
    </nav>
  )
}
