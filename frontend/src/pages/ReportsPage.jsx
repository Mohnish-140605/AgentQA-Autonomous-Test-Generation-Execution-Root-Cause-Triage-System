// Reports History Page
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Download, FileText, RefreshCw, Braces } from 'lucide-react'

const API_BASE = (import.meta.env.VITE_API_BASE || import.meta.env.VITE_API_URL || '').trim()

function passRateColor(rate) {
  if (rate >= 65) return 'var(--pass)'
  if (rate >= 40) return 'var(--warn)'
  return 'var(--fail)'
}

export default function ReportsPage() {
  const [reports,  setReports]  = useState([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState(null)
  const navigate = useNavigate()

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE}/reports`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setReports(data.reports || data || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  return (
    <div className="page-content">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 800, letterSpacing: '-0.03em' }}>Reports</h1>
          <p style={{ color: 'var(--text-dim)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
            History of all past analysis runs
          </p>
        </div>
        <button className="btn-outline" onClick={load} title="Refresh">
          <RefreshCw size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="error-banner">Failed to load reports: {error}</div>
      )}

      <div className="card">
        {loading ? (
          <div className="empty-state">
            <span className="spinner" style={{ margin: '0 auto 0.5rem', display: 'block' }} />
            Loading reports…
          </div>
        ) : reports.length === 0 ? (
          <div className="empty-state">
            <FileText size={36} style={{ margin: '0 auto 0.75rem', color: 'var(--text-dim)' }} />
            <p>No reports yet. Run an analysis first.</p>
          </div>
        ) : (
          <table className="history-table">
            <thead>
              <tr>
                <th>Repository</th>
                <th>Generated</th>
                <th>Tests</th>
                <th>Pass Rate</th>
                <th>Coverage</th>
                <th>Runtime</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {reports.map((r, i) => {
                const summary = r.summary || {}
                const total = (summary.passed || 0) + (summary.failed || 0)
                const passRate = total ? ((summary.passed / total) * 100).toFixed(1) : '—'
                const cov = summary.coverage_pct >= 0 ? `${summary.coverage_pct}%` : '—'
                const runtimeSecs = summary?.execution_time?.total_seconds
                const runtime = typeof runtimeSecs === 'number' && Number.isFinite(runtimeSecs)
                  ? `${runtimeSecs.toFixed(1)}s`
                  : '—'

                return (
                  <tr key={i} onClick={() => navigate(`/reports/${r.id || i}`, { state: { report: r } })}>
                    <td style={{ fontWeight: 600 }}>{r.repo || '—'}</td>
                    <td style={{ color: 'var(--text-dim)', fontSize: '0.82rem' }}>
                      {r.generated_at ? new Date(r.generated_at).toLocaleString() : '—'}
                    </td>
                    <td>{summary.tests_generated ?? '—'}</td>
                    <td style={{ color: passRateColor(parseFloat(passRate)), fontWeight: 700 }}>
                      {passRate !== '—' ? `${passRate}%` : '—'}
                    </td>
                    <td style={{ color: 'var(--text-dim)' }}>{cov}</td>
                    <td style={{ color: 'var(--text-dim)' }}>{runtime}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        {r.json_url && (
                          <a
                            href={r.json_url}
                            target="_blank"
                            rel="noreferrer"
                            onClick={e => e.stopPropagation()}
                            className="btn-outline"
                            style={{ fontSize: '0.75rem', padding: '0.3rem 0.7rem' }}
                            title="Download JSON"
                          >
                            <Braces size={11} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                            JSON
                          </a>
                        )}
                        {r.pdf_url && (
                        <a
                          href={r.pdf_url}
                          target="_blank"
                          rel="noreferrer"
                          onClick={e => e.stopPropagation()}
                          className="btn-outline"
                          style={{ fontSize: '0.75rem', padding: '0.3rem 0.7rem' }}
                        >
                          <Download size={11} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                          PDF
                        </a>
                      )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
