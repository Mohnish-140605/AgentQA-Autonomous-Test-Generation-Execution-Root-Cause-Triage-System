// Report Detail Page — Full breakdown of a single report
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, FileCode2, CheckCircle2, XCircle, AlertCircle } from 'lucide-react'

function statusColor(r) {
  if (r.passed && !r.failed) return 'var(--pass)'
  if (r.errors > 0)           return 'var(--warn)'
  return 'var(--fail)'
}

function statusIcon(r) {
  if (r.passed && !r.failed)  return <CheckCircle2 size={15} style={{ color: 'var(--pass)' }} />
  if (r.errors > 0)           return <AlertCircle  size={15} style={{ color: 'var(--warn)' }} />
  return <XCircle size={15} style={{ color: 'var(--fail)' }} />
}

export default function ReportDetail() {
  const { state } = useLocation()
  const navigate  = useNavigate()
  const report    = state?.report

  if (!report) {
    return (
      <div className="page-content">
        <div className="empty-state">
          <p>No report data available.</p>
          <button className="btn-outline mt-2" onClick={() => navigate('/reports')}>
            ← Back to Reports
          </button>
        </div>
      </div>
    )
  }

  const s       = report.summary || {}
  const modules = report.modules || []
  const results = report.test_results || []
  const critical = report.critical_failures || []

  // Build a map: function name → triage result for quick lookup
  const resultMap = {}
  for (const r of results) {
    resultMap[r.function] = r
  }

  return (
    <div className="page-content">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
        <button
          className="btn-outline"
          onClick={() => navigate('/reports')}
          style={{ padding: '0.4rem 0.75rem' }}
        >
          <ArrowLeft size={14} style={{ marginRight: 4 }} />
          Back
        </button>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 800, letterSpacing: '-0.03em' }}>
            {report.repo || 'Unknown Repo'}
          </h1>
          <p style={{ color: 'var(--text-dim)', fontSize: '0.82rem' }}>
            {report.generated_at ? new Date(report.generated_at).toLocaleString() : '—'}
          </p>
        </div>
      </div>

      {/* Summary stats */}
      <div className="card section-gap">
        <div className="card-title">Summary</div>
        <div className="stats-grid">
          {[
            ['Files',     s.files_analyzed  ?? 0,  ''],
            ['Tests',     s.tests_generated ?? 0,  ''],
            ['Passed',    s.passed          ?? 0,  'pass-color'],
            ['Failed',    s.failed          ?? 0,  'fail-color'],
            ['Coverage',  s.coverage_pct >= 0 ? `${s.coverage_pct}%` : 'n/a', 'gold-color'],
          ].map(([label, val, cls]) => (
            <div key={label} className={`stat-card ${cls}`}>
              <div className="stat-value">{val}</div>
              <div className="stat-label">{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Critical failures */}
      {s.total_py_files === 0 && (
        <div className="card mt-2" style={{ borderColor: 'var(--warn)', background: 'rgba(245,158,11,0.05)' }}>
          <div className="card-title" style={{ color: 'var(--warn)' }}>
            ⚠ No Python Files Detected
          </div>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-dim)' }}>
            No eligible Python (<code>.py</code>) files were found in this repository to analyze. AgentQA currently only processes Python code.
          </p>
        </div>
      )}

      {critical.length > 0 && (
        <div className="card mt-2" style={{ borderColor: 'rgba(239,68,68,0.25)', background: 'rgba(239,68,68,0.04)' }}>
          <div className="card-title" style={{ color: 'var(--fail)' }}>
            ⚠ Critical Failures ({critical.length})
          </div>
          {critical.map((cf, i) => (
            <div key={i} style={{ marginBottom: '0.85rem', paddingBottom: '0.85rem', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, fontSize: '0.9rem' }}>
                <XCircle size={14} style={{ color: 'var(--fail)' }} />
                {cf.function} <span style={{ fontWeight: 400, color: 'var(--text-dim)', fontSize: '0.8rem' }}>— {cf.file}</span>
              </div>
              <p style={{ marginTop: '0.35rem', fontSize: '0.82rem', color: 'var(--text-dim)', fontStyle: 'italic' }}>
                {cf.triage || 'No triage available'}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Test Metadata / LLM Errors */}
      {report.tests_metadata && report.tests_metadata.some(t => t.llm_error) && (
        <div className="card mt-2" style={{ borderColor: 'rgba(245,158,11,0.25)', background: 'rgba(245,158,11,0.04)' }}>
          <div className="card-title" style={{ color: 'var(--warn)' }}>
            ⚠ Test Generation Diagnostics
          </div>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginBottom: '1rem' }}>
            Some tests could not be enhanced with the LLM API and fell back to standard stubs.
          </p>
          {report.tests_metadata.filter(t => t.llm_error).map((t, i) => (
            <div key={i} style={{ marginBottom: '0.5rem' }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{t.function}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--fail)', fontFamily: 'var(--font-mono)' }}>{t.llm_error}</div>
            </div>
          ))}
        </div>
      )}

      {/* Module tree */}
      {modules.length > 0 && (
        <div className="card mt-2">
          <div className="card-title">Module Tree</div>
          {modules.map((mod, i) => (
            <div key={i} style={{ marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.6rem' }}>
                <FileCode2 size={14} style={{ color: 'var(--gold)' }} />
                <code style={{ fontSize: '0.82rem', color: 'var(--gold)' }}>{mod.path}</code>
                <span style={{ color: 'var(--text-dim)', fontSize: '0.75rem' }}>
                  {mod.loc} lines · {(mod.functions || []).length} functions
                </span>
              </div>
              {(mod.functions || []).map((fn, j) => {
                const r = resultMap[fn.name]
                return (
                  <div
                    key={j}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '0.65rem',
                      padding: '0.6rem 0.75rem',
                      marginBottom: '0.35rem',
                      borderRadius: 'var(--r-sm)',
                      background: 'rgba(255,255,255,0.02)',
                      border: `1px solid ${r ? statusColor(r) + '30' : 'var(--border)'}`,
                    }}
                  >
                    <span style={{ marginTop: 2 }}>{r ? statusIcon(r) : <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>○</span>}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <code style={{ fontSize: '0.82rem', fontWeight: 600 }}>{fn.name}</code>
                        <span style={{ color: 'var(--text-dim)', fontSize: '0.72rem' }}>
                          line {fn.lineno}
                          {fn.args?.length > 0 && ` · (${fn.args.join(', ')})`}
                        </span>
                        {r && (
                          <span className={`badge ${r.passed && !r.failed ? 'pass' : r.errors > 0 ? 'warn' : 'fail'}`}>
                            {r.passed && !r.failed ? 'PASS' : r.errors > 0 ? 'ERR' : 'FAIL'}
                          </span>
                        )}
                      </div>
                      {r?.triage && (
                        <p style={{ marginTop: '0.3rem', fontSize: '0.77rem', color: 'var(--text-dim)', fontStyle: 'italic' }}>
                          {r.triage}
                        </p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
