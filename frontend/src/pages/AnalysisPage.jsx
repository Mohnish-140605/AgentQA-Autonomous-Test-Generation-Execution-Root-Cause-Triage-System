// Analysis Page — Home / main view
import { useState, useRef, useCallback } from 'react'
import {
  GitBranch, Code2, TestTube2, Play, AlertTriangle, FileText,
  CheckCircle2, XCircle, Terminal, Download, ChevronDown, ChevronUp, Loader2
} from 'lucide-react'
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend
} from 'recharts'

const API_BASE = (import.meta.env.VITE_API_BASE || import.meta.env.VITE_API_URL || '').trim()

const AGENTS = [
  { name: 'GitHub Fetch', icon: GitBranch },
  { name: 'Code Analyst', icon: Code2 },
  { name: 'Test Writer',  icon: TestTube2 },
  { name: 'Executor',     icon: Play },
  { name: 'Triage',       icon: AlertTriangle },
  { name: 'Reporter',     icon: FileText },
]

function isValidGitHubUrl(url) {
  return /^https?:\/\/github\.com\/[\w-]+\/[\w.\-]+\/?$/i.test(url.trim())
}

function AgentCard({ name, status, Icon }) {
  return (
    <div className={`agent-card ${status}`}>
      <div className="agent-icon">
        {status === 'running' ? <span className="spinner" /> : <Icon size={16} />}
      </div>
      <span className="agent-name">{name}</span>
      <span className={`agent-badge ${status}`}>{status}</span>
    </div>
  )
}

