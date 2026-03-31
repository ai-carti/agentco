import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Button from './Button'
import { getStoredToken, BASE_URL } from '../api/client'
import { useToast } from '../context/ToastContext'
import EmptyState from './EmptyState'
import SkeletonCard from './SkeletonCard'
import { Brain, ScrollText } from 'lucide-react'
// SIRI-UX-302/303: formatDateLong from shared taskUtils (replaces local toLocaleDateString)
import { formatDateLong } from '../utils/taskUtils'
import { useDocumentTitle } from '../hooks/useDocumentTitle'


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

export default function AgentPage() {
  const { id: companyId, agentId } = useParams<{ id: string; agentId: string }>()
  const navigate = useNavigate()
  const [agentData, setAgentData] = useState<AgentData | null>(null)
  // SIRI-UX-456: dynamic title — shows agent name for better tab/history UX
  useDocumentTitle(agentData ? `${agentData.name} — AgentCo` : 'Agent — AgentCo')
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

  // SIRI-UX-380: memoize visibleHistory so it's not re-computed on every render
  // when history and visibleCount haven't changed
  const visibleHistory = useMemo(() => history.slice(0, visibleCount), [history, visibleCount])
  const hasMore = history.length > visibleCount

  // SIRI-UX-059: show error state when agent fails to load
  if (agentLoadError) {
    return (
      <div
        data-testid="agent-not-found"
        className="py-12 px-6 text-center text-gray-400"
      >
        <div className="text-4xl mb-4">🤖</div>
        <div className="text-lg font-bold text-gray-100 mb-2">
          Agent not found
        </div>
        <div className="text-sm text-gray-500 mb-6">
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
    <div data-testid="agent-page" className="p-6 max-w-[540px]">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold m-0">
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
        <div className="flex flex-col gap-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1 font-medium">Name</label>
            <div data-testid="agent-name-display" className="py-2 px-3 bg-gray-800 border border-gray-700 rounded-md text-gray-50 text-sm break-words whitespace-pre-wrap">
              {agentData?.name ?? '—'}
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1 font-medium">Role</label>
            <div data-testid="agent-role-display" className="py-2 px-3 bg-gray-800 border border-gray-700 rounded-md text-gray-50 text-sm break-words whitespace-pre-wrap">
              {agentData?.role ?? '—'}
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1 font-medium">Model</label>
            <div data-testid="agent-model-display" className="py-2 px-3 bg-gray-800 border border-gray-700 rounded-md text-gray-50 text-sm break-words whitespace-pre-wrap">
              {agentData?.model ?? '—'}
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1 font-medium">System Prompt</label>
            <div data-testid="agent-system-prompt-display" className="py-2 px-3 bg-gray-800 border border-gray-700 rounded-md text-gray-50 text-sm break-words whitespace-pre-wrap min-h-[80px]">
              {agentData?.system_prompt ?? '—'}
            </div>
          </div>
        </div>
      )}

      {!agentLoading && (
        <div className="mt-4 flex items-center gap-3">
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
              className="text-green-400 text-sm"
            >
              Saved to library ✓
            </span>
          )}
          {saveToLibraryError && (
            <span
              data-testid="save-to-library-error"
              // SIRI-UX-457: role="alert" so screen readers auto-announce save errors
              role="alert"
              className="text-red-400 text-sm"
            >
              {saveToLibraryError}
            </span>
          )}
        </div>
      )}

      {/* Memory + History sections — SIRI-UX-035: only show after agent data loaded */}
      {!agentLoading && (<>
      <div data-testid="agent-memory-section" className="mt-8">
        <h2 className="text-base font-semibold mb-3">Memory</h2>

        {!memoriesLoaded ? (
          <SkeletonCard variant="task" count={2} />
        ) : memoriesError ? (
          <p role="alert" data-testid="memory-load-error" className="text-red-400 text-sm">
            ⚠ Failed to load memories
          </p>
        ) : memories.length === 0 ? (
          <EmptyState
            icon={<Brain className="w-12 h-12 text-gray-400" />}
            title="No memories yet"
            subtitle="This agent hasn't stored any memories"
          />
        ) : (
          <div className="flex flex-col gap-2">
            {memories.map((entry) => (
              <div
                key={entry.id}
                data-testid="memory-entry"
                className="py-2.5 px-3.5 bg-gray-800 border border-gray-700 rounded-md text-sm"
              >
                <div className="flex justify-between items-start gap-2">
                  <span className="text-gray-200 flex-1">{entry.content}</span>
                  {entry.created_at && (
                    <span className="text-gray-500 text-xs shrink-0">
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
      <div className="mt-8">
        <h2 className="text-base font-semibold mb-3">History</h2>

        {!historyLoaded ? (
          <SkeletonCard variant="task" count={3} />
        ) : historyError ? (
          // SIRI-UX-301: role="alert" so screen readers announce the history load error
          <p role="alert" data-testid="history-load-error" className="text-red-400 text-sm">
            ⚠ Failed to load task history
          </p>
        ) : history.length === 0 ? (
          <EmptyState
            icon={<ScrollText className="w-12 h-12 text-gray-400" />}
            title="No completed tasks yet"
            subtitle="This agent hasn't completed any tasks"
          />
        ) : (
          <div className="flex flex-col gap-2">
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
                  className={`py-2.5 px-3.5 bg-gray-800 border border-gray-700 rounded-md text-sm ${item.description ? 'cursor-pointer' : 'cursor-default'}`}
                >
                  <div className="flex justify-between items-center">
                    <span className="font-medium">{item.title}</span>
                    {item.created_at && (
                      <span className="text-gray-500 text-xs">
                        {/* SIRI-UX-303: use shared formatDateLong for consistent locale */}
                        {formatDateLong(item.created_at)}
                      </span>
                    )}
                  </div>
                  {expandedId === item.id && item.description && (
                    <div
                      id={expandedContentId}
                      className="mt-2 text-gray-400 text-[0.8rem]"
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
                className="w-full text-[0.8rem]"
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
