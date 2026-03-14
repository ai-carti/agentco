import { useEffect } from 'react'
import WarRoom from './components/WarRoom'
import KanbanBoard from './components/KanbanBoard'
import AuthPage from './components/AuthPage'
import { useAuthStore } from './store/authStore'

function App() {
  const token = useAuthStore((s) => s.token)
  const initAuth = useAuthStore((s) => s.initAuth)

  useEffect(() => {
    initAuth()
  }, [])

  if (!token) {
    return <AuthPage />
  }

  return (
    <div style={{ fontFamily: 'sans-serif', background: '#0f172a', minHeight: '100vh', color: '#f8fafc' }}>
      <WarRoom />
      <KanbanBoard />
    </div>
  )
}

export default App
