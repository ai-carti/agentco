import { useState, useEffect, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { getStoredToken, BASE_URL } from '../api/client'
import { Bot } from 'lucide-react'
import SkeletonCard from './SkeletonCard'
import { useToast } from '../context/ToastContext'
// SIRI-POST-006: focus trap
import { useFocusTrap } from '../hooks/useFocusTrap'


interface LibraryAgent {
  id: string
  name: string
  role: string
  avatar?: string
}

interface Company {
  id: string
  name: string
}

interface ForkModalProps {
  agentId: string
  onClose: () => void
  onForked: () => void
}

function ForkModal({ agentId, onClose, onForked }: ForkModalProps) {
  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)
  const [forking, setForking] = useState<string | null>(null)
  const [error, setError] = useState('')
  const toast = useToast()
  // SIRI-POST-006: focus trap
  const trapRef = useFocusTrap(true)
  // SIRI-UX-193: AbortController ref to guard setState in handleFork on unmounted modal
  const forkAbortRef = useRef<AbortController | null>(null)
  useEffect(() => {
    return () => { forkAbortRef.current?.abort() }
  }, [])

  // SIRI-UX-065: close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  useEffect(() => {
    const controller = new AbortController()
    const token = getStoredToken()
    fetch(`${BASE_URL}/api/companies`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        setCompanies(Array.isArray(data) ? data : [])
        setLoading(false)
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return
        setLoading(false)
      })
    return () => controller.abort()
  }, [])

  // SIRI-UX-383: useCallback prevents new function reference on every ForkModal render.
  // handleFork is passed as onClick to N company buttons — without memoization it causes
  // unnecessary closures on every render cycle.
  const handleFork = useCallback(async (companyId: string) => {
    // SIRI-UX-193: AbortController to guard setState on unmounted ForkModal
    forkAbortRef.current?.abort()
    const controller = new AbortController()
    forkAbortRef.current = controller
    const { signal } = controller
    setForking(companyId)
    setError('')
    try {
      const token = getStoredToken()
      const res = await fetch(`${BASE_URL}/api/companies/${companyId}/agents/fork`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ library_agent_id: agentId }),
        signal,
      })
      if (!signal.aborted) {
        if (!res.ok) {
          setError(`Failed to fork (${res.status})`)
          toast.error(`Failed to fork agent (${res.status})`)
          setForking(null)
        } else {
          const companyName = companies.find((c) => c.id === companyId)?.name ?? 'company'
          toast.success(`Agent forked to ${companyName}`)
          onForked()
          onClose()
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return
      if (!signal.aborted) {
        setError('Network error')
        toast.error('Network error — could not fork agent')
        setForking(null)
      }
    } finally {
      if (!signal.aborted) {
        forkAbortRef.current = null
      }
    }
  // SIRI-UX-383: deps — agentId, onForked, onClose from props; toast stable
  }, [agentId, onClose, onForked, toast]) // SIRI-UX-383

  return (
    <div
      data-testid="fork-modal"
      role="dialog"
      aria-modal="true"
      aria-label="Fork to Company"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
      }}
    >
      <div
        ref={trapRef}
        style={{
          background: '#1e293b',
          border: '1px solid #334155',
          borderRadius: 12,
          padding: '1.5rem',
          width: 340,
          maxWidth: '90vw',
        }}
      >
        <h2 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 700, color: '#f1f5f9' }}>
          Fork to Company
        </h2>

        {/* SIRI-UX-315: role="alert" so screen reader announces fork errors automatically */}
        {error && (
          <p role="alert" style={{ color: '#f87171', fontSize: '0.85rem', marginBottom: '0.75rem' }}>{error}</p>
        )}

        {loading ? (
          <p style={{ color: '#94a3b8', fontSize: '0.875rem' }}>Loading companies…</p>
        ) : companies.length === 0 ? (
          <p style={{ color: '#94a3b8', fontSize: '0.875rem' }}>No companies available</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {companies.map((company) => (
              <button
                key={company.id}
                data-testid={`fork-company-${company.id}`}
                onClick={() => handleFork(company.id)}
                disabled={forking !== null}
                style={{
                  padding: '0.625rem 1rem',
                  background: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: 8,
                  color: '#f1f5f9',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  cursor: forking ? 'not-allowed' : 'pointer',
                  textAlign: 'left',
                  opacity: forking && forking !== company.id ? 0.5 : 1,
                }}
              >
                {forking === company.id ? 'Forking…' : company.name}
              </button>
            ))}
          </div>
        )}

        <button
          onClick={onClose}
          style={{
            marginTop: '1rem',
            width: '100%',
            padding: '0.5rem',
            background: 'transparent',
            border: '1px solid #334155',
            borderRadius: 8,
            color: '#94a3b8',
            fontSize: '0.875rem',
            cursor: 'pointer',
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

export default function LibraryPage() {
  const [agents, setAgents] = useState<LibraryAgent[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [forkTarget, setForkTarget] = useState<string | null>(null)

  // SIRI-UX-386: useCallback so Retry button click uses stable reference
  const loadAgents = useCallback((signal?: AbortSignal) => {
    setLoadError(false)
    const token = getStoredToken()
    // SIRI-UX-069: use limit param now that backend supports pagination (ALEX-TD-040)
    fetch(`${BASE_URL}/api/library?limit=50`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      ...(signal ? { signal } : {}),
    })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((data) => {
        setAgents(Array.isArray(data) ? data : [])
        setLoading(false)
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return
        // SIRI-UX-152: surface network/API errors — don't show silent empty state
        setLoadError(true)
        setLoading(false)
      })
  // SIRI-UX-386: no deps — only reads stable setState functions
  }, []) // SIRI-UX-386

  useEffect(() => {
    const controller = new AbortController()
    loadAgents(controller.signal)
    return () => controller.abort()
  }, [loadAgents])

  return (
    <div
      data-testid="library-page"
      style={{ padding: '1.5rem', maxWidth: 720 }}
    >
      <h1 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 1.25rem', color: '#f1f5f9' }}>
        Agent Library
      </h1>

      {/* SIRI-UX-152: error state — shown when fetch fails */}
      {loadError && (
        <div
          role="alert"
          style={{
            marginBottom: '1rem',
            padding: '0.875rem 1rem',
            background: 'rgba(127, 29, 29, 0.85)',
            border: '1px solid #b91c1c',
            borderRadius: '0.5rem',
            color: '#fee2e2',
            fontSize: '0.875rem',
          }}
        >
          Failed to load agent library. Please try again.
        </div>
      )}

      {loading ? (
        <SkeletonCard variant="task" count={3} />
      ) : agents.length === 0 && !loadError ? (
        <div
          data-testid="library-empty"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: '3rem 1.5rem',
            gap: '0.75rem',
            color: '#94a3b8',
            textAlign: 'center',
          }}
        >
          <span style={{ fontSize: '3rem' }}>📚</span>
          <p style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: '#f1f5f9' }}>
            No agents in library yet
          </p>
          <p style={{ margin: 0, fontSize: '0.875rem' }}>
            Save an agent from its page
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {agents.map((agent) => (
            <div
              key={agent.id}
              data-testid={`library-agent-${agent.id}`}
              style={{
                background: '#1e293b',
                border: '1px solid #334155',
                borderRadius: 10,
                padding: '1rem 1.25rem',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
              }}
            >
              {agent.avatar
                ? <span style={{ fontSize: '1.5rem' }}>{agent.avatar}</span>
                : <Bot className="w-6 h-6 text-gray-400" />
              }
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#f1f5f9' }}>
                  {agent.name}
                </div>
                <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: 2 }}>
                  {agent.role}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                {/* SIRI-UX-258: replaced JS hover with CSS class .library-portfolio-link */}
                <Link
                  to={`/library/${agent.id}/portfolio`}
                  data-testid={`portfolio-link-${agent.id}`}
                  // SIRI-UX-220: agent-specific aria-label so screen readers can distinguish between multiple Portfolio links
                  aria-label={`View ${agent.name} portfolio`}
                  className="library-portfolio-link"
                >
                  Portfolio
                </Link>
                {/* SIRI-UX-258: replaced JS hover with CSS class .library-fork-btn */}
                <button
                  data-testid={`fork-btn-${agent.id}`}
                  // SIRI-UX-220: agent-specific aria-label so screen readers can distinguish between multiple Fork buttons
                  aria-label={`Fork ${agent.name} to a company`}
                  onClick={() => setForkTarget(agent.id)}
                  className="library-fork-btn"
                >
                  Fork
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {forkTarget && (
        <ForkModal
          agentId={forkTarget}
          onClose={() => setForkTarget(null)}
          onForked={() => {
            setForkTarget(null)
            // optionally show toast
          }}
        />
      )}
    </div>
  )
}
