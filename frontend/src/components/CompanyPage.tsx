import React, { useEffect, useState, useCallback, useRef, lazy, Suspense } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import WarRoomPage from './WarRoomPage'
// SIRI-UX-444: lazy-load KanbanBoard — Board tab is not always active, no need to bundle eagerly
const KanbanBoard = lazy(() => import('./KanbanBoard'))
import AgentForm, { type AgentFormData } from './AgentForm'
import AgentCard from './AgentCard'
import Button from './Button'
import EmptyState from './EmptyState'
import SkeletonCard from './SkeletonCard'
import { useAgentStore } from '../store/agentStore'
import { getStoredToken, BASE_URL } from '../api/client'
import { useToast } from '../context/ToastContext'
import { Bot } from 'lucide-react'
// SIRI-UX-107: import shared utilities to eliminate local duplicates of AVATAR_COLORS + hashCode
import { getAvatarColor, getInitials as _getInitials } from '../utils/taskUtils'
// SIRI-UX-132: use shared debounced useIsMobile to avoid excessive re-renders on resize
import { useIsMobile } from '../hooks/useIsMobile'
// SIRI-UX-155: focus trap for agent creation modal
import { useFocusTrap } from '../hooks/useFocusTrap'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

// SIRI-UX-440: React.memo — CompanyHeader receives stable props (name + memoized onHomeClick)
// but re-renders on every CompanyPage state change (tab switch, tasks loaded, etc.)
const CompanyHeader = React.memo(function CompanyHeader({ name, onHomeClick }: { name: string; onHomeClick: () => void }) {
  // SIRI-UX-107: use shared getAvatarColor + getInitials from taskUtils
  const avatarColor = getAvatarColor(name)
  const initials = _getInitials(name)
  const isMobile = useIsMobile()

  return (
    <div
      data-testid="company-header"
      className="flex items-center gap-2.5 bg-gray-900/80 backdrop-blur-sm border-b border-white/10 h-12 px-4"
    >
      {/* Breadcrumb — hidden on mobile, show only avatar + name */}
      {!isMobile && (
        <>
          <button
            data-testid="company-header-home-link"
            onClick={onHomeClick}
            className="bg-transparent border-none text-slate-400 cursor-pointer text-sm p-0"
          >
            AgentCo
          </button>
          <span className="text-slate-600 text-sm">/</span>
        </>
      )}
      {/* SIRI-UX-084: removed hidden duplicate button that caused duplicate data-testid on mobile */}

      {/* Avatar */}
      <div
        data-testid="company-avatar"
        // SIRI-UX-370: aria-label provides accessible name — initials alone are not self-descriptive
        aria-label={name}
        title={name}
        className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
        style={{ backgroundColor: avatarColor }}
      >
        {initials}
      </div>

      {/* Company name */}
      <span
        data-testid="company-header-name"
        className="font-semibold text-[0.95rem] text-slate-100"
      >
        {name}
      </span>
    </div>
  )
})

type TabId = 'war-room' | 'board' | 'agents'

const TAB_LABELS: { id: TabId; label: string }[] = [
  { id: 'war-room', label: 'War Room' },
  { id: 'board', label: 'Board' },
  { id: 'agents', label: 'Agents' },
]


// SIRI-UX-290: module-level constant — was inside component body (recreated on every render, same bug as SIRI-UX-253)
const TASK_LIMIT = 50

