import { useEffect, useState, useCallback, useRef } from 'react'
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
// SIRI-UX-107: import shared utilities to eliminate local duplicates of AVATAR_COLORS + hashCode
import { getAvatarColor, getInitials as _getInitials } from '../utils/taskUtils'
// SIRI-UX-132: use shared debounced useIsMobile to avoid excessive re-renders on resize
import { useIsMobile } from '../hooks/useIsMobile'
// SIRI-UX-155: focus trap for agent creation modal
import { useFocusTrap } from '../hooks/useFocusTrap'

function CompanyHeader({ name, onHomeClick }: { name: string; onHomeClick: () => void }) {
  // SIRI-UX-107: use shared getAvatarColor + getInitials from taskUtils
  const avatarColor = getAvatarColor(name)
  const initials = _getInitials(name)
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
  const [loadError, setLoadError] = useState<string | null>(null)
  const [taskOffset, setTaskOffset] = useState(0)
  const [hasMoreTasks, setHasMoreTasks] = useState(false)
  const TASK_LIMIT = 50
  const [isAgentFormOpen, setIsAgentFormOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<TabId>('war-room')
  // SIRI-UX-155: focus trap for agent creation modal
  const agentModalTrapRef = useFocusTrap(isAgentFormOpen)
  // SIRI-UX-176: abort controller for handleLoadMoreTasks
  const loadMoreAbortRef = useRef<AbortController | null>(null)
  useEffect(() => {
    return () => { loadMoreAbortRef.current?.abort() }
  }, [])
  // SIRI-UX-186: abort controller for handleCreateAgent POST
  const createAgentAbortRef = useRef<AbortController | null>(null)
  useEffect(() => {
    return () => { createAgentAbortRef.current?.abort() }
  }, [])

  // SIRI-UX-091: close modal on Escape key
  const handleModalEscape = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') setIsAgentFormOpen(false)
  }, [])
  useEffect(() => {
    if (isAgentFormOpen) {
      document.addEventListener('keydown', handleModalEscape)
      return () => document.removeEventListener('keydown', handleModalEscape)
    }
  }, [isAgentFormOpen, handleModalEscape])

  useEffect(() => {
    setActiveCompanyTab('war-room')
    return () => setActiveCompanyTab(null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])
  const toast = useToast()

  useEffect(() => {
    if (!id) return
    const controller = new AbortController()
    const { signal } = controller
    const token = getStoredToken()
    const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {}

    fetch(`${BASE_URL}/api/companies/${id}`, { headers, signal })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((data) => {
        if (data) setCurrentCompany({ id: data.id, name: data.name })
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return
        setLoadError('Failed to load company. Please try again.')
        toast.error('Failed to load company. Please try again.')
      })

    setLoadError(null)
    setTasksLoaded(false)
    setTaskOffset(0)
    setHasMoreTasks(false)
    fetch(`${BASE_URL}/api/companies/${id}/tasks?limit=${TASK_LIMIT}&offset=0`, { headers, signal })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((data) => {
        const items = Array.isArray(data) ? data : []
        setTasks(items)
        setHasMoreTasks(items.length === TASK_LIMIT)
        setTaskOffset(items.length)
        setTasksLoaded(true)
      })
      .catch((err) => {
        if (err?.name !== 'AbortError') {
          setLoadError('Failed to load tasks. Please try again.')
          toast.error('Failed to load tasks. Please try again.')
        }
        setTasksLoaded(true)
      })

    setAgentsLoaded(false)
    fetch(`${BASE_URL}/api/companies/${id}/agents`, { headers, signal })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((data) => {
        setAgents(Array.isArray(data) ? data : [])
        setAgentsLoaded(true)
      })
      .catch((err) => {
        if (err?.name !== 'AbortError') {
          setLoadError('Failed to load agents. Please try again.')
          toast.error('Failed to load agents. Please try again.')
        }
        setAgentsLoaded(true)
      })

    return () => {
      controller.abort()
      setCurrentCompany(null)
      setTasks([])
      setAgents([])
      setAgentsLoaded(false)
      setLoadError(null)
      setActiveCompanyTab(null)
    }
  }, [id, setCurrentCompany, setTasks, setAgents, setActiveCompanyTab])

  const handleLoadMoreTasks = async () => {
    if (!id || !hasMoreTasks) return
    // SIRI-UX-176: abort any previous in-flight load-more request
    loadMoreAbortRef.current?.abort()
    const controller = new AbortController()
    loadMoreAbortRef.current = controller
    const { signal } = controller
    const token = getStoredToken()
    const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {}
    try {
      const res = await fetch(
        `${BASE_URL}/api/companies/${id}/tasks?limit=${TASK_LIMIT}&offset=${taskOffset}`,
        { headers, signal }
      )
      if (res.ok) {
        const data = await res.json()
        const items = Array.isArray(data) ? data : []
        const currentTasks = useAgentStore.getState().tasks
        setTasks([...currentTasks, ...items])
        setTaskOffset(taskOffset + items.length)
        setHasMoreTasks(items.length === TASK_LIMIT)
      } else {
        // SIRI-UX-151: surface load-more errors so user knows what happened
        toast.error(`Failed to load more tasks (${res.status})`)
      }
    } catch (err) {
      // SIRI-UX-176: ignore AbortError when component unmounts
      if (err instanceof Error && err.name === 'AbortError') return
      // SIRI-UX-151: surface network errors
      toast.error('Failed to load more tasks')
    } finally {
      if (!signal.aborted) loadMoreAbortRef.current = null
    }
  }

  const handleCreateAgent = async (data: AgentFormData) => {
    if (!id) return
    // SIRI-UX-186: abort any previous in-flight request; guard setState on unmounted component
    createAgentAbortRef.current?.abort()
    const controller = new AbortController()
    createAgentAbortRef.current = controller
    const { signal } = controller
    const token = getStoredToken()
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (token) headers['Authorization'] = `Bearer ${token}`
    try {
      const res = await fetch(`${BASE_URL}/api/companies/${id}/agents`, {
        method: 'POST',
        headers,
        body: JSON.stringify(data),
        signal,
      })
      if (res.ok) {
        const newAgent = await res.json()
        // SIRI-UX-219: use getState() to avoid stale closure — agents in closure may be outdated
        // if concurrent updates happened between render and handleCreateAgent call
        setAgents([...useAgentStore.getState().agents, newAgent])
        setIsAgentFormOpen(false)
        toast.success(`Agent ${data.name} created`)
      } else {
        toast.error('Failed to create agent. Try again.')
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return
      toast.error('Network error — could not create agent')
    } finally {
      if (!signal.aborted) {
        createAgentAbortRef.current = null
      }
    }
  }

  return (
    <div data-testid="company-page" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* SIRI-UX-127: error state — shown instead of silent empty page on fetch failures */}
      {loadError && (
        <div
          role="alert"
          style={{
            margin: '1rem',
            padding: '0.875rem 1rem',
            background: 'rgba(127, 29, 29, 0.85)',
            border: '1px solid #b91c1c',
            borderRadius: '0.5rem',
            color: '#fee2e2',
            fontSize: '0.875rem',
          }}
        >
          {loadError}
        </div>
      )}

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
        {TAB_LABELS.map((tab, index) => {
          const isActive = activeTab === tab.id
          const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
            if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
              e.preventDefault()
              const nextIndex = e.key === 'ArrowRight'
                ? (index + 1) % TAB_LABELS.length
                : (index - 1 + TAB_LABELS.length) % TAB_LABELS.length
              const nextTab = TAB_LABELS[nextIndex]
              setActiveTab(nextTab.id)
              setActiveCompanyTab(nextTab.id)
              // Move focus to the newly activated tab
              const tablist = e.currentTarget.closest('[role="tablist"]')
              if (tablist) {
                const buttons = tablist.querySelectorAll<HTMLButtonElement>('[role="tab"]')
                buttons[nextIndex]?.focus()
              }
            }
          }
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              aria-controls={`tabpanel-${tab.id}`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => { setActiveTab(tab.id); setActiveCompanyTab(tab.id) }}
              onKeyDown={handleKeyDown}
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
          role="dialog"
          aria-modal="true"
          aria-label="Add Agent"
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
            ref={agentModalTrapRef}
            data-testid="agent-form-modal-content"
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
