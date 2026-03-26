import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Button from './Button'
import { getStoredToken, BASE_URL } from '../api/client'
import { useToast } from '../context/ToastContext'
import EmptyState from './EmptyState'
import SkeletonCard from './SkeletonCard'
import { Brain, ScrollText } from 'lucide-react'
// SIRI-UX-302/303: formatDateLong from shared taskUtils (replaces local toLocaleDateString)
import { formatDateLong } from '../utils/taskUtils'


const PAGE_SIZE = 20

interface TaskHistoryItem {
  id: string
  title: string
  status: string
  description?: string
  created_at?: string
}

interface MemoryEntry {
  id: string
  content: string
  created_at: string
}

interface AgentData {
  id: string
  name: string
  role?: string
  model?: string
  system_prompt?: string
}

const fieldStyle: React.CSSProperties = {
  padding: '0.5rem 0.75rem',
  background: '#1f2937',
  border: '1px solid #374151',
  borderRadius: 6,
  color: '#f8fafc',
  fontSize: '0.875rem',
  wordBreak: 'break-word',
  whiteSpace: 'pre-wrap',
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.75rem',
  color: '#9ca3af',
  marginBottom: '0.3rem',
  fontWeight: 500,
}

export default function AgentPage() {
  const { id: companyId, agentId } = useParams<{ id: string; agentId: string }>()
  const navigate = useNavigate()
  const [agentData, setAgentData] = useState<AgentData | null>(null)
  const [agentLoading, setAgentLoading] = useState(true)
  const [agentLoadError, setAgentLoadError] = useState(false)
  const [savedToLibrary, setSavedToLibrary] = useState(false)
  const [saveToLibraryError, setSaveToLibraryError] = useState('')
  const toast = useToast()
  const [history, setHistory] = useState<TaskHistoryItem[]>([])
  const [historyLoaded, setHistoryLoaded] = useState(false)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [memories, setMemories] = useState<MemoryEntry[]>([])
  const [memoriesLoaded, setMemoriesLoaded] = useState(false)
  const [memoriesError, setMemoriesError] = useState(false)
  const [historyError, setHistoryError] = useState(false)
  // SIRI-UX-192: AbortController ref for handleSaveToLibrary
  const saveLibraryAbortRef = useRef<AbortController | null>(null)
  useEffect(() => {
    return () => { saveLibraryAbortRef.current?.abort() }
  }, [])

  useEffect(() => {
    if (!companyId || !agentId) return
    // SIRI-UX-157: single AbortController for all 3 fetches — prevents setState on unmounted component
    const controller = new AbortController()
    const { signal } = controller
    const token = getStoredToken()
    const authHeaders: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {}

    fetch(`${BASE_URL}/api/companies/${companyId}/agents/${agentId}`, {
      headers: authHeaders,
      signal,
    })
      .then((res) => {
        if (!res.ok) { setAgentLoadError(true); setAgentLoading(false); return null }
        return res.json()
      })
      .then((data) => {
        if (data) setAgentData(data)
        setAgentLoading(false)
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return
        setAgentLoadError(true)
        setAgentLoading(false)
      })

    fetch(`${BASE_URL}/api/companies/${companyId}/agents/${agentId}/tasks?status=done`, {
      headers: authHeaders,
      signal,
    })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((data) => {
        setHistory(Array.isArray(data) ? data : [])
        setHistoryLoaded(true)
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return
        // SIRI-UX-154: surface error instead of showing misleading empty state
        setHistoryError(true)
        setHistoryLoaded(true)
      })

    fetch(`${BASE_URL}/api/companies/${companyId}/agents/${agentId}/memory`, {
      headers: authHeaders,
      signal,
    })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((data) => {
        setMemories(Array.isArray(data) ? data : [])
        setMemoriesLoaded(true)
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return
        // SIRI-UX-154: surface error instead of showing misleading empty state
        setMemoriesError(true)
        setMemoriesLoaded(true)
      })

    return () => controller.abort()
  }, [companyId, agentId])

  // SIRI-UX-329: wrap in useCallback so the function is stable across renders
  // (prevents Save to Library button from remounting on each parent render)
  const handleSaveToLibrary = useCallback(async () => {
    // SIRI-UX-192: AbortController to guard setState on unmounted component
    saveLibraryAbortRef.current?.abort()
    const controller = new AbortController()
    saveLibraryAbortRef.current = controller
    const { signal } = controller
    setSavedToLibrary(false)
    setSaveToLibraryError('')
    try {
      const token = getStoredToken()
      const res = await fetch(`${BASE_URL}/api/library`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ agent_id: agentId }),
        signal,
      })
      if (!signal.aborted) {
        if (!res.ok) {
          const msg = `Failed to save to library (${res.status})`
          setSaveToLibraryError(msg)
          toast.error(msg)
        } else {
          setSavedToLibrary(true)
          toast.success('Agent saved to library')
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return
      if (!signal.aborted) {
        const msg = 'Network error — could not save to library'
        setSaveToLibraryError(msg)
        toast.error(msg)
      }
    } finally {
      if (!signal.aborted) {
        saveLibraryAbortRef.current = null
      }
    }
  // SIRI-UX-329: deps — agentId and toast are stable; savedToLibrary excluded (not read inside)
  }, [agentId, toast]) // SIRI-UX-329

  const visibleHistory = history.slice(0, visibleCount)
  const hasMore = history.length > visibleCount

  // SIRI-UX-059: show error state when agent fails to load
  if (agentLoadError) {
    return (
      <div
        data-testid="agent-not-found"
        style={{
          padding: '3rem 1.5rem',
          textAlign: 'center',
          color: '#9ca3af',
        }}
      >
        <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>🤖</div>
        <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#f1f5f9', marginBottom: '0.5rem' }}>
          Agent not found
        </div>
        <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '1.5rem' }}>
          This agent may have been deleted or you don't have access.
        </div>
        <Button
          data-testid="agent-not-found-back-btn"
          variant="secondary"
          onClick={() => navigate(`/companies/${companyId}`)}
        >
          ← Back to Company
        </Button>
      </div>
    )
  }

  return (
    <div data-testid="agent-page" style={{ padding: '1.5rem', maxWidth: 540 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>
          {agentData?.name ?? 'Agent'}
        </h1>
        <Button
          data-testid="agent-edit-btn"
          variant="secondary"
          onClick={() => navigate(`/companies/${companyId}/agents/${agentId}/edit`)}
        >
          Edit
        </Button>
      </div>

      {agentLoading ? (
        <SkeletonCard variant="agent" count={1} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={labelStyle}>Name</label>
            <div data-testid="agent-name-display" style={fieldStyle}>
              {agentData?.name ?? '—'}
            </div>
          </div>
          <div>
            <label style={labelStyle}>Role</label>
            <div data-testid="agent-role-display" style={fieldStyle}>
              {agentData?.role ?? '—'}
            </div>
          </div>
          <div>
            <label style={labelStyle}>Model</label>
            <div data-testid="agent-model-display" style={fieldStyle}>
              {agentData?.model ?? '—'}
            </div>
          </div>
          <div>
            <label style={labelStyle}>System Prompt</label>
            <div data-testid="agent-system-prompt-display" style={{ ...fieldStyle, minHeight: 80 }}>
              {agentData?.system_prompt ?? '—'}
            </div>
          </div>
        </div>
      )}

      {!agentLoading && (
        <div style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: 12 }}>
          <Button
            data-testid="save-to-library-btn"
            variant="secondary"
            onClick={handleSaveToLibrary}
            disabled={savedToLibrary}
          >
            Save to Library
          </Button>
          {savedToLibrary && (
            <span
              data-testid="save-to-library-success"
              style={{ color: '#4ade80', fontSize: '0.875rem' }}
            >
              Saved to library ✓
            </span>
          )}
          {saveToLibraryError && (
            <span
              data-testid="save-to-library-error"
              style={{ color: '#f87171', fontSize: '0.875rem' }}
            >
              {saveToLibraryError}
            </span>
          )}
        </div>
      )}

      {/* Memory + History sections — SIRI-UX-035: only show after agent data loaded */}
      {!agentLoading && (<>
      <div data-testid="agent-memory-section" style={{ marginTop: '2rem' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem' }}>Memory</h2>

        {!memoriesLoaded ? (
          <SkeletonCard variant="task" count={2} />
        ) : memoriesError ? (
          <p role="alert" data-testid="memory-load-error" style={{ color: '#f87171', fontSize: '0.875rem' }}>
            ⚠ Failed to load memories
          </p>
        ) : memories.length === 0 ? (
          <EmptyState
            icon={<Brain className="w-12 h-12 text-gray-400" />}
            title="No memories yet"
            subtitle="This agent hasn't stored any memories"
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {memories.map((entry) => (
              <div
                key={entry.id}
                data-testid="memory-entry"
                style={{
                  padding: '0.625rem 0.875rem',
                  background: '#1f2937',
                  border: '1px solid #374151',
                  borderRadius: 6,
                  fontSize: '0.875rem',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <span style={{ color: '#e5e7eb', flex: 1 }}>{entry.content}</span>
                  {entry.created_at && (
                    <span style={{ color: '#6b7280', fontSize: '0.75rem', flexShrink: 0 }}>
                      {/* SIRI-UX-303: use shared formatDateLong for consistent locale */}
                      {formatDateLong(entry.created_at)}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* History section */}
      <div style={{ marginTop: '2rem' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem' }}>History</h2>

        {!historyLoaded ? (
          <SkeletonCard variant="task" count={3} />
        ) : historyError ? (
          // SIRI-UX-301: role="alert" so screen readers announce the history load error
          <p role="alert" data-testid="history-load-error" style={{ color: '#f87171', fontSize: '0.875rem' }}>
            ⚠ Failed to load task history
          </p>
        ) : history.length === 0 ? (
          <EmptyState
            icon={<ScrollText className="w-12 h-12 text-gray-400" />}
            title="No completed tasks yet"
            subtitle="This agent hasn't completed any tasks"
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {visibleHistory.map((item) => {
              // SIRI-UX-159: stable id for aria-controls so screen readers can navigate to expanded content
              const expandedContentId = `history-desc-${item.id}`
              return (
                <div
                  key={item.id}
                  // SIRI-UX-162: only add button semantics when item has description to expand
                  {...(item.description
                    ? {
                        role: 'button' as const,
                        tabIndex: 0,
                        'aria-expanded': expandedId === item.id,
                        'aria-controls': expandedContentId,
                        onClick: () => setExpandedId(expandedId === item.id ? null : item.id),
                        onKeyDown: (e: React.KeyboardEvent) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            setExpandedId(expandedId === item.id ? null : item.id)
                          }
                        },
                      }
                    : {})}
                  style={{
                    padding: '0.625rem 0.875rem',
                    background: '#1f2937',
                    border: '1px solid #374151',
                    borderRadius: 6,
                    fontSize: '0.875rem',
                    // SIRI-UX-162: only show pointer when item is expandable
                    cursor: item.description ? 'pointer' : 'default',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 500 }}>{item.title}</span>
                    {item.created_at && (
                      <span style={{ color: '#6b7280', fontSize: '0.75rem' }}>
                        {/* SIRI-UX-303: use shared formatDateLong for consistent locale */}
                        {formatDateLong(item.created_at)}
                      </span>
                    )}
                  </div>
                  {expandedId === item.id && item.description && (
                    <div
                      id={expandedContentId}
                      style={{ marginTop: '0.5rem', color: '#9ca3af', fontSize: '0.8rem' }}
                    >
                      {item.description}
                    </div>
                  )}
                </div>
              )
            })}
            {hasMore && (
              <Button
                variant="secondary"
                onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                style={{ width: '100%', fontSize: '0.8rem' }}
              >
                Load more
              </Button>
            )}
          </div>
        )}
      </div>
      </>)} {/* end !agentLoading guard (SIRI-UX-035) */}
    </div>
  )
}
