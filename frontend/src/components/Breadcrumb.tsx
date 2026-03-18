import { Link, useLocation } from 'react-router-dom'
import { useAgentStore } from '../store/agentStore'

function getSection(pathname: string): string | null {
  if (pathname === '/' || pathname === '') return null
  if (pathname === '/settings/billing') return 'Billing'
  if (pathname.startsWith('/settings')) return 'Settings'
  if (pathname.startsWith('/library')) return 'Library'
  if (pathname.startsWith('/war-room')) return 'War Room'
  if (pathname.startsWith('/onboarding')) return 'Onboarding'
  if (/^\/companies\/[^/]+\/agents\/[^/]+\/edit/.test(pathname)) return 'Edit Agent'
  if (/^\/companies\/[^/]+\/agents\//.test(pathname)) return 'Agent'
  if (/^\/companies\/[^/]+\/settings/.test(pathname)) return 'Settings'
  if (/^\/companies\/[^/]+\/warroom/.test(pathname)) return 'War Room'
  if (/^\/companies\/[^/]+/.test(pathname)) return 'War Room'  // Default section for company pages
  return null
}

function requiresCompany(pathname: string): boolean {
  return /^\/companies\/[^/]+/.test(pathname)
}

export default function Breadcrumb() {
  const location = useLocation()
  const currentCompany = useAgentStore((s) => s.currentCompany)
  const section = getSection(location.pathname)
  const hasCompany = currentCompany !== null
  const showCompanyBlock = requiresCompany(location.pathname) || location.pathname === '/'

  return (
    <div
      data-testid="breadcrumb"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        padding: '0.5rem 1.5rem',
        fontSize: '0.85rem',
        color: '#9ca3af',
        borderBottom: '1px solid #1e293b',
      }}
    >
      <Link to="/" style={{ color: '#60a5fa', textDecoration: 'none' }}>
        AgentCo
      </Link>

      {showCompanyBlock && (
        <>
          <span style={{ color: '#4b5563' }}>&gt;</span>
          {hasCompany ? (
            <span style={{ color: '#e2e8f0' }}>{currentCompany.name}</span>
          ) : (
            <span>Select company</span>
          )}
        </>
      )}

      {section && (
        <>
          <span style={{ color: '#4b5563' }}>&gt;</span>
          <span style={{ color: '#e2e8f0' }}>{section}</span>
        </>
      )}
    </div>
  )
}
