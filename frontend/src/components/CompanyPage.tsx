import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import WarRoomPage from './WarRoomPage'
import KanbanBoard from './KanbanBoard'
import AgentCard from './AgentCard'
import AgentForm, { type AgentFormData } from './AgentForm'
import EmptyState from './EmptyState'
import { useAgentStore, type Agent } from '../store/agentStore'
import { getStoredToken } from '../api/client'

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

export default function CompanyPage() {
  const { id } = useParams<{ id: string }>()
  const setCurrentCompany = useAgentStore((s) => s.setCurrentCompany)
  const setTasks = useAgentStore((s) => s.setTasks)
  const setAgents = useAgentStore((s) => s.setAgents)
  const agents = useAgentStore((s) => s.agents)
  const [tasksLoaded, setTasksLoaded] = useState(false)
  const [agentsLoaded, setAgentsLoaded] = useState(false)
  const [isAgentFormOpen, setIsAgentFormOpen] = useState(false)

  useEffect(() => {
    if (!id) return
    const token = getStoredToken()
    const headers = token ? { Authorization: `Bearer ${token}` } : {}

    fetch(`${BASE_URL}/api/companies/${id}`, { headers })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setCurrentCompany({ id: data.id, name: data.name })
      })
      .catch(() => {})

    setTasksLoaded(false)
    fetch(`${BASE_URL}/api/companies/${id}/tasks`, { headers })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        setTasks(Array.isArray(data) ? data : [])
        setTasksLoaded(true)
      })
      .catch(() => {
        setTasksLoaded(true)
      })

    setAgentsLoaded(false)
    fetch(`${BASE_URL}/api/companies/${id}/agents`, { headers })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        setAgents(Array.isArray(data) ? data : [])
        setAgentsLoaded(true)
      })
      .catch(() => {
        setAgentsLoaded(true)
      })

    return () => {
      setCurrentCompany(null)
      setTasks([])
      setAgents([])
    }
  }, [id, setCurrentCompany, setTasks, setAgents])

  const handleEditAgent = (_agent: Agent) => {
    // TODO: open edit modal
  }

  const handleCreateAgent = async (data: AgentFormData) => {
    if (!id) return
    const token = getStoredToken()
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (token) headers['Authorization'] = `Bearer ${token}`
    try {
      const res = await fetch(`${BASE_URL}/api/companies/${id}/agents`, {
        method: 'POST',
        headers,
        body: JSON.stringify(data),
      })
      if (res.ok) {
        const newAgent = await res.json()
        setAgents([...agents, newAgent])
        setIsAgentFormOpen(false)
      }
    } catch {
      // silently fail
    }
  }

  return (
    <div data-testid="company-page">
      <WarRoomPage />

      {/* Agent creation modal */}
      {isAgentFormOpen && (
        <div
          data-testid="agent-form-modal"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            zIndex: 50,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsAgentFormOpen(false)
          }}
        >
          <div
            style={{
              background: '#1e293b',
              borderRadius: 8,
              padding: '1.5rem',
              width: 400,
              border: '1px solid rgba(255,255,255,0.1)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0, color: '#f1f5f9', fontWeight: 700 }}>Add Agent</h3>
              <button
                data-testid="agent-form-modal-close"
                onClick={() => setIsAgentFormOpen(false)}
                style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '1.4rem' }}
              >
                ×
              </button>
            </div>
            <AgentForm onSubmit={handleCreateAgent} />
          </div>
        </div>
      )}

      {/* Agents section */}
      {agentsLoaded && agents.length === 0 && (
        <EmptyState
          emoji="🤖"
          title="Your AI team is waiting"
          subtitle="Add agents to start automating"
          ctaLabel="+ Add Agent"
          onCTA={() => setIsAgentFormOpen(true)}
        />
      )}
      {agents.length > 0 && (
        <div style={{ padding: '0 1rem', marginBottom: '1rem' }}>
          <h2 style={{ fontSize: '0.95rem', fontWeight: 600, color: '#e5e7eb', marginBottom: '0.75rem' }}>
            Agents ({agents.length})
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '0.75rem' }}>
            {agents.map((agent) => (
              <AgentCard key={agent.id} agent={agent} companyId={id ?? ''} onEdit={handleEditAgent} />
            ))}
          </div>
        </div>
      )}

      <KanbanBoard companyId={id ?? ''} isLoaded={tasksLoaded} />
    </div>
  )
}
