import { useEffect, lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import AuthPage from './components/AuthPage'
import ProtectedRoute from './components/ProtectedRoute'
import Navbar from './components/Navbar'
import Breadcrumb from './components/Breadcrumb'
import Sidebar from './components/Sidebar'
import ErrorBoundary from './components/ErrorBoundary'
import NotFoundPage from './components/NotFoundPage'
import { useAuthStore } from './store/authStore'

// Route-level code splitting — deferred chunks loaded on navigation
const CompaniesPage = lazy(() => import('./components/CompaniesPage'))
const CompanyPage = lazy(() => import('./components/CompanyPage'))
const AgentPage = lazy(() => import('./components/AgentPage'))
const AgentEditPage = lazy(() => import('./components/AgentEditPage'))
const SettingsPage = lazy(() => import('./components/SettingsPage'))
const CompanySettingsPage = lazy(() => import('./components/CompanySettingsPage'))
const WarRoomPage = lazy(() => import('./components/WarRoomPage'))
const OnboardingPage = lazy(() => import('./components/OnboardingPage'))
const LibraryPage = lazy(() => import('./components/LibraryPage'))
const LibraryPortfolioPage = lazy(() => import('./components/LibraryPortfolioPage'))
const BillingPage = lazy(() => import('./pages/BillingPage'))

function AppLayout() {
  return (
    <>
      <Navbar />
      <div style={{ display: 'flex', minHeight: 'calc(100vh - 49px)' }}>
        <Sidebar />
        <div style={{ flex: 1, minWidth: 0 }}>
          <Breadcrumb />
          <ErrorBoundary>
            {/* SIRI-UX-140: show inline spinner instead of null so slow-network users see feedback */}
            <Suspense fallback={
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
                <div style={{
                  width: 32, height: 32, borderRadius: '50%',
                  border: '3px solid #1e293b',
                  borderTopColor: '#3b82f6',
                  animation: 'spin 0.8s linear infinite',
                }} />
              </div>
            }>
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
            </Suspense>
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
