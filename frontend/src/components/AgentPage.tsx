import { useState } from 'react'
import { useParams } from 'react-router-dom'
import AgentForm, { type AgentFormData } from './AgentForm'
import { getStoredToken } from '../api/client'

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

export default function AgentPage() {
  const { id: companyId, agentId } = useParams<{ id: string; agentId: string }>()
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState('')

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
        setSaveError(`Failed to save agent (${res.status})`)
        return
      }
      setSaved(true)
    } catch {
      setSaveError('Network error — could not save agent')
    }
  }

  return (
    <div data-testid="agent-page" style={{ padding: '1.5rem', maxWidth: 480 }}>
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
    </div>
  )
}
