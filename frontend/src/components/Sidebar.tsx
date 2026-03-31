import { useState, useCallback, useMemo } from 'react'
import { NavLink } from 'react-router-dom'
import { useAgentStore } from '../store/agentStore'
import { useIsMobile } from '../hooks/useIsMobile'

// SIRI-UX-450: EXPANDED_WIDTH/COLLAPSED_WIDTH replaced by Tailwind classes w-60/w-12
const STORAGE_KEY = 'sidebar:collapsed'
const TABLET_BREAKPOINT = 1024

function getInitialCollapsed(): boolean {
  if (typeof window === 'undefined') return false
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored !== null) return stored === 'true'
  return window.innerWidth < TABLET_BREAKPOINT
}

// SIRI-UX-272: static nav items at module-level — no object recreation on each render
const STATIC_NAV_ITEMS = [
  { label: 'Companies', icon: '\u{1F3E2}', testId: 'sidebar-nav-companies', to: '/', end: true },
  { label: 'Library', icon: '\u{1F4DA}', testId: 'sidebar-nav-library', to: '/library', end: false },
  { label: 'Settings', icon: '\u{2699}\u{FE0F}', testId: 'sidebar-nav-settings', to: '/settings', end: false },
] as const

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(getInitialCollapsed)
  const mobile = useIsMobile()
  const currentCompany = useAgentStore((s) => s.currentCompany)

  // SIRI-UX-272: only War Room `to` is dynamic — avoid re-declaring all 4 items per render
  const warRoomTo = currentCompany ? `/companies/${currentCompany.id}` : '/'

  // SIRI-UX-335: useMemo so NAV_ITEMS array is not recreated on every render (only when warRoomTo changes)
  const NAV_ITEMS = useMemo(() => [
    STATIC_NAV_ITEMS[0], // Companies
    { to: warRoomTo, label: 'War Room', icon: '\u{2694}\u{FE0F}', testId: 'sidebar-nav-warroom', end: false } as const,
    STATIC_NAV_ITEMS[1], // Library
    STATIC_NAV_ITEMS[2], // Settings
  ], [warRoomTo])

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
          role="button"
          tabIndex={0}
          aria-label="Close sidebar"
          onClick={() => { setCollapsed(true); localStorage.setItem(STORAGE_KEY, 'true') }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') {
              setCollapsed(true)
              localStorage.setItem(STORAGE_KEY, 'true')
            }
          }}
          className="fixed inset-0 bg-black/50 z-[39]"
        />
      )}
      <aside
        data-testid="sidebar"
        className={[
          'flex flex-col border-r border-slate-800 bg-gray-900 transition-[width] duration-200 ease-in-out overflow-hidden shrink-0',
          // SIRI-UX-450: width via Tailwind — w-12 = 48px (collapsed), w-60 = 240px (expanded)
          collapsed ? 'w-12' : 'w-60',
          // SIRI-UX-450: minHeight via Tailwind
          'min-h-full',
          // SIRI-UX-450: position/top/left/bottom/zIndex via Tailwind
          mobile ? 'fixed top-0 left-0 bottom-0 z-[40]' : 'relative',
        ].join(' ')}
      >
        {/* Toggle button */}
        <button
          data-testid="sidebar-toggle"
          onClick={toggle}
          className={`bg-transparent border-none text-gray-400 cursor-pointer p-3 text-base flex items-center border-b border-slate-800 ${collapsed ? 'justify-center' : 'justify-end'}`}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? '\u{2630}' : '\u{2190}'}
        </button>

        {/* Nav items */}
        {/* SIRI-UX-141: aria-label distinguishes sidebar nav from Navbar nav for screen readers */}
        <nav aria-label="Sidebar navigation" className="flex flex-col gap-1 p-2">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.testId}
              to={item.to}
              // SIRI-UX-214: pass `end` prop when item requires exact match (e.g., Companies at "/")
              end={'end' in item ? item.end : undefined}
              data-testid={item.testId}
              title={item.label}
              onClick={() => { if (mobile) { setCollapsed(true); localStorage.setItem(STORAGE_KEY, 'true') } }}
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded-md no-underline text-sm whitespace-nowrap ${
                  collapsed ? 'p-2 justify-center' : 'px-3 py-2 justify-start'
                } ${isActive ? 'text-slate-50 bg-slate-800' : 'text-gray-400 bg-transparent'}`
              }
            >
              <span className="text-base shrink-0">{item.icon}</span>
              {!collapsed && <span>{item.label}</span>}
            </NavLink>
          ))}
        </nav>
      </aside>
    </>
  )
}
