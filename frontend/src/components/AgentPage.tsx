import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import AgentForm, { type AgentFormData } from './AgentForm'
import Button from './Button'
import { getStoredToken } from '../api/client'
import { useToast } from '../context/ToastContext'
import EmptyState from './EmptyState'
import SkeletonCard from './SkeletonCard'
import { Brain, ScrollText } from 'lucide-react'

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

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

export default function AgentPage() {
  const { id: companyId, agentId } = useParams<{ id: string; agentId: string }>()
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [savedToLibrary, setSavedToLibrary] = useState(false)
  const [saveToLibraryError, setSaveToLibraryError] = useState('')
  const toast = useToast()
  const [history, setHistory] = useState<TaskHistoryItem[]>([])
  const [historyLoaded, setHistoryLoaded] = useState(false)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [memories, setMemories] = useState<MemoryEntry[]>([])
  const [memoriesLoaded, setMemoriesLoaded] = useState(false)

  useEffect(() => {
    if (!companyId || !agentId) return
    const token = getStoredToken()
    fetch(`${BASE_URL}/api/companies/${companyId}/agents/${agentId}/tasks?status=done`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        setHistory(Array.isArray(data) ? data : [])
        setHistoryLoaded(true)
      })
      .catch(() => setHistoryLoaded(true))

    fetch(`${BASE_URL}/api/companies/${companyId}/agents/${agentId}/memory`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        setMemories(Array.isArray(data) ? data : [])
        setMemoriesLoaded(true)
      })
      .catch(() => setMemoriesLoaded(true))
  }, [companyId, agentId])

  const handleSaveToLibrary = async () => {
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
      })
      if (!res.ok) {
        const msg = `Failed to save to library (${res.status})`
        setSaveToLibraryError(msg)
        toast.error(msg)
        return
      }
      setSavedToLibrary(true)
      toast.success('Agent saved to library')
    } catch {
      const msg = 'Network error — could not save to library'
      setSaveToLibraryError(msg)
      toast.error(msg)
    }
  }

  const handleSubmit = async (data: AgentFormData) => {
    setSaveError('')
    setSaved(false)
    try {
      const token = getStoredToken()
      const res = await fetch(
        `${BASE_URL}/api/companies/${companyId}/agents/${agentId}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify(data),
        },
      )
      if (!res.ok) {
        const msg = `Failed to save agent (${res.status})`
        setSaveError(msg)
        toast.error(msg)
        return
      }
      setSaved(true)
      toast.success(`Agent saved`)
    } catch {
      const msg = 'Network error — could not save agent'
      setSaveError(msg)
      toast.error(msg)
    }
  }

  const visibleHistory = history.slice(0, visibleCount)
  const hasMore = history.length > visibleCount

  return (
    <div data-testid="agent-page" style={{ padding: '1.5rem', maxWidth: 540 }}>
      <h1 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, marginBottom: '1.25rem' }}>
        Edit Agent
      </h1>

      <AgentForm onSubmit={handleSubmit} />

      {saved && (
        <p
          data-testid="agent-save-success"
          style={{ color: '#4ade80', fontSize: '0.875rem', marginTop: '0.75rem' }}
        >
          Agent saved
        </p>
      )}
      {saveError && (
        <p
          data-testid="agent-save-error"
          style={{ color: '#f87171', fontSize: '0.875rem', marginTop: '0.75rem' }}
        >
          {saveError}
        </p>
      )}

      <div style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: 12 }}>
        <Button
          data-testid="save-to-library-btn"
          variant="secondary"
          onClick={handleSaveToLibrary}
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

      {/* Memory section */}
      <div data-testid="agent-memory-section" style={{ marginTop: '2rem' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem' }}>Memory</h2>

        {!memoriesLoaded ? (
          <SkeletonCard variant="task" count={2} />
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
                      {new Date(entry.created_at).toLocaleDateString()}
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
        ) : history.length === 0 ? (
          <EmptyState
            icon={<ScrollText className="w-12 h-12 text-gray-400" />}
            title="No completed tasks yet"
            subtitle="This agent hasn't completed any tasks"
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {visibleHistory.map((item) => (
              <div
                key={item.id}
                onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
                style={{
                  padding: '0.625rem 0.875rem',
                  background: '#1f2937',
                  border: '1px solid #374151',
                  borderRadius: 6,
                  fontSize: '0.875rem',
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 500 }}>{item.title}</span>
                  {item.created_at && (
                    <span style={{ color: '#6b7280', fontSize: '0.75rem' }}>
                      {new Date(item.created_at).toLocaleDateString()}
                    </span>
                  )}
                </div>
                {expandedId === item.id && item.description && (
                  <div style={{ marginTop: '0.5rem', color: '#9ca3af', fontSize: '0.8rem' }}>
                    {item.description}
                  </div>
                )}
              </div>
            ))}
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
    </div>
  )
}
