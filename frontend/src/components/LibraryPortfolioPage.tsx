import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { getStoredToken, BASE_URL } from '../api/client'
import SkeletonCard from './SkeletonCard'
// SIRI-UX-198: use shared STATUS_COLORS from taskUtils instead of local statusColors
// SIRI-UX-305: formatDateLong for consistent en-US date format
import { STATUS_COLORS, formatDateLong } from '../utils/taskUtils'
import { useDocumentTitle } from '../hooks/useDocumentTitle'


interface PortfolioTask {
  id: string
  title: string
  status: string
  company_name: string
  created_at: string
}

interface PortfolioData {
  agent_name: string
  total_tasks: number
  success_rate: number
  tasks: PortfolioTask[]
}

export default function LibraryPortfolioPage() {
  useDocumentTitle('Portfolio — AgentCo')
  const { id } = useParams<{ id: string }>()
  const [portfolio, setPortfolio] = useState<PortfolioData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Holds the current AbortController so Retry can cancel a previous in-flight request
  const abortRef = useRef<AbortController | null>(null)

  // SIRI-UX-095 / SIRI-UX-169: useCallback reused by mount effect and Retry button.
  const fetchPortfolio = useCallback(() => {
    if (!id) return
    // Abort any previous in-flight request
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setError('')
    setLoading(true)
    const token = getStoredToken()
    fetch(`${BASE_URL}/api/library/${id}/portfolio`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal: controller.signal,
    })
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status}`)
        return res.json()
      })
      .then((data: PortfolioData) => {
        setPortfolio(data)
        setLoading(false)
      })
      .catch((err: Error) => {
        if (err instanceof DOMException && err.name === 'AbortError') return
        setError(err.message)
        setLoading(false)
      })
  }, [id])

  useEffect(() => {
    fetchPortfolio()
    return () => abortRef.current?.abort()
  }, [fetchPortfolio])

  return (
    <div
      data-testid="portfolio-page"
      className="p-6 max-w-[720px]"
    >
      <div className="mb-5">
        <Link
          to="/library"
          className="text-blue-400 text-sm no-underline"
        >
          ← Back to Library
        </Link>
      </div>

      <h1 className="text-xl font-bold m-0 mb-1 text-gray-100">
        {portfolio?.agent_name ?? 'Portfolio'}
      </h1>
      <p className="m-0 mb-6 text-sm text-slate-400">
        Agent Portfolio
      </p>

      {loading ? (
        <SkeletonCard variant="task" count={3} />
      ) : error ? (
        <div
          role="alert"
          className="py-8 px-6 bg-red-900/10 border border-red-900 rounded-lg text-center"
        >
          <p className="text-red-400 m-0 mb-3">Failed to load portfolio</p>
          <button
            onClick={fetchPortfolio}
            aria-label="Retry loading portfolio"
            className="py-1.5 px-4 bg-transparent border border-red-900 rounded-md text-red-400 text-sm cursor-pointer"
          >
            Retry
          </button>
        </div>
      ) : portfolio ? (
        <>
          {/* Stats row */}
          <div className="flex gap-4 mb-6">
            <div
              data-testid="portfolio-total-tasks"
              className="bg-slate-800 border border-slate-700 rounded-[10px] py-3.5 px-5 flex-1 text-center"
            >
              <div className="text-3xl font-bold text-gray-100">
                {portfolio.total_tasks}
              </div>
              <div className="text-xs text-slate-500 mt-1">
                Total Tasks
              </div>
            </div>
            <div
              data-testid="portfolio-success-rate"
              className="bg-slate-800 border border-slate-700 rounded-[10px] py-3.5 px-5 flex-1 text-center"
            >
              <div className="text-3xl font-bold text-green-400">
                {portfolio.success_rate}%
              </div>
              <div className="text-xs text-slate-500 mt-1">
                Success Rate
              </div>
            </div>
          </div>

          {/* Task list */}
          {/* SIRI-UX-455: styled empty state instead of bare <p> — consistent with rest of app */}
          {portfolio.tasks.length === 0 ? (
            <div
              data-testid="portfolio-empty"
              className="flex flex-col items-center py-12 px-6 gap-3 text-slate-400 text-center"
            >
              <span className="text-5xl">📋</span>
              <p className="m-0 text-base font-semibold text-gray-100">
                No tasks yet
              </p>
              <p className="m-0 text-sm">
                Run tasks through this agent to see them here
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {portfolio.tasks.map((task) => (
                <div
                  key={task.id}
                  data-testid={`portfolio-task-${task.id}`}
                  className="bg-slate-800 border border-slate-700 rounded-lg py-3 px-4 flex items-center gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-[0.9rem] text-gray-100">
                      {task.title}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {/* SIRI-UX-305: use formatDateLong for consistent en-US format */}
                      {task.company_name} · {formatDateLong(task.created_at)}
                    </div>
                  </div>
                  <span
                    className="text-xs font-semibold rounded px-2 py-0.5 shrink-0"
                    style={{
                      // SIRI-UX-198: use shared STATUS_COLORS for consistency with Kanban
                      color: STATUS_COLORS[task.status]?.text ?? '#94a3b8',
                      background: STATUS_COLORS[task.status]?.bg ?? 'rgba(255,255,255,0.05)',
                    }}
                  >
                    {task.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      ) : null}
    </div>
  )
}