export default function CompanyPage() {
  useDocumentTitle('Company — AgentCo')
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
    // SIRI-UX-234: reset local activeTab so switching companies always lands on War Room
    setActiveTab('war-room')
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

  // SIRI-UX-336: stable callback — avoids re-render of CompanyHeader on every CompanyPage render
  const handleHomeClick = useCallback(() => navigate('/'), [navigate])

  // SIRI-UX-277: memoize to avoid unnecessary KanbanBoard re-renders on each CompanyPage render
  const handleLoadMoreTasks = useCallback(async () => {
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
        // SIRI-UX-312: use functional updater to avoid stale closure on taskOffset
        // Concurrent calls or StrictMode double-invoke could use stale value otherwise
        setTaskOffset((prev) => prev + items.length)
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
  }, [id, hasMoreTasks, taskOffset, toast])

  // SIRI-UX-291: memoize to avoid unnecessary AgentForm re-renders on each CompanyPage render (same pattern as handleLoadMoreTasks/SIRI-UX-277)
  const handleCreateAgent = useCallback(async (data: AgentFormData) => {
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
  }, [id, toast])

  return (
    <div data-testid="company-page" className="flex flex-col h-full">
      {/* SIRI-UX-127: error state — shown instead of silent empty page on fetch failures */}
      {loadError && (
        <div
          role="alert"
          className="m-4 px-4 py-3.5 bg-red-950/85 border border-red-700 rounded-lg text-red-100 text-sm"
        >
          {loadError}
        </div>
      )}

      {/* Company header breadcrumb */}
      {currentCompany && (
        <CompanyHeader
          name={currentCompany.name}
          onHomeClick={handleHomeClick}
        />
      )}

      {/* Tab navigation */}
      <div
        role="tablist"
        aria-label="Company sections"
        className="flex items-center gap-0 bg-[#0d1321] border-b border-white/[0.08] px-4 shrink-0"
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
              id={`tab-${id}-${tab.id}`}
              role="tab"
              aria-selected={isActive}
              aria-controls={`tabpanel-${id}-${tab.id}`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => { setActiveTab(tab.id); setActiveCompanyTab(tab.id) }}
              onKeyDown={handleKeyDown}
              // SIRI-UX-263: CSS class for hover instead of JS onMouseEnter/onMouseLeave
              className={`company-tab-btn px-[18px] py-2.5 bg-transparent border-none text-sm cursor-pointer -mb-px border-b-2 ${isActive ? 'border-b-blue-500 text-slate-100 font-semibold' : 'border-b-transparent text-slate-500 font-medium'}`}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Tab panels */}
      <div className="flex-1 overflow-hidden relative">
        {/* War Room panel */}
        <div
          role="tabpanel"
          id={`tabpanel-${id}-war-room`}
          aria-labelledby={`tab-${id}-war-room`}
          hidden={activeTab !== 'war-room'}
          className="h-full"
        >
          {/* SIRI-UX-083: when agents not yet loaded, show WarRoomPage (has its own isConnecting state)
              Only show "Add first agent" empty state after we confirm agents are empty */}
          {activeTab === 'war-room' && agentsLoaded && agents.length === 0 ? (
            <div className="flex items-center justify-center h-full">
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
          id={`tabpanel-${id}-board`}
          aria-labelledby={`tab-${id}-board`}
          hidden={activeTab !== 'board'}
          className="h-full overflow-y-auto"
        >
          {activeTab === 'board' && (
            <Suspense fallback={
              <div className="flex items-center justify-center h-[40vh]">
                <div
                  className="app-suspense-spinner w-7 h-7 rounded-full border-[3px] border-slate-800 border-t-blue-500"
                />
              </div>
            }>
              <KanbanBoard
                companyId={id ?? ''}
                isLoaded={tasksLoaded}
                hasMore={hasMoreTasks}
                onLoadMore={handleLoadMoreTasks}
              />
            </Suspense>
          )}
        </div>

        {/* Agents panel */}
        <div
          role="tabpanel"
          id={`tabpanel-${id}-agents`}
          aria-labelledby={`tab-${id}-agents`}
          hidden={activeTab !== 'agents'}
          className="h-full overflow-y-auto p-5"
        >
          {activeTab === 'agents' && (
            <>
              <div className="flex justify-between items-center mb-4">
                <h2 className="m-0 text-base font-bold text-slate-100">
                  Team
                </h2>
                <Button variant="primary" onClick={() => setIsAgentFormOpen(true)} className="text-[0.8rem] px-3.5 py-1.5">
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
                <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
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
          className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsAgentFormOpen(false)
          }}
        >
          <div
            ref={agentModalTrapRef}
            data-testid="agent-form-modal-content"
            className="bg-slate-800 rounded-lg p-6 w-[400px] border border-white/10"
          >
            <div className="flex justify-between items-center mb-4">
              <h3 className="m-0 text-slate-100 font-bold">Add Agent</h3>
              {/* SIRI-UX-399: aria-label on close button so screen reader doesn't read literal "×" */}
              <Button
                data-testid="agent-form-modal-close"
                variant="secondary"
                aria-label="Close Add Agent dialog"
                onClick={() => setIsAgentFormOpen(false)}
                className="px-2 py-1 text-xl"
              >
                <span aria-hidden="true">×</span>
              </Button>
            </div>
            <AgentForm onSubmit={handleCreateAgent} />
          </div>
        </div>
      )}
    </div>
  )
}
