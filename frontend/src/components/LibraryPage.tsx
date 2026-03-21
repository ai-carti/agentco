import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { getStoredToken } from '../api/client'
import { Bot } from 'lucide-react'
import SkeletonCard from './SkeletonCard'
import { useToast } from '../context/ToastContext'
// SIRI-POST-006: focus trap
import { useFocusTrap } from '../hooks/useFocusTrap'

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

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

  // SIRI-UX-065: close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  useEffect(() => {
    const token = getStoredToken()
    fetch(`${BASE_URL}/api/companies`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        setCompanies(Array.isArray(data) ? data : [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const handleFork = async (companyId: string) => {
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
      })
      if (!res.ok) {
        setError(`Failed to fork (${res.status})`)
        toast.error(`Failed to fork agent (${res.status})`)
        setForking(null)
        return
      }
      const companyName = companies.find((c) => c.id === companyId)?.name ?? 'company'
      toast.success(`Agent forked to ${companyName}`)
      onForked()
      onClose()
    } catch {
      setError('Network error')
      toast.error('Network error — could not fork agent')
      setForking(null)
    }
  }

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

        {error && (
          <p style={{ color: '#f87171', fontSize: '0.85rem', marginBottom: '0.75rem' }}>{error}</p>
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
  const [forkTarget, setForkTarget] = useState<string | null>(null)

  const loadAgents = () => {
    const token = getStoredToken()
    // SIRI-UX-069: use limit param now that backend supports pagination (ALEX-TD-040)
    fetch(`${BASE_URL}/api/library?limit=50`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        setAgents(Array.isArray(data) ? data : [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }

  useEffect(() => {
    loadAgents()
  }, [])

  return (
    <div
      data-testid="library-page"
      style={{ padding: '1.5rem', maxWidth: 720 }}
    >
      <h1 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 1.25rem', color: '#f1f5f9' }}>
        Agent Library
      </h1>

      {loading ? (
        <SkeletonCard variant="task" count={3} />
      ) : agents.length === 0 ? (
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
                <Link
                  to={`/library/${agent.id}/portfolio`}
                  data-testid={`portfolio-link-${agent.id}`}
                  style={{
                    padding: '0.4rem 0.875rem',
                    background: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: 6,
                    color: '#94a3b8',
                    fontSize: '0.8rem',
                    fontWeight: 500,
                    textDecoration: 'none',
                    cursor: 'pointer',
                    transition: 'border-color 0.15s, color 0.15s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#6b7280'; e.currentTarget.style.color = '#e2e8f0' }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#334155'; e.currentTarget.style.color = '#94a3b8' }}
                >
                  Portfolio
                </Link>
                <button
                  data-testid={`fork-btn-${agent.id}`}
                  onClick={() => setForkTarget(agent.id)}
                  style={{
                    padding: '0.4rem 0.875rem',
                    background: '#2563eb',
                    border: 'none',
                    borderRadius: 6,
                    color: '#fff',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#1d4ed8' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = '#2563eb' }}
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
