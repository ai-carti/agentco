import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import WarRoomPage from './WarRoomPage'
import KanbanBoard from './KanbanBoard'
import AgentForm, { type AgentFormData } from './AgentForm'
import AgentCard from './AgentCard'
import Button from './Button'
import EmptyState from './EmptyState'
import SkeletonCard from './SkeletonCard'
import { useAgentStore } from '../store/agentStore'
import { getStoredToken } from '../api/client'
import { useToast } from '../context/ToastContext'
import { Bot } from 'lucide-react'

const AVATAR_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e',
  '#f97316', '#eab308', '#22c55e', '#06b6d4',
]

function hashCode(str: string): number {
  let h = 0
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

const MOBILE_BREAKPOINT = 640

function useIsMobile() {
  const [mobile, setMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < MOBILE_BREAKPOINT)
  useEffect(() => {
    const handler = () => setMobile(window.innerWidth < MOBILE_BREAKPOINT)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])
  return mobile
}

function CompanyHeader({ name, onHomeClick }: { name: string; onHomeClick: () => void }) {
  const colorIndex = hashCode(name) % 8
  const avatarColor = AVATAR_COLORS[colorIndex]
  const initials = name.slice(0, 2).toUpperCase()
  const isMobile = useIsMobile()

  return (
    <div
      data-testid="company-header"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        background: 'rgba(17,24,39,0.8)',
        backdropFilter: 'blur(8px)',
        borderBottom: '1px solid rgba(255,255,255,0.1)',
        height: 48,
        padding: '0 16px',
      }}
    >
      {/* Breadcrumb — hidden on mobile, show only avatar + name */}
      {!isMobile && (
        <>
          <button
            data-testid="company-header-home-link"
            onClick={onHomeClick}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              fontSize: '0.875rem',
              padding: 0,
            }}
          >
            AgentCo
          </button>
          <span style={{ color: '#475569', fontSize: '0.875rem' }}>/</span>
        </>
      )}
      {/* SIRI-UX-084: removed hidden duplicate button that caused duplicate data-testid on mobile */}

      {/* Avatar */}
      <div
        data-testid="company-avatar"
        style={{
          width: 32,
          height: 32,
          borderRadius: '50%',
          background: avatarColor,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '0.75rem',
          fontWeight: 700,
          color: '#fff',
          flexShrink: 0,
        }}
      >
        {initials}
      </div>

      {/* Company name */}
      <span
        data-testid="company-header-name"
        style={{ fontWeight: 600, fontSize: '0.95rem', color: '#f1f5f9' }}
      >
        {name}
      </span>
    </div>
  )
}

type TabId = 'war-room' | 'board' | 'agents'

const TAB_LABELS: { id: TabId; label: string }[] = [
  { id: 'war-room', label: 'War Room' },
  { id: 'board', label: 'Board' },
  { id: 'agents', label: 'Agents' },
]

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

