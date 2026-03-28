import { Link, useLocation } from 'react-router-dom'
import { useAgentStore } from '../store/agentStore'

const TAB_SECTION_LABELS: Record<string, string> = {
  'war-room': 'War Room',
  'board': 'Board',
  'agents': 'Agents',
}

function getSection(pathname: string, activeSection?: string): string | null {
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
  if (/^\/companies\/[^/]+/.test(pathname)) {
    // Use activeSection prop if provided to sync with tab state
    if (activeSection && TAB_SECTION_LABELS[activeSection]) {
      return TAB_SECTION_LABELS[activeSection]
    }
    return 'War Room'
  }
  return null
}

function requiresCompany(pathname: string): boolean {
  // Root `/` is the companies list — no company context needed in breadcrumb
  if (pathname === '/' || pathname === '') return false
  return /^\/companies\/[^/]+/.test(pathname)
}

interface BreadcrumbProps {
  activeSection?: string
}

export default function Breadcrumb({ activeSection }: BreadcrumbProps = {}) {
  const location = useLocation()
  const currentCompany = useAgentStore((s) => s.currentCompany)
  const activeCompanyTab = useAgentStore((s) => s.activeCompanyTab)

  // SIRI-UX-042: On company overview pages, CompanyHeader inside CompanyPage
  // already provides the navigation context — don't render a second breadcrumb.
  if (/^\/companies\/[^/]+$/.test(location.pathname)) return null

  // activeSection prop takes priority, then store value
  const resolvedSection = activeSection ?? activeCompanyTab ?? undefined
  const section = getSection(location.pathname, resolvedSection)
  const hasCompany = currentCompany !== null
  // SIRI-UX-011: Root `/` is companies list — no company context needed in breadcrumb
  const showCompanyBlock = requiresCompany(location.pathname)

  return (
    <nav aria-label="Breadcrumb">
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
            <span aria-hidden="true" style={{ color: '#4b5563' }}>&gt;</span>
            {hasCompany ? (
              <span style={{ color: '#e2e8f0' }}>{currentCompany.name}</span>
            ) : (
              <span>Select company</span>
            )}
          </>
        )}

        {section && (
          <>
            <span aria-hidden="true" style={{ color: '#4b5563' }}>&gt;</span>
            <span style={{ color: '#e2e8f0' }}>{section}</span>
          </>
        )}
      </div>
    </nav>
  )
}
