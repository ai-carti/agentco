import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import WarRoom from './WarRoom'
import KanbanBoard from './KanbanBoard'
import { useAgentStore } from '../store/agentStore'
import { getStoredToken } from '../api/client'

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

export default function CompanyPage() {
  const { id } = useParams<{ id: string }>()
  const setCurrentCompany = useAgentStore((s) => s.setCurrentCompany)
  const setTasks = useAgentStore((s) => s.setTasks)
  const [tasksLoaded, setTasksLoaded] = useState(false)

  useEffect(() => {
    if (!id) return
    const token = getStoredToken()
    const headers = token ? { Authorization: `Bearer ${token}` } : {}

    fetch(`${BASE_URL}/api/v1/companies/${id}`, { headers })
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

    return () => {
      setCurrentCompany(null)
      setTasks([])
    }
  }, [id, setCurrentCompany, setTasks])

  return (
    <div data-testid="company-page">
      <WarRoom />
      <KanbanBoard companyId={id ?? ''} isLoaded={tasksLoaded} />
    </div>
  )
}
