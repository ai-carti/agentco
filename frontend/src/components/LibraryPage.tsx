import { useState, useEffect, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { getStoredToken, BASE_URL } from '../api/client'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
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
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-[100]"
    >
      <div
        ref={trapRef}
        className="bg-slate-800 border border-slate-700 rounded-xl p-6 w-[340px] max-w-[90vw]"
      >
        <h2 className="m-0 mb-4 text-base font-bold text-gray-100">
          Fork to Company
        </h2>

        {/* SIRI-UX-315: role="alert" so screen reader announces fork errors automatically */}
        {error && (
          <p role="alert" className="text-red-400 text-[0.85rem] mb-3">{error}</p>
        )}

        {loading ? (
          <p className="text-slate-400 text-sm">Loading companies…</p>
        ) : companies.length === 0 ? (
          <p className="text-slate-400 text-sm">No companies available</p>
        ) : (
          <div className="flex flex-col gap-2">
            {companies.map((company) => (
              <button
                key={company.id}
                data-testid={`fork-company-${company.id}`}
                onClick={() => handleFork(company.id)}
                disabled={forking !== null}
                className={`py-2.5 px-4 bg-slate-900 border border-slate-700 rounded-lg text-gray-100 text-sm font-medium text-left ${forking ? 'cursor-not-allowed' : 'cursor-pointer'} ${forking && forking !== company.id ? 'opacity-50' : 'opacity-100'}`}
              >
                {forking === company.id ? 'Forking…' : company.name}
              </button>
            ))}
          </div>
        )}

        <button
          onClick={onClose}
          className="mt-4 w-full py-2 bg-transparent border border-slate-700 rounded-lg text-slate-400 text-sm cursor-pointer"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

export default function LibraryPage() {
  useDocumentTitle('Agent Library — AgentCo')
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
      className="p-6 max-w-[720px]"
    >
      <h1 className="text-xl font-bold m-0 mb-5 text-gray-100">
        Agent Library
      </h1>

      {/* SIRI-UX-152: error state — shown when fetch fails */}
      {loadError && (
        <div
          role="alert"
          className="mb-4 py-3.5 px-4 bg-red-900/85 border border-red-700 rounded-lg text-red-100 text-sm"
        >
          Failed to load agent library. Please try again.
        </div>
      )}

      {loading ? (
        <SkeletonCard variant="task" count={3} />
      ) : agents.length === 0 && !loadError ? (
        <div
          data-testid="library-empty"
          className="flex flex-col items-center py-12 px-6 gap-3 text-slate-400 text-center"
        >
          <span className="text-5xl">📚</span>
          <p className="m-0 text-base font-semibold text-gray-100">
            No agents in library yet
          </p>
          <p className="m-0 text-sm">
            Save an agent from its page
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {agents.map((agent) => (
            <div
              key={agent.id}
              data-testid={`library-agent-${agent.id}`}
              className="bg-slate-800 border border-slate-700 rounded-[10px] py-4 px-5 flex items-center gap-3"
            >
              {agent.avatar
                ? <span className="text-2xl">{agent.avatar}</span>
                : <Bot className="w-6 h-6 text-gray-400" />
              }
              <div className="flex-1 min-w-0">
                <div className="font-bold text-[0.95rem] text-gray-100">
                  {agent.name}
                </div>
                <div className="text-[0.8rem] text-slate-500 mt-0.5">
                  {agent.role}
                </div>
              </div>
              <div className="flex gap-2 items-center shrink-0">
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
