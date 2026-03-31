import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import AgentForm, { type AgentFormData } from './AgentForm'
import { getStoredToken, BASE_URL } from '../api/client'
import { useToast } from '../context/ToastContext'
import SkeletonCard from './SkeletonCard'
import { useDocumentTitle } from '../hooks/useDocumentTitle'


interface AgentData {
  id: string
  name: string
  role?: string
  model?: string
  system_prompt?: string
}

export default function AgentEditPage() {
  useDocumentTitle('Edit Agent — AgentCo')
  const { id: companyId, agentId } = useParams<{ id: string; agentId: string }>()
  const navigate = useNavigate()
  const toast = useToast()

  const [agent, setAgent] = useState<AgentData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  // SIRI-UX-191: AbortController ref to guard setState in handleSubmit on unmounted component
  const saveAbortRef = useRef<AbortController | null>(null)
  useEffect(() => {
    return () => { saveAbortRef.current?.abort() }
  }, [])

  useEffect(() => {
    if (!companyId || !agentId) return
    const controller = new AbortController()
    const token = getStoredToken()
    fetch(`${BASE_URL}/api/companies/${companyId}/agents/${agentId}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        // SIRI-UX-279: guard setState — response may arrive after component unmounts
        if (controller.signal.aborted) return
        if (data) setAgent(data)
        setLoading(false)
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [companyId, agentId])

  const handleSubmit = async (data: AgentFormData) => {
    // SIRI-UX-191: abort any previous in-flight save; guard setState on unmounted component
    saveAbortRef.current?.abort()
    const controller = new AbortController()
    saveAbortRef.current = controller
    const { signal } = controller
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
          signal,
        },
      )
      if (!signal.aborted) {
        if (!res.ok) {
          const msg = `Failed to save agent (${res.status})`
          setSaveError(msg)
          toast.error(msg)
        } else {
          toast.success('Agent updated')
          navigate(`/companies/${companyId}/agents/${agentId}`)
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return
      if (!signal.aborted) {
        const msg = 'Network error — could not save agent'
        setSaveError(msg)
        toast.error(msg)
      }
    } finally {
      if (!signal.aborted) {
        setSaving(false)
        saveAbortRef.current = null
      }
    }
  }

  const handleCancel = () => {
    navigate(`/companies/${companyId}/agents/${agentId}`)
  }

  if (loading) {
    return (
      <div data-testid="agent-edit-loading" className="p-6 max-w-[600px]">
        <SkeletonCard variant="task" count={4} />
      </div>
    )
  }

  // SIRI-UX-073: if agent failed to load, show error instead of empty form
  if (!agent) {
    return (
      <div
        data-testid="agent-edit-not-found"
        className="py-12 px-6 text-center text-gray-400"
      >
        <div className="text-4xl mb-4">🤖</div>
        <div className="text-lg font-bold text-slate-100 mb-2">
          Agent not found
        </div>
        <div className="text-sm text-gray-500 mb-6">
          This agent may have been deleted or you don't have access.
        </div>
        <button
          data-testid="agent-edit-not-found-back-btn"
          onClick={() => navigate(`/companies/${companyId}`)}
          className="px-5 py-2 bg-transparent border border-gray-700 rounded-md text-gray-400 text-sm cursor-pointer"
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
    <div data-testid="agent-edit-page" className="p-6 max-w-[600px]">
      {/* Breadcrumb suffix is handled globally via Breadcrumb.tsx */}
      <h1 className="text-xl font-bold m-0 mb-6">
        Edit Agent
      </h1>

      {/* SIRI-UX-463: pass saving state so AgentForm submit button shows aria-busy */}
      <AgentForm
        onSubmit={handleSubmit}
        initialValues={initialValues}
        saving={saving}
      />

      {saving && (
        // SIRI-UX-461: role="status" so screen readers announce saving state via aria-live polite
        <p
          data-testid="agent-edit-saving"
          role="status"
          aria-live="polite"
          className="text-blue-400 text-sm mt-3"
        >
          Saving…
        </p>
      )}

      {saveError && (
        // SIRI-UX-300: role="alert" so screen readers announce the save error automatically
        <p
          role="alert"
          data-testid="agent-edit-error"
          className="text-red-400 text-sm mt-3"
        >
          {saveError}
        </p>
      )}

      <div className="mt-4">
        {/* SIRI-UX-261: replaced JS hover with CSS class .agent-edit-cancel-btn */}
        <button
          data-testid="agent-edit-cancel"
          onClick={handleCancel}
          type="button"
          className="agent-edit-cancel-btn"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