function LogFeed({ logs }) {
  const ref = useRef(null)
  // Auto-scroll
  const prevLen = useRef(0)
  if (logs.length !== prevLen.current) {
    prevLen.current = logs.length
    setTimeout(() => {
      if (ref.current) ref.current.scrollTop = ref.current.scrollHeight
    }, 0)
  }

  return (
    <div className="terminal">
      <div className="terminal-header">
        <Terminal size={12} style={{ color: 'var(--text-dim)' }} />
        <span className="terminal-header-title">Execution Logs</span>
        {logs.length > 0 && (
          <span className="spinner" style={{ marginLeft: 'auto', width: 8, height: 8 }} />
        )}
      </div>
      <div className="terminal-body" ref={ref}>
        {logs.length === 0 ? (
          <div style={{ color: 'var(--text-dim)', fontStyle: 'italic' }}>
            Awaiting pipeline start…
          </div>
        ) : (
          logs.map((log, i) => (
            <div
              key={log.id || i}
              className={`log-line ${log.type || 'info'}`}
              style={{ paddingLeft: (log.depth || 0) * 16 }}
            >
              <span className="log-prefix">{log.depth > 0 ? '↳' : '❯'}</span>
              <span>{log.msg}</span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function StatsPanel({ summary }) {
  const s = summary || {}
  const total = (s.passed || 0) + (s.failed || 0)
  const passRate = total ? ((s.passed / total) * 100).toFixed(1) : '0.0'
  const cov = s.coverage_pct >= 0 ? `${s.coverage_pct}%` : 'n/a'

  const donutData = [
    { name: 'Passed', value: s.passed || 0 },
    { name: 'Failed', value: s.failed || 0 },
  ]

  return (
    <div className="section-gap mt-3">
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">{s.files_analyzed ?? 0}</div>
          <div className="stat-label">Files</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{s.tests_generated ?? 0}</div>
          <div className="stat-label">Tests</div>
        </div>
        <div className="stat-card pass-color">
          <div className="stat-value" style={{ color: 'var(--pass)' }}>{s.passed ?? 0}</div>
          <div className="stat-label">Passed</div>
        </div>
        <div className="stat-card fail-color">
          <div className="stat-value" style={{ color: 'var(--fail)' }}>{s.failed ?? 0}</div>
          <div className="stat-label">Failed</div>
        </div>
        <div className="stat-card gold-color">
          <div className="stat-value" style={{ color: 'var(--gold)' }}>{cov}</div>
          <div className="stat-label">Coverage</div>
        </div>
      </div>

      {s.total_py_files === 0 && (
        <div className="error-banner mt-2" style={{ borderColor: 'var(--warn)', background: 'rgba(245,158,11,0.08)', color: 'var(--warn)' }}>
          <AlertTriangle size={16} /> 
          <div>
            <strong>No suitable Python files found.</strong><br/>
            AgentQA currently only analyzes .py files (excluding tests/ and __pycache__). This repository may be in a different language, or structured differently.
          </div>
        </div>
      )}

      <div className="two-col mt-3" style={{ alignItems: 'center' }}>
        <div className="card" style={{ padding: '1rem', height: 210 }}>
          <div className="card-title">Pass Rate — {passRate}%</div>
          <ResponsiveContainer width="100%" height={160}>
            <PieChart>
              <Pie
                data={donutData}
                cx="50%" cy="50%"
                innerRadius={48} outerRadius={70}
                dataKey="value"
                stroke="none"
              >
                <Cell fill="#22c55e" />
                <Cell fill="#ef4444" />
              </Pie>
              <Tooltip
                contentStyle={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, fontSize: 12 }}
              />
              <Legend wrapperStyle={{ fontSize: '0.75rem' }} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="card" style={{ padding: '1rem' }}>
          <div className="card-title">Pipeline Metrics</div>
          {[
            ['Pass Rate',    `${passRate}%`,  passRate >= 65 ? 'var(--pass)' : 'var(--fail)'],
            ['Coverage',     cov,             s.coverage_pct >= 65 ? 'var(--pass)' : 'var(--warn)'],
            ['Tests Run',    total,           'var(--text)'],
            ['Errors',       s.errors ?? 0,  (s.errors ?? 0) > 0 ? 'var(--fail)' : 'var(--pass)'],
          ].map(([label, val, col]) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.6rem' }}>
              <span style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>{label}</span>
              <span style={{ color: col, fontWeight: 700, fontSize: '0.9rem' }}>{val}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function TestResultsTable({ results, jobId }) {
  const [expanded, setExpanded] = useState({})
  if (!results || results.length === 0) return null

  const toggle = (i) => setExpanded(p => ({ ...p, [i]: !p[i] }))

  return (
    <div className="card mt-2">
      <div className="card-title">Test Results ({results.length})</div>
      <div style={{ overflowX: 'auto' }}>
        <table className="result-table">
          <thead>
            <tr>
              <th>Function</th>
              <th>File</th>
              <th>Status</th>
              <th>Cov</th>
              <th>Triage</th>
            </tr>
          </thead>
          <tbody>
            {results.map((r, i) => {
              const ok = r.passed && !r.failed
              return (
                <tr key={i}>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
                    {r.function || '—'}
                  </td>
                  <td style={{ color: 'var(--text-dim)', fontSize: '0.78rem', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.target_file || '—'}
                  </td>
                  <td>
                    <span className={`badge ${ok ? 'pass' : 'fail'}`}>
                      {ok ? 'PASS' : 'FAIL'}
                    </span>
                  </td>
                  <td style={{ color: 'var(--text-dim)', fontSize: '0.78rem' }}>
                    {r.coverage_pct >= 0 ? `${r.coverage_pct}%` : '—'}
                  </td>
                  <td style={{ maxWidth: 320 }}>
                    <span className="triage-text">{r.triage || ''}</span>
                    {r.output && (
                      <button
                        onClick={() => toggle(i)}
                        style={{ marginLeft: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', verticalAlign: 'middle' }}
                        title="Toggle output"
                      >
                        {expanded[i] ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                      </button>
                    )}
                    {expanded[i] && (
                      <pre style={{ marginTop: '0.4rem', fontSize: '0.7rem', color: 'var(--text-dim)', whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontFamily: 'var(--font-mono)' }}>
                        {r.output}
                      </pre>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {jobId && (
        <div className="mt-2">
          <button
            className="btn-gold"
            style={{ fontSize: '0.85rem', padding: '0.6rem 1.2rem' }}
            onClick={() => window.open(`${API_BASE}/report/${jobId}/pdf`, '_blank')}
          >
            <Download size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
            Download PDF Report
          </button>
        </div>
      )}
    </div>
  )
}

export default function AnalysisPage() {
  const [url,     setUrl]     = useState('')
  const [loading, setLoading] = useState(false)
  const [steps,   setSteps]   = useState({})
  const [logs,    setLogs]    = useState([])
  const [report,  setReport]  = useState(null)
  const [jobId,   setJobId]   = useState(null)
  const [error,   setError]   = useState(null)
  const esRef = useRef(null)

  const isValid = isValidGitHubUrl(url)

  const resetState = () => {
    setSteps({});
    setLogs([]);
    setReport(null);
    setError(null);
    setJobId(null);
    if (esRef.current) { esRef.current.close(); esRef.current = null; }
  }

  const handleAnalyze = useCallback(async () => {
    if (!isValid || loading) return
    resetState()
    setLoading(true)

    let jobData
    try {
      const res = await fetch(`${API_BASE}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ github_url: url.trim() }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`)
      jobData = await res.json()
    } catch (err) {
      setError(err.message)
      setLoading(false)
      return
    }

    const id = jobData.job_id
    setJobId(id)

    const es = new EventSource(`${API_BASE}/stream/${id}`)
    esRef.current = es

    const receivedDone = { current: false }

    es.onmessage = (evt) => {
      let msg
      try { msg = JSON.parse(evt.data) } catch { return }

      if (msg.type === 'step') {
        setSteps(prev => ({ ...prev, [msg.data.step]: msg.data.status }))
      } else if (msg.type === 'log') {
        setLogs(prev => [...prev, msg.data])
      } else if (msg.type === 'done') {
        receivedDone.current = true
        setReport(msg.report)
        setLoading(false)
        es.close()
        esRef.current = null
      } else if (msg.type === 'error' || msg.error) {
        setError(msg.detail || msg.error || 'Pipeline failed')
        setLoading(false)
        es.close()
        esRef.current = null
      }
    }

    es.onerror = () => {
      if (!receivedDone.current && esRef.current) {
        setError('Lost connection to server. Is the backend running on port 8000?')
        setLoading(false)
        esRef.current.close()
        esRef.current = null
      }
    }
  }, [url, isValid, loading])

  const displaySteps = AGENTS.map(a => ({
    ...a,
    status: steps[a.name] || 'idle',
  }))

  return (
    <div className="page-content">
      {/* Hero */}
      <div className="hero">
        <div className="hero-badge">✦ Multi-Agent QA System</div>
        <h1 className="hero-title">AgentQA</h1>
        <p className="hero-sub">
          Autonomous test generation &amp; root-cause triage for any public GitHub repo — powered by Gemini 1.5 Flash.
        </p>

        {/* URL input */}
        <div className="analyze-row">
          <input
            id="github-url-input"
            type="text"
            className={`analyze-input${url && !isValid ? ' invalid' : ''}`}
            placeholder="https://github.com/owner/repo"
            value={url}
            onChange={e => setUrl(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !loading && isValid && handleAnalyze()}
            disabled={loading}
            spellCheck={false}
            autoComplete="off"
          />
          <button
            id="analyze-btn"
            className="btn-gold"
            onClick={handleAnalyze}
            disabled={loading || !isValid}
          >
            {loading ? <><span className="spinner" style={{ marginRight: 6 }} />Analyzing…</> : 'Analyze →'}
          </button>
        </div>
        {url && !isValid && (
          <p style={{ marginTop: '0.5rem', fontSize: '0.78rem', color: 'var(--fail)' }}>
            ⚠ Use format: https://github.com/owner/repo
          </p>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="error-banner mt-2">
          <XCircle size={16} /> {error}
        </div>
      )}

      {/* Pipeline progress */}
      {(loading || Object.keys(steps).length > 0) && (
        <div className="card section-gap mt-2">
          <div className="card-title">Pipeline Progress</div>
          <div className="pipeline-row">
            {displaySteps.map((a, i) => (
              <>
                <AgentCard key={a.name} name={a.name} status={a.status} Icon={a.icon} />
                {i < displaySteps.length - 1 && <div className="agent-connector" />}
              </>
            ))}
          </div>
          <LogFeed logs={logs} />
        </div>
      )}

      {/* Results */}
      {report && (
        <>
          <div className="card mt-2">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
              <CheckCircle2 size={18} style={{ color: 'var(--pass)' }} />
              <div className="card-title" style={{ margin: 0 }}>
                Analysis Complete — {report.repo}
              </div>
            </div>
            <StatsPanel summary={report.summary} />
          </div>
          <TestResultsTable results={report.test_results} jobId={jobId} />
        </>
      )}
    </div>
  )
}
