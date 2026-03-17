import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { getStoredToken } from '../api/client'

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

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

const statusColors: Record<string, string> = {
  done: '#4ade80',
  running: '#60a5fa',
  failed: '#f87171',
  pending: '#fbbf24',
}

export default function LibraryPortfolioPage() {
  const { id } = useParams<{ id: string }>()
  const [portfolio, setPortfolio] = useState<PortfolioData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!id) return
    const token = getStoredToken()
    fetch(`${BASE_URL}/api/library/${id}/portfolio`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
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
        setError(err.message)
        setLoading(false)
      })
  }, [id])

  return (
    <div
      data-testid="portfolio-page"
      style={{ padding: '1.5rem', maxWidth: 720 }}
    >
      <div style={{ marginBottom: '1.25rem' }}>
        <Link
          to="/library"
          style={{ color: '#60a5fa', fontSize: '0.875rem', textDecoration: 'none' }}
        >
          ← Back to Library
        </Link>
      </div>

      <h1 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 0.25rem', color: '#f1f5f9' }}>
        {portfolio?.agent_name ?? 'Portfolio'}
      </h1>
      <p style={{ margin: '0 0 1.5rem', fontSize: '0.875rem', color: '#94a3b8' }}>
        Agent Portfolio
      </p>

      {loading ? (
        <p style={{ color: '#94a3b8' }}>Loading…</p>
      ) : error ? (
        <p style={{ color: '#f87171' }}>Error: {error}</p>
      ) : portfolio ? (
        <>
          {/* Stats row */}
          <div style={{ display: 'flex', gap: 16, marginBottom: '1.5rem' }}>
            <div
              data-testid="portfolio-total-tasks"
              style={{
                background: '#1e293b',
                border: '1px solid #334155',
                borderRadius: 10,
                padding: '0.875rem 1.25rem',
                flex: 1,
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#f1f5f9' }}>
                {portfolio.total_tasks}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 4 }}>
                Total Tasks
              </div>
            </div>
            <div
              data-testid="portfolio-success-rate"
              style={{
                background: '#1e293b',
                border: '1px solid #334155',
                borderRadius: 10,
                padding: '0.875rem 1.25rem',
                flex: 1,
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#4ade80' }}>
                {portfolio.success_rate}%
              </div>
              <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 4 }}>
                Success Rate
              </div>
            </div>
          </div>

          {/* Task list */}
          {portfolio.tasks.length === 0 ? (
            <p style={{ color: '#94a3b8', textAlign: 'center', padding: '2rem' }}>
              No tasks yet
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {portfolio.tasks.map((task) => (
                <div
                  key={task.id}
                  data-testid={`portfolio-task-${task.id}`}
                  style={{
                    background: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: 8,
                    padding: '0.75rem 1rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#f1f5f9' }}>
                      {task.title}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 2 }}>
                      {task.company_name} · {new Date(task.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      color: statusColors[task.status] ?? '#94a3b8',
                      background: 'rgba(255,255,255,0.05)',
                      padding: '2px 8px',
                      borderRadius: 4,
                      flexShrink: 0,
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
