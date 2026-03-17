import { useState, useEffect, useCallback } from 'react'
import { NavLink } from 'react-router-dom'

const EXPANDED_WIDTH = 240
const COLLAPSED_WIDTH = 48
const STORAGE_KEY = 'sidebar:collapsed'
const TABLET_BREAKPOINT = 1024
const MOBILE_BREAKPOINT = 640

const NAV_ITEMS = [
  { to: '/', label: 'Companies', icon: '\u{1F3E2}', testId: 'sidebar-nav-companies' },
  { to: '/war-room', label: 'War Room', icon: '\u{2694}\u{FE0F}', testId: 'sidebar-nav-warroom' },
  { to: '/library', label: 'Library', icon: '\u{1F4DA}', testId: 'sidebar-nav-library' },
  { to: '/settings', label: 'Settings', icon: '\u{2699}\u{FE0F}', testId: 'sidebar-nav-settings' },
]

function getInitialCollapsed(): boolean {
  if (typeof window === 'undefined') return false
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored !== null) return stored === 'true'
  return window.innerWidth < TABLET_BREAKPOINT
}

function isMobile(): boolean {
  return typeof window !== 'undefined' && window.innerWidth < MOBILE_BREAKPOINT
}

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(getInitialCollapsed)
  const [mobile, setMobile] = useState(isMobile)

  useEffect(() => {
    const handleResize = () => {
      setMobile(isMobile())
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev
      localStorage.setItem(STORAGE_KEY, String(next))
      return next
    })
  }, [])

  const showBackdrop = mobile && !collapsed

  return (
    <>
      {showBackdrop && (
        <div
          data-testid="sidebar-backdrop"
          onClick={() => { setCollapsed(true); localStorage.setItem(STORAGE_KEY, 'true') }}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 39,
          }}
        />
      )}
      <aside
        data-testid="sidebar"
        style={{
          width: collapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH,
          minHeight: '100%',
          background: '#111827',
          borderRight: '1px solid #1e293b',
          display: 'flex',
          flexDirection: 'column',
          transition: 'width 0.2s ease',
          overflow: 'hidden',
          flexShrink: 0,
          position: mobile ? 'fixed' : 'relative',
          top: mobile ? 0 : undefined,
          left: mobile ? 0 : undefined,
          bottom: mobile ? 0 : undefined,
          zIndex: mobile ? 40 : undefined,
        }}
      >
        {/* Toggle button */}
        <button
          data-testid="sidebar-toggle"
          onClick={toggle}
          style={{
            background: 'transparent', border: 'none', color: '#9ca3af',
            cursor: 'pointer', padding: '0.75rem', fontSize: '1rem',
            display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'flex-end',
            borderBottom: '1px solid #1e293b',
          }}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? '\u{2630}' : '\u{2190}'}
        </button>

        {/* Nav items */}
        <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', padding: '0.5rem' }}>
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              data-testid={item.testId}
              title={item.label}
              onClick={() => { if (mobile) { setCollapsed(true); localStorage.setItem(STORAGE_KEY, 'true') } }}
              style={({ isActive }) => ({
                display: 'flex', alignItems: 'center', gap: '0.6rem',
                padding: collapsed ? '0.5rem' : '0.5rem 0.75rem',
                borderRadius: 6, textDecoration: 'none',
                color: isActive ? '#f8fafc' : '#9ca3af',
                background: isActive ? '#1e293b' : 'transparent',
                fontSize: '0.85rem', whiteSpace: 'nowrap',
                justifyContent: collapsed ? 'center' : 'flex-start',
              })}
            >
              <span style={{ fontSize: '1rem', flexShrink: 0 }}>{item.icon}</span>
              {!collapsed && <span>{item.label}</span>}
            </NavLink>
          ))}
        </nav>
      </aside>
    </>
  )
}
