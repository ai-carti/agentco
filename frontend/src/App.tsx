import { useEffect } from 'react'
import { Routes, Route } from 'react-router-dom'
import AuthPage from './components/AuthPage'
import ProtectedRoute from './components/ProtectedRoute'
import Navbar from './components/Navbar'
import Breadcrumb from './components/Breadcrumb'
import Sidebar from './components/Sidebar'
import CompaniesPage from './components/CompaniesPage'
import CompanyPage from './components/CompanyPage'
import AgentPage from './components/AgentPage'
import SettingsPage from './components/SettingsPage'
import CompanySettingsPage from './components/CompanySettingsPage'
import { useAuthStore } from './store/authStore'

function AppLayout() {
  return (
    <>
      <Navbar />
      <div style={{ display: 'flex', minHeight: 'calc(100vh - 49px)' }}>
        <Sidebar />
        <div style={{ flex: 1, minWidth: 0 }}>
          <Breadcrumb />
          <Routes>
            <Route path="/" element={<CompaniesPage />} />
            <Route path="/companies/:id" element={<CompanyPage />} />
            <Route path="/companies/:id/agents/:agentId" element={<AgentPage />} />
            <Route path="/companies/:id/settings" element={<CompanySettingsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </div>
      </div>
    </>
  )
}

function App() {
  const initAuth = useAuthStore((s) => s.initAuth)

  useEffect(() => {
    initAuth()
  }, [])

  return (
    <div style={{ fontFamily: 'sans-serif', background: '#0f172a', minHeight: '100vh', color: '#f8fafc' }}>
      <Routes>
        <Route path="/auth" element={<AuthPage />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/*" element={<AppLayout />} />
        </Route>
      </Routes>
    </div>
  )
}

export default App
