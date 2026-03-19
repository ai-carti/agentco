import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

import { LayoutWithOutlet } from './components/Layout/LayoutWithOutlet';
import { ProtectedRoute } from './components/Auth/ProtectedRoute';

import { AuthPage } from './pages/AuthPage';
import { CompaniesPage } from './pages/CompaniesPage';
import { CompanyPage } from './pages/CompanyPage';
import { AgentPage } from './pages/AgentPage';
import { SettingsPage } from './pages/SettingsPage';

// ─── App ──────────────────────────────────────────────────────────────────────

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public */}
        <Route path="/auth" element={<AuthPage />} />

        {/* Protected + layout */}
        <Route element={<ProtectedRoute />}>
          <Route element={<LayoutWithOutlet />}>
            <Route index path="/" element={<CompaniesPage />} />
            <Route path="/companies/:id" element={<CompanyPage />} />
            <Route path="/companies/:id/agents/:agentId" element={<AgentPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
