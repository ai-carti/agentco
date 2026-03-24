import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAgentStore } from '../store/agentStore'

interface SearchResult {
  id: string
  type: 'company' | 'agent' | 'task'
  title: string
  subtitle?: string
  path: string
}

export default function GlobalSearch() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const navigate = useNavigate()

  const agents = useAgentStore((s) => s.agents)
  const tasks = useAgentStore((s) => s.tasks)
  const currentCompany = useAgentStore((s) => s.currentCompany)

  // Cmd+K / Ctrl+K to open
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(true)
      }
      if (e.key === 'Escape') {
        setOpen(false)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  // Focus input when opened
  // SIRI-UX-181: store timer ID in ref so cleanup can clearTimeout on unmount/re-render
  const focusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (open) {
      setQuery('')
      setDebouncedQuery('')
      setActiveIndex(-1)
      if (focusTimerRef.current) clearTimeout(focusTimerRef.current)
      focusTimerRef.current = setTimeout(() => inputRef.current?.focus(), 0)
    }
    return () => {
      if (focusTimerRef.current) {
        clearTimeout(focusTimerRef.current)
        focusTimerRef.current = null
      }
    }
  }, [open])

  // Debounce search
  const handleQueryChange = useCallback((value: string) => {
    setQuery(value)
    setActiveIndex(-1)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setDebouncedQuery(value), 200)
  }, [])

  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [])

  const results = useMemo((): SearchResult[] => {
    if (debouncedQuery.length < 2) return []
    const q = debouncedQuery.toLowerCase()
    const items: SearchResult[] = []

    // Companies
    if (currentCompany && currentCompany.name.toLowerCase().includes(q)) {
      items.push({
        id: currentCompany.id,
        type: 'company',
        title: currentCompany.name,
        path: `/companies/${currentCompany.id}`,
      })
    }

    // Agents
    for (const agent of agents) {
      const match = agent.name.toLowerCase().includes(q) ||
        (agent.role && agent.role.toLowerCase().includes(q))
      if (match) {
        items.push({
          id: agent.id,
          type: 'agent',
          title: agent.name,
          subtitle: agent.role,
          path: currentCompany ? `/companies/${currentCompany.id}/agents/${agent.id}` : '/',
        })
      }
    }

    // Tasks
    for (const task of tasks) {
      const match = task.title.toLowerCase().includes(q) ||
        (task.description && task.description.toLowerCase().includes(q))
      if (match) {
        items.push({
          id: task.id,
          type: 'task',
          title: task.title,
          subtitle: task.description,
          path: currentCompany ? `/companies/${currentCompany.id}` : '/',
        })
      }
    }

    return items
  }, [debouncedQuery, currentCompany, agents, tasks])

  // Group by type
  const grouped = useMemo(() => {
    const groups: Record<string, SearchResult[]> = {}
    for (const r of results) {
      if (!groups[r.type]) groups[r.type] = []
      groups[r.type].push(r)
    }
    return groups
  }, [results])

  const flatResults = results

  const handleSelect = useCallback((result: SearchResult) => {
    setOpen(false)
    navigate(result.path)
  }, [navigate])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((prev) => Math.min(prev + 1, flatResults.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((prev) => Math.max(prev - 1, 0))
    } else if (e.key === 'Enter' && activeIndex >= 0 && activeIndex < flatResults.length) {
      e.preventDefault()
      handleSelect(flatResults[activeIndex])
    }
  }, [activeIndex, flatResults, handleSelect])

  const groupLabels: Record<string, string> = {
    company: 'Companies',
    agent: 'Agents',
    task: 'Tasks',
  }

  if (!open) {
    return (
      <button
        data-testid="global-search-trigger"
        onClick={() => setOpen(true)}
        style={{
          background: 'transparent', border: '1px solid #374151', borderRadius: 6,
          color: '#9ca3af', padding: '0.3rem 0.7rem', fontSize: '0.8rem', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: '0.4rem',
        }}
      >
        <span style={{ fontSize: '0.85rem' }}>&#x1F50D;</span>
        <span>Search</span>
        <kbd style={{ fontSize: '0.65rem', color: '#6b7280', marginLeft: '0.25rem' }}>Ctrl+K</kbd>
      </button>
    )
  }

  return (
    <>
      <button
        data-testid="global-search-trigger"
        onClick={() => setOpen(true)}
        style={{ display: 'none' }}
      />
      <div
        data-testid="global-search-overlay"
        onClick={(e) => { if (e.target === e.currentTarget) setOpen(false) }}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
          paddingTop: '15vh', zIndex: 100,
        }}
      >
        {/* SIRI-UX-235: role="dialog" + aria-modal="true" so screen readers treat this as a modal dialog */}
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Search"
          style={{
          background: '#1f2937', borderRadius: 10, width: '100%', maxWidth: 520,
          border: '1px solid #374151', overflow: 'hidden',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        }}>
          {/* SIRI-UX-142: combobox pattern — input controls the listbox below */}
          <input
            ref={inputRef}
            data-testid="global-search-input"
            role="combobox"
            aria-label="Search companies, agents, tasks"
            aria-expanded={debouncedQuery.length >= 2}
            aria-controls="global-search-listbox"
            aria-autocomplete="list"
            aria-activedescendant={activeIndex >= 0 ? `search-option-${activeIndex}` : undefined}
            type="text"
            placeholder="Search companies, agents, tasks..."
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            onKeyDown={handleKeyDown}
            style={{
              width: '100%', padding: '0.75rem 1rem', background: 'transparent',
              border: 'none', borderBottom: '1px solid #374151', color: '#f8fafc',
              fontSize: '0.95rem', outline: 'none', boxSizing: 'border-box',
            }}
          />

          {debouncedQuery.length >= 2 && results.length === 0 && (
            <p
              data-testid="global-search-empty"
              style={{ textAlign: 'center', color: '#6b7280', padding: '1rem 0' }}
            >
              {`No results for "${debouncedQuery}"`}
            </p>
          )}

          {/* SIRI-UX-142: role="listbox" + role="option" for proper screen reader announcement */}
          {results.length > 0 && (
            <div
              id="global-search-listbox"
              data-testid="search-results"
              role="listbox"
              aria-label="Search results"
              style={{ maxHeight: 360, overflowY: 'auto', padding: '0.5rem 0' }}
            >
              {(['company', 'agent', 'task'] as const).map((type) => {
                const group = grouped[type]
                if (!group || group.length === 0) return null
                return (
                  <div key={type} data-testid={`search-group-${type}s`}>
                    <div style={{ padding: '0.35rem 1rem', fontSize: '0.7rem', color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      {groupLabels[type]}
                    </div>
                    {group.map((result) => {
                      const flatIdx = flatResults.indexOf(result)
                      const isActive = flatIdx === activeIndex
                      return (
                        <div
                          key={result.id}
                          id={`search-option-${flatIdx}`}
                          role="option"
                          aria-selected={isActive}
                          data-testid={isActive ? 'search-result-active' : undefined}
                          onClick={() => handleSelect(result)}
                          className={`search-result-item${isActive ? ' search-result-item--active' : ''}`}
                          style={{
                            padding: '0.5rem 1rem', cursor: 'pointer',
                            display: 'flex', flexDirection: 'column', gap: '0.1rem',
                          }}
                        >
                          <span style={{ fontSize: '0.85rem', color: '#f8fafc' }}>{result.title}</span>
                          {result.subtitle && (
                            <span style={{ fontSize: '0.7rem', color: '#6b7280' }}>{result.subtitle}</span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
