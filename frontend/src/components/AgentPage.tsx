import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import AgentForm, { type AgentFormData } from './AgentForm'
import { getStoredToken } from '../api/client'
import { useToast } from '../context/ToastContext'
import EmptyState from './EmptyState'

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

interface TaskHistoryItem {
  id: string
  title: string
  status: string
  created_at?: string
}

export default function AgentPage() {
  const { id: companyId, agentId } = useParams<{ id: string; agentId: string }>()
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState('')
  const toast = useToast()
  const [history, setHistory] = useState<TaskHistoryItem[]>([])
  const [historyLoaded, setHistoryLoaded] = useState(false)

  useEffect(() => {
    if (!companyId || !agentId) return
    const token = getStoredToken()
    fetch(`${BASE_URL}/api/v1/companies/${companyId}/agents/${agentId}/tasks?status=done`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        setHistory(Array.isArray(data) ? data : [])
        setHistoryLoaded(true)
      })
      .catch(() => setHistoryLoaded(true))
  }, [companyId, agentId])

  const handleSubmit = async (data: AgentFormData) => {
    setSaveError('')
    setSaved(false)
    try {
      const token = getStoredToken()
      const res = await fetch(
        `${BASE_URL}/api/v1/companies/${companyId}/agents/${agentId}`,
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
          ✓ Agent saved
        </p>
      )}
      {saveError && (
        <p
          data-testid="agent-save-error"
          style={{ color: '#f87171', fontSize: '0.875rem', marginTop: '0.75rem' }}
        >
          ⚠ {saveError}
        </p>
      )}

      {/* History section */}
      <div style={{ marginTop: '2rem' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem' }}>History</h2>

        {!historyLoaded ? (
          <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>Loading…</p>
        ) : history.length === 0 ? (
          <EmptyState
            emoji="📜"
            title="No history yet"
            subtitle="This agent hasn't completed any tasks"
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {history.map((item) => (
              <div
                key={item.id}
                style={{
                  padding: '0.625rem 0.875rem',
                  background: '#1f2937',
                  border: '1px solid #374151',
                  borderRadius: 6,
                  fontSize: '0.875rem',
                }}
              >
                <span style={{ fontWeight: 500 }}>{item.title}</span>
                {item.created_at && (
                  <span style={{ color: '#6b7280', marginLeft: '0.5rem', fontSize: '0.75rem' }}>
                    {new Date(item.created_at).toLocaleDateString()}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
