import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAgentStore } from '../store/agentStore'
// SIRI-UX-270: focus trap for dialog — matches pattern used in KanbanBoard, CompanyPage, TaskDetailSidebar
import { useFocusTrap } from '../hooks/useFocusTrap'

// SIRI-UX-285: detect macOS to show ⌘K instead of Ctrl+K in the trigger button
// SIRI-UX-295: navigator.platform is deprecated (MDN 2022). Use navigator.userAgentData?.platform
// (Chrome 90+) as primary source; fall back to navigator.platform for older browsers.
// Evaluated at call time so test environments that override navigator properties work correctly.
function getIsMac(): boolean {
  if (typeof navigator === 'undefined') return false
  const uadPlatform = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform
  if (uadPlatform) return /mac/i.test(uadPlatform)
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform)
}

// SIRI-UX-387: module-level constant — was inside component body (recreated on every render)
const GROUP_LABELS: Record<string, string> = {
  company: 'Companies',
  agent: 'Agents',
  task: 'Tasks',
}

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
  // SIRI-UX-288: scroll active item into view when navigating with arrow keys
  // SIRI-UX-415: listboxRef was dead code — scrollIntoView uses document.getElementById instead
  const navigate = useNavigate()
  // SIRI-UX-270: focus trap — prevents Tab/Shift+Tab from leaving the dialog
  const dialogTrapRef = useFocusTrap(open)

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
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  // SIRI-UX-275: Escape listener gated on `open` — only active when dialog is open.
  useEffect(() => {
    if (!open) return
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [open])

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

  // SIRI-UX-296: removed redundant alias — use `results` directly

  const handleSelect = useCallback((result: SearchResult) => {
    setOpen(false)
    navigate(result.path)
  }, [navigate])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((prev) => Math.min(prev + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((prev) => Math.max(prev - 1, 0))
    } else if (e.key === 'Enter' && activeIndex >= 0 && activeIndex < results.length) {
      e.preventDefault()
      handleSelect(results[activeIndex])
    }
  }, [activeIndex, results, handleSelect])

  // SIRI-UX-288: scroll the active search option into the visible listbox area when activeIndex changes
  useEffect(() => {
    if (activeIndex < 0) return
    const el = document.getElementById(`search-option-${activeIndex}`)
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'nearest' })
    }
  }, [activeIndex])

  if (!open) {
    return (
      <button
        data-testid="global-search-trigger"
        onClick={() => setOpen(true)}
        aria-label="Open search"
        className="bg-transparent border border-gray-700 rounded-md text-gray-400 px-3 py-1 text-xs cursor-pointer flex items-center gap-1.5"
      >
        {/* SIRI-UX-396: aria-hidden so screen reader doesn't announce raw emoji glyph name */}
        <span aria-hidden="true" className="text-sm">&#x1F50D;</span>
        <span>Search</span>
        {/* SIRI-UX-285: platform-adaptive shortcut hint — ⌘K on Mac, Ctrl+K elsewhere */}
        <kbd className="text-[0.65rem] text-gray-500 ml-1">{getIsMac() ? '⌘K' : 'Ctrl+K'}</kbd>
      </button>
    )
  }

  // SIRI-UX-326: removed duplicate data-testid="global-search-trigger" hidden button — was pointless
  return (
    <div
        data-testid="global-search-overlay"
        onClick={(e) => { if (e.target === e.currentTarget) setOpen(false) }}
        className="fixed inset-0 bg-black/60 flex items-start justify-center pt-[15vh] z-[100]"
      >
        {/* SIRI-UX-235: role="dialog" + aria-modal="true" so screen readers treat this as a modal dialog */}
        {/* SIRI-UX-270: dialogTrapRef traps focus inside dialog (Tab/Shift+Tab stay within) */}
        <div
          ref={dialogTrapRef}
          role="dialog"
          aria-modal="true"
          aria-label="Search"
          className="bg-gray-800 rounded-[10px] w-full max-w-[520px] border border-gray-700 overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.5)]"
        >
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
            className="w-full px-4 py-3 bg-transparent border-none border-b border-gray-700 text-slate-50 text-[0.95rem] outline-none box-border border-b-gray-700"
          />

          {/* SIRI-UX-314: search scope hint so user understands what's being searched */}
          {/* SIRI-UX-400: role="status" + aria-live="polite" so screen reader announces state changes */}
          {debouncedQuery.length < 2 && (
            <p
              data-testid="global-search-scope-hint"
              role="status"
              aria-live="polite"
              className="text-center text-gray-500 px-4 py-3 text-xs"
            >
              {currentCompany
                ? `Searching in "${currentCompany.name}"`
                : 'Select a company to search agents and tasks'}
            </p>
          )}
          {debouncedQuery.length >= 2 && results.length === 0 && (
            <p
              data-testid="global-search-empty"
              role="status"
              aria-live="polite"
              className="text-center text-gray-500 py-4"
            >
              {currentCompany
                ? `No results for "${debouncedQuery}" in "${currentCompany.name}"`
                : `No results for "${debouncedQuery}"`}
            </p>
          )}

          {/* SIRI-UX-142: role="listbox" + role="option" for proper screen reader announcement */}
          {results.length > 0 && (
            <div
              id="global-search-listbox"
              data-testid="search-results"
              role="listbox"
              aria-label="Search results"
              className="max-h-[360px] overflow-y-auto py-2"
            >
              {(['company', 'agent', 'task'] as const).map((type) => {
                const group = grouped[type]
                if (!group || group.length === 0) return null
                return (
                  <div key={type} data-testid={`search-group-${type}s`}>
                    <div className="px-4 py-1 text-[0.7rem] text-gray-500 font-semibold uppercase tracking-wide">
                      {GROUP_LABELS[type]}
                    </div>
                    {group.map((result) => {
                      const flatIdx = results.indexOf(result)
                      const isActive = flatIdx === activeIndex
                      return (
                        <div
                          key={result.id}
                          id={`search-option-${flatIdx}`}
                          role="option"
                          aria-selected={isActive}
                          data-testid={isActive ? 'search-result-active' : undefined}
                          onClick={() => handleSelect(result)}
                          className={`px-4 py-2 cursor-pointer flex flex-col gap-0.5 search-result-item${isActive ? ' search-result-item--active' : ''}`}
                        >
                          <span className="text-sm text-slate-50">{result.title}</span>
                          {result.subtitle && (
                            <span className="text-[0.7rem] text-gray-500">{result.subtitle}</span>
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
  )
}
