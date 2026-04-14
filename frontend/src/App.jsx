// AgentQA — Main App with routing
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
import AnalysisPage from './pages/AnalysisPage.jsx'
import ReportsPage  from './pages/ReportsPage.jsx'
import ReportDetail from './pages/ReportDetail.jsx'

export default function App() {
  return (
    <BrowserRouter>
      <div className="app-shell">
        {/* ── Top navigation ── */}
        <nav className="topnav">
          <div className="topnav-logo">
            <span className="topnav-logo-badge">AQ</span>
            AgentQA
          </div>
          <div className="topnav-links">
            <NavLink
              to="/"
              end
              className={({ isActive }) => `topnav-link${isActive ? ' active' : ''}`}
            >
              Analyze
            </NavLink>
            <NavLink
              to="/reports"
              className={({ isActive }) => `topnav-link${isActive ? ' active' : ''}`}
            >
              Reports
            </NavLink>
          </div>
        </nav>

        {/* ── Page routes ── */}
        <Routes>
          <Route path="/"              element={<AnalysisPage />} />
          <Route path="/reports"       element={<ReportsPage />} />
          <Route path="/reports/:id"   element={<ReportDetail />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}
