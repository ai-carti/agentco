import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import AuthPage from './components/AuthPage'
import ProtectedRoute from './components/ProtectedRoute'
import Navbar from './components/Navbar'
import Breadcrumb from './components/Breadcrumb'
import Sidebar from './components/Sidebar'
import CompaniesPage from './components/CompaniesPage'
import CompanyPage from './components/CompanyPage'
import AgentPage from './components/AgentPage'
import AgentEditPage from './components/AgentEditPage'
import SettingsPage from './components/SettingsPage'
import CompanySettingsPage from './components/CompanySettingsPage'
import WarRoomPage from './components/WarRoomPage'
import OnboardingPage from './components/OnboardingPage'
import LibraryPage from './components/LibraryPage'
import LibraryPortfolioPage from './components/LibraryPortfolioPage'
import BillingPage from './pages/BillingPage'
import ErrorBoundary from './components/ErrorBoundary'
import NotFoundPage from './components/NotFoundPage'
import { useAuthStore } from './store/authStore'

function AppLayout() {
  return (
    <>
      <Navbar />
      <div style={{ display: 'flex', minHeight: 'calc(100vh - 49px)' }}>
        <Sidebar />
        <div style={{ flex: 1, minWidth: 0 }}>
          <Breadcrumb />
          <ErrorBoundary>
            <Routes>
              <Route path="/" element={<CompaniesPage />} />
              <Route path="/onboarding" element={<OnboardingPage />} />
              <Route path="/companies/:id" element={<CompanyPage />} />
              {/* SIRI-UX-052: /war-room without company context → redirect to companies list */}
              <Route path="/war-room" element={<Navigate to="/" replace />} />
              <Route path="/companies/:id/warroom" element={<WarRoomPage />} />
              <Route path="/companies/:id/agents/:agentId" element={<AgentPage />} />
              <Route path="/companies/:id/agents/:agentId/edit" element={<AgentEditPage />} />
              <Route path="/companies/:id/settings" element={<CompanySettingsPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/settings/billing" element={<BillingPage />} />
              <Route path="/library" element={<LibraryPage />} />
              <Route path="/library/:id/portfolio" element={<LibraryPortfolioPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </ErrorBoundary>
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
