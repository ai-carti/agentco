import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import AgentForm, { type AgentFormData } from './AgentForm'
import { getStoredToken } from '../api/client'
import { useToast } from '../context/ToastContext'
import SkeletonCard from './SkeletonCard'

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

interface AgentData {
  id: string
  name: string
  role?: string
  model?: string
  system_prompt?: string
}

export default function AgentEditPage() {
  const { id: companyId, agentId } = useParams<{ id: string; agentId: string }>()
  const navigate = useNavigate()
  const toast = useToast()

  const [agent, setAgent] = useState<AgentData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  useEffect(() => {
    if (!companyId || !agentId) return
    const token = getStoredToken()
    fetch(`${BASE_URL}/api/companies/${companyId}/agents/${agentId}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setAgent(data)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [companyId, agentId])

  const handleSubmit = async (data: AgentFormData) => {
    setSaveError('')
    setSaving(true)
    try {
      const token = getStoredToken()
      const res = await fetch(
        `${BASE_URL}/api/companies/${companyId}/agents/${agentId}`,
        {
          method: 'PATCH',
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
        setSaving(false)
        return
      }
      toast.success('Agent updated')
      navigate(`/companies/${companyId}/agents/${agentId}`)
    } catch {
      const msg = 'Network error — could not save agent'
      setSaveError(msg)
      toast.error(msg)
      setSaving(false)
    }
  }

  const handleCancel = () => {
    navigate(`/companies/${companyId}/agents/${agentId}`)
  }

  if (loading) {
    return (
      <div data-testid="agent-edit-loading" style={{ padding: '1.5rem', maxWidth: 600 }}>
        <SkeletonCard variant="task" count={4} />
      </div>
    )
  }

  // SIRI-UX-073: if agent failed to load, show error instead of empty form
  if (!agent) {
    return (
      <div
        data-testid="agent-edit-not-found"
        style={{ padding: '3rem 1.5rem', textAlign: 'center', color: '#9ca3af' }}
      >
        <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>🤖</div>
        <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#f1f5f9', marginBottom: '0.5rem' }}>
          Agent not found
        </div>
        <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '1.5rem' }}>
          This agent may have been deleted or you don't have access.
        </div>
        <button
          data-testid="agent-edit-not-found-back-btn"
          onClick={() => navigate(`/companies/${companyId}`)}
          style={{
            padding: '0.5rem 1.25rem', background: 'transparent',
            border: '1px solid #374151', borderRadius: 6, color: '#9ca3af',
            fontSize: '0.875rem', cursor: 'pointer',
          }}
        >
          ← Back to Company
        </button>
      </div>
    )
  }

  const initialValues: Partial<AgentFormData> = {
    name: agent?.name ?? '',
    role: agent?.role ?? '',
    model: agent?.model ?? '',
    system_prompt: agent?.system_prompt ?? '',
  }

  return (
    <div data-testid="agent-edit-page" style={{ padding: '1.5rem', maxWidth: 600 }}>
      {/* Breadcrumb suffix is handled globally via Breadcrumb.tsx */}
      <h1 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, marginBottom: '1.5rem' }}>
        Edit Agent
      </h1>

      <AgentForm
        onSubmit={handleSubmit}
        initialValues={initialValues}
      />

      {saving && (
        <p
          data-testid="agent-edit-saving"
          style={{ color: '#60a5fa', fontSize: '0.875rem', marginTop: '0.75rem' }}
        >
          Saving…
        </p>
      )}

      {saveError && (
        <p
          data-testid="agent-edit-error"
          style={{ color: '#f87171', fontSize: '0.875rem', marginTop: '0.75rem' }}
        >
          {saveError}
        </p>
      )}

      <div style={{ marginTop: '1rem' }}>
        <button
          data-testid="agent-edit-cancel"
          onClick={handleCancel}
          type="button"
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#6b7280'; e.currentTarget.style.color = '#e5e7eb' }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#374151'; e.currentTarget.style.color = '#9ca3af' }}
          style={{
            padding: '0.5rem 1.25rem',
            background: 'transparent',
            border: '1px solid #374151',
            borderRadius: 6,
            color: '#9ca3af',
            fontSize: '0.875rem',
            cursor: 'pointer',
            transition: 'border-color 0.15s, color 0.15s',
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