export default function CompanyPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const setCurrentCompany = useAgentStore((s) => s.setCurrentCompany)
  const setTasks = useAgentStore((s) => s.setTasks)
  const setAgents = useAgentStore((s) => s.setAgents)
  const setActiveCompanyTab = useAgentStore((s) => s.setActiveCompanyTab)
  const agents = useAgentStore((s) => s.agents)
  const currentCompany = useAgentStore((s) => s.currentCompany)
  const [tasksLoaded, setTasksLoaded] = useState(false)
  const [agentsLoaded, setAgentsLoaded] = useState(false)
  const [taskOffset, setTaskOffset] = useState(0)
  const [hasMoreTasks, setHasMoreTasks] = useState(false)
  const TASK_LIMIT = 50
  const [isAgentFormOpen, setIsAgentFormOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<TabId>('war-room')

  useEffect(() => {
    setActiveCompanyTab('war-room')
    return () => setActiveCompanyTab(null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])
  const toast = useToast()

  useEffect(() => {
    if (!id) return
    const token = getStoredToken()
    const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {}

    fetch(`${BASE_URL}/api/companies/${id}`, { headers })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setCurrentCompany({ id: data.id, name: data.name })
      })
      .catch(() => {})

    setTasksLoaded(false)
    setTaskOffset(0)
    setHasMoreTasks(false)
    fetch(`${BASE_URL}/api/companies/${id}/tasks?limit=${TASK_LIMIT}&offset=0`, { headers })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        const items = Array.isArray(data) ? data : []
        setTasks(items)
        setHasMoreTasks(items.length === TASK_LIMIT)
        setTaskOffset(items.length)
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
      setAgentsLoaded(false)
      setActiveCompanyTab(null)
    }
  }, [id, setCurrentCompany, setTasks, setAgents, setActiveCompanyTab])

  const handleLoadMoreTasks = async () => {
    if (!id || !hasMoreTasks) return
    const token = getStoredToken()
    const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {}
    try {
      const res = await fetch(
        `${BASE_URL}/api/companies/${id}/tasks?limit=${TASK_LIMIT}&offset=${taskOffset}`,
        { headers }
      )
      if (res.ok) {
        const data = await res.json()
        const items = Array.isArray(data) ? data : []
        const currentTasks = useAgentStore.getState().tasks
        setTasks([...currentTasks, ...items])
        setTaskOffset(taskOffset + items.length)
        setHasMoreTasks(items.length === TASK_LIMIT)
      }
    } catch {
      // silently ignore
    }
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
        toast.success(`Agent ${data.name} created`)
      } else {
        toast.error('Failed to create agent. Try again.')
      }
    } catch {
      toast.error('Network error — could not create agent')
    }
  }

  return (
    <div data-testid="company-page" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Company header breadcrumb */}
      {currentCompany && (
        <CompanyHeader
          name={currentCompany.name}
          onHomeClick={() => navigate('/')}
        />
      )}

      {/* Tab navigation */}
      <div
        role="tablist"
        aria-label="Company sections"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 0,
          background: '#0d1321',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          padding: '0 16px',
          flexShrink: 0,
        }}
      >
        {TAB_LABELS.map((tab) => {
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              aria-controls={`tabpanel-${tab.id}`}
              onClick={() => { setActiveTab(tab.id); setActiveCompanyTab(tab.id) }}
              onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.color = '#94a3b8' }}
              onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.color = '#64748b' }}
              style={{
                padding: '10px 18px',
                background: 'transparent',
                border: 'none',
                borderBottom: isActive ? '2px solid #3b82f6' : '2px solid transparent',
                color: isActive ? '#f1f5f9' : '#64748b',
                fontSize: '0.875rem',
                fontWeight: isActive ? 600 : 500,
                cursor: 'pointer',
                transition: 'color 0.15s, border-color 0.15s',
                marginBottom: -1,
              }}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Tab panels */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        {/* War Room panel */}
        <div
          role="tabpanel"
          id="tabpanel-war-room"
          hidden={activeTab !== 'war-room'}
          style={{ height: '100%' }}
        >
          {/* SIRI-UX-083: when agents not yet loaded, show WarRoomPage (has its own isConnecting state)
              Only show "Add first agent" empty state after we confirm agents are empty */}
          {activeTab === 'war-room' && agentsLoaded && agents.length === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
              <EmptyState
                data-testid="no-agents-empty-state"
                icon={<Bot className="w-12 h-12 text-gray-400" />}
                title="Add your first agent"
                subtitle="Create an AI agent to start running tasks in this company"
                ctaLabel="+ Add Agent"
                onCTA={() => setIsAgentFormOpen(true)}
              />
            </div>
          ) : activeTab === 'war-room' && <WarRoomPage />}
        </div>

        {/* Board panel */}
        <div
          role="tabpanel"
          id="tabpanel-board"
          hidden={activeTab !== 'board'}
          style={{ height: '100%', overflowY: 'auto' }}
        >
          {activeTab === 'board' && (
            <KanbanBoard
              companyId={id ?? ''}
              isLoaded={tasksLoaded}
              hasMore={hasMoreTasks}
              onLoadMore={handleLoadMoreTasks}
            />
          )}
        </div>

        {/* Agents panel */}
        <div
          role="tabpanel"
          id="tabpanel-agents"
          hidden={activeTab !== 'agents'}
          style={{ height: '100%', overflowY: 'auto', padding: '1.25rem' }}
        >
          {activeTab === 'agents' && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#f1f5f9' }}>
                  Team
                </h2>
                <Button variant="primary" onClick={() => setIsAgentFormOpen(true)} style={{ fontSize: '0.8rem', padding: '0.4rem 0.9rem' }}>
                  + Add Agent
                </Button>
              </div>
              {!agentsLoaded ? (
                <SkeletonCard variant="agent" count={3} />
              ) : agents.length === 0 ? (
                <EmptyState
                  icon={<Bot className="w-12 h-12 text-gray-400" />}
                  title="Your AI team is waiting"
                  subtitle="Add agents to start automating"
                  ctaLabel="+ Add Agent"
                  onCTA={() => setIsAgentFormOpen(true)}
                />
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '0.75rem' }}>
                  {agents.map((agent) => (
                    <AgentCard
                      key={agent.id}
                      agent={agent}
                      companyId={id ?? ''}
                      onEdit={() => id && navigate(`/companies/${id}/agents/${agent.id}/edit`)}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

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
              <Button
                data-testid="agent-form-modal-close"
                variant="secondary"
                onClick={() => setIsAgentFormOpen(false)}
                style={{ padding: '0.25rem 0.5rem', fontSize: '1.2rem' }}
              >
                ×
              </Button>
            </div>
            <AgentForm onSubmit={handleCreateAgent} />
          </div>
        </div>
      )}
    </div>
  )
}
