// Analysis Page — Home / main view
import { useState, useRef, useCallback } from 'react'
import {
  GitBranch, Code2, TestTube2, Play, AlertTriangle, FileText,
  CheckCircle2, XCircle, Terminal, Download, ChevronDown, ChevronUp
} from 'lucide-react'
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend
} from 'recharts'

const API_BASE = (import.meta.env.VITE_API_BASE || import.meta.env.VITE_API_URL || '').trim()
const BENCHMARK_REPO = 'https://github.com/pypa/sampleproject'

const AGENTS = [
  {
    name: 'GitHub Fetch',
    icon: GitBranch,
    blurb: 'Clones repo structure and Python files from GitHub.',
  },
  {
    name: 'Code Analyst',
    icon: Code2,
    blurb: 'Parses code with AST and maps modules, functions, and classes.',
  },
  {
    name: 'Test Writer',
    icon: TestTube2,
    blurb: 'Generates pytest cases and uses LLM to enhance edge coverage.',
  },
  {
    name: 'Executor',
    icon: Play,
    blurb: 'Runs tests, captures pass/fail/error, and computes coverage.',
  },
  {
    name: 'Triage',
    icon: AlertTriangle,
    blurb: 'Explains failures with rules first, then LLM fallback if needed.',
  },
  {
    name: 'Reporter',
    icon: FileText,
    blurb: 'Builds final JSON/PDF report with metrics and quality score.',
  },
]

const SAMPLE_REPOS = [
  {
    label: 'Good Benchmark Repo',
    url: BENCHMARK_REPO,
    desc: 'Default benchmark used for comparison in this portal.',
  },
  {
    label: 'Buggy Demo Repo',
    url: 'https://github.com/andela/buggy-python',
    desc: 'Try this to see common failures and triage behavior.',
  },
]

function isValidGitHubUrl(url) {
  return /^https?:\/\/github\.com\/[\w-]+\/[\w.\-]+\/?$/i.test(url.trim())
}

function sanitizeLlmError(errorText) {
  if (!errorText) return ''
  return String(errorText)
    .replace(/key=[^&\s]+/g, 'key=[REDACTED]')
    .replace(/\s+/g, ' ')
    .trim()
}

function buildPatchSuggestion(result) {
  if (result?.triage_meta?.patch_suggestion) return result.triage_meta.patch_suggestion
  const fn = result?.function || 'function_name'
  const file = result?.target_file || 'path/to/file.py'
  const issue = result?.triage_meta?.code || 'issue'
  const recommendation = result?.triage_meta?.fix_recommendation || 'Apply minimal fix and re-run tests.'
  const steps = result?.triage_meta?.fix_steps || []
  const stepComments = steps.slice(0, 3).map((s) => `# - ${s}`).join('\n')
  return [
    `# Suggested patch for ${fn} (${issue})`,
    `# File: ${file}`,
    `# Recommendation: ${recommendation}`,
    stepComments,
    '',
    '*** Begin Patch',
    `*** Update File: ${file}`,
    '@@',
    '-# TODO: existing buggy logic',
    '+# TODO: implement fix based on recommendation',
    '*** End Patch',
  ].filter(Boolean).join('\n')
}

function AgentCard({ name, status, Icon, blurb, currentActivity }) {
  return (
    <div
      className={`agent-card ${status}`}
      title={`${name}: ${blurb}${currentActivity ? `\nNow: ${currentActivity}` : ''}`}
    >
      <div className="agent-icon">
        {status === 'running' ? <span className="spinner" /> : <Icon size={16} />}
      </div>
      <span className="agent-name">{name}</span>
      <span className={`agent-badge ${status}`}>{status}</span>
      <span className="agent-hint">{currentActivity || blurb}</span>
      <div className="agent-tooltip">
        <div className="agent-tooltip-title">{name}</div>
        <div>{blurb}</div>
        {currentActivity && <div className="agent-tooltip-now">Now: {currentActivity}</div>}
      </div>
    </div>
  )
}

function LogFeed({ logs, title = 'Execution Logs', emptyText = 'Awaiting pipeline start…' }) {
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
        <span className="terminal-header-title">{title}</span>
        {logs.length > 0 && (
          <span className="spinner" style={{ marginLeft: 'auto', width: 8, height: 8 }} />
        )}
      </div>
      <div className="terminal-body" ref={ref}>
        {logs.length === 0 ? (
          <div style={{ color: 'var(--text-dim)', fontStyle: 'italic' }}>
            {emptyText}
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

function ProcessTracePanel({ primaryLogs, benchmarkLogs }) {
  const lastPrimary = primaryLogs.slice(-10)
  const lastBenchmark = benchmarkLogs.slice(-10)
  return (
    <div className="card mt-2">
      <div className="card-title">Complete Process Trace</div>
      <div className="two-col">
        <div>
          <div style={{ color: 'var(--gold)', fontSize: '0.8rem', marginBottom: '0.35rem' }}>Your Repository</div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)', lineHeight: 1.6 }}>
            {lastPrimary.length === 0 ? 'No events yet.' : lastPrimary.map((l, i) => (
              <div key={`p-trace-${i}`}>- {l.msg}</div>
            ))}
          </div>
        </div>
        <div>
          <div style={{ color: 'var(--info)', fontSize: '0.8rem', marginBottom: '0.35rem' }}>Benchmark Repository</div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)', lineHeight: 1.6 }}>
            {lastBenchmark.length === 0 ? 'No events yet.' : lastBenchmark.map((l, i) => (
              <div key={`b-trace-${i}`}>- {l.msg}</div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function PassFailReasonPanel({ report }) {
  if (!report) return null
  const results = report.test_results || []
  const failed = results.filter(r => r.failed || (r.errors ?? 0) > 0)
  const grouped = {}
  for (const r of failed) {
    const code = r?.triage_meta?.code || 'unknown'
    grouped[code] = (grouped[code] || 0) + 1
  }
  const entries = Object.entries(grouped).sort((a, b) => b[1] - a[1])
  return (
    <div className="card mt-2">
      <div className="card-title">Why Passing / Failing</div>
      <div style={{ color: 'var(--text-dim)', fontSize: '0.82rem', marginBottom: '0.65rem' }}>
        Passed tests indicate expected behavior matched assertions. Failed tests are grouped by detected root-cause code below.
      </div>
      {entries.length === 0 ? (
        <div style={{ color: 'var(--pass)', fontSize: '0.84rem' }}>
          All generated tests passed in this run; no failure reasons detected.
        </div>
      ) : (
        <table className="result-table">
          <thead>
            <tr>
              <th>Failure reason code</th>
              <th>Count</th>
              <th>Meaning</th>
            </tr>
          </thead>
          <tbody>
            {entries.map(([code, count]) => (
              <tr key={code}>
                <td>{code}</td>
                <td>{count}</td>
                <td>
                  {code === 'import_error' && 'Module/import path issue'}
                  {code === 'assertion_error' && 'Logic/output mismatch with expected behavior'}
                  {code === 'timeout' && 'Potential blocking code or infinite loop'}
                  {code === 'type_error' && 'Wrong argument types at runtime'}
                  {code === 'name_error' && 'Undefined symbol referenced'}
                  {code === 'execution_error' && 'Runtime execution/setup failure'}
                  {code === 'failed' && 'General test failure requiring code review'}
                  {!['import_error', 'assertion_error', 'timeout', 'type_error', 'name_error', 'execution_error', 'failed'].includes(code) && 'General/unknown reason'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function StatsPanel({ summary }) {
  const s = summary || {}
  const num = (v, fallback = null) => {
    const n = typeof v === 'number' ? v : Number(v)
    return Number.isFinite(n) ? n : fallback
  }
  const total = (s.passed || 0) + (s.failed || 0)
  const passRate = total ? ((s.passed / total) * 100).toFixed(1) : '0.0'
  const covPct = num(s.coverage_pct, -1)
  const cov = covPct >= 0 ? `${covPct}%` : 'n/a'
  const quality = s.quality_score_pct != null ? `${s.quality_score_pct}%` : 'n/a'
  const llmUtil = s.llm_utilization_pct != null ? `${s.llm_utilization_pct}%` : 'n/a'
  const mutPct = num(s.mutation_score_pct, -1)
  const mutScore = mutPct >= 0 ? `${mutPct}%` : 'n/a'
  const benchmark = s.benchmark || {}

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
        <div className="stat-card">
          <div className="stat-value">{quality}</div>
          <div className="stat-label">Quality</div>
        </div>
        <div className="stat-card info-color">
          <div className="stat-value" style={{ color: 'var(--info)' }}>{llmUtil}</div>
          <div className="stat-label">LLM Utilization</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{mutScore}</div>
          <div className="stat-label">Mutation Score</div>
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
            ['Coverage',     cov,             covPct >= 65 ? 'var(--pass)' : 'var(--warn)'],
            ['Quality Score', quality,         (s.quality_score_pct ?? 0) >= 70 ? 'var(--pass)' : 'var(--warn)'],
            ['LLM Utilization', llmUtil,      (s.llm_utilization_pct ?? 0) >= 60 ? 'var(--pass)' : 'var(--warn)'],
            ['Mutation Score', mutScore,      mutPct >= 55 ? 'var(--pass)' : 'var(--warn)'],
            ['Tests Run',    total,           'var(--text)'],
            ['Errors',       s.errors ?? 0,  (s.errors ?? 0) > 0 ? 'var(--fail)' : 'var(--pass)'],
          ].map(([label, val, col]) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.6rem' }}>
              <span style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>{label}</span>
              <span style={{ color: col, fontWeight: 700, fontSize: '0.9rem' }}>{val}</span>
            </div>
          ))}
          {(benchmark.pass_rate_target_pct != null || benchmark.coverage_target_pct != null) && (
            <div style={{ marginTop: '0.8rem', paddingTop: '0.8rem', borderTop: '1px solid var(--border)' }}>
              <div style={{ color: 'var(--text-dim)', fontSize: '0.78rem' }}>
                Benchmark targets:
                {benchmark.pass_rate_target_pct != null ? ` Pass ${benchmark.pass_rate_target_pct}%` : ''}
                {benchmark.coverage_target_pct != null ? ` | Coverage ${benchmark.coverage_target_pct}%` : ''}
              </div>
              <div style={{ color: 'var(--text-dim)', fontSize: '0.78rem', marginTop: '0.3rem' }}>
                LLM usage: {s.llm_tests_enhanced ?? 0}/{s.llm_tests_total ?? 0} enhanced
                {(s.llm_tests_failed ?? 0) > 0 ? ` | ${s.llm_tests_failed} LLM API fallbacks` : ''}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function PipelineExplainer() {
  return (
    <div className="card mt-2">
      <div className="card-title">How AgentQA Works</div>
      <div style={{ color: 'var(--text-dim)', fontSize: '0.86rem', lineHeight: 1.7 }}>
        AgentQA runs a 6-step QA pipeline: fetch repository, analyze code structure, write tests, execute them,
        triage failures, and generate reports. The LLM is used mainly in Test Writer to improve generated tests and in
        Triage as a fallback for deeper failure explanation when pattern rules are not enough.
      </div>
    </div>
  )
}

function LlmWalkthrough({ report }) {
  if (!report) return null
  const s = report.summary || {}
  const examples = (report.tests_metadata || []).filter(t => t.llm_error).slice(0, 2)
  const quotaLikely = (s.llm_tests_failed ?? 0) > 0 && /429|quota/i.test(s.llm_usage_reason || '')
  return (
    <div className="card mt-2">
      <div className="card-title">LLM Walkthrough (Gemini)</div>
      <div style={{ color: 'var(--text-dim)', fontSize: '0.86rem', lineHeight: 1.7 }}>
        <p>
          1) AgentQA reads <code>GEMINI_API_KEY</code> from backend environment and uses it only on server side.
        </p>
        <p>
          2) During <strong>Test Writer</strong>, each generated test can be sent to Gemini for stronger assertions.
        </p>
        <p>
          3) LLM utilization = <strong>enhanced tests / total tests</strong>.
        </p>
      </div>
      <div className="stats-grid mt-2">
        <div className="stat-card">
          <div className="stat-value">{s.gemini_configured ? 'Yes' : 'No'}</div>
          <div className="stat-label">Gemini Key Configured</div>
        </div>
        <div className="stat-card info-color">
          <div className="stat-value" style={{ color: 'var(--info)' }}>{s.llm_tests_attempted ?? 0}</div>
          <div className="stat-label">LLM Attempts</div>
        </div>
        <div className="stat-card pass-color">
          <div className="stat-value" style={{ color: 'var(--pass)' }}>{s.llm_tests_enhanced ?? 0}</div>
          <div className="stat-label">LLM Success</div>
        </div>
        <div className="stat-card fail-color">
          <div className="stat-value" style={{ color: 'var(--fail)' }}>{s.llm_tests_failed ?? 0}</div>
          <div className="stat-label">LLM Failed/Fallback</div>
        </div>
      </div>
      <p style={{ marginTop: '0.75rem', color: 'var(--text-dim)', fontSize: '0.82rem' }}>
        {s.llm_usage_reason || 'LLM usage details are not available for this run.'}
      </p>
      {quotaLikely && (
        <div className="error-banner mt-1" style={{ borderColor: 'var(--warn)', background: 'rgba(245,158,11,0.08)', color: 'var(--warn)' }}>
          <AlertTriangle size={16} />
          LLM Utilization is 0% because Gemini quota/rate-limit (HTTP 429) blocked enhancement calls, not because backend is disconnected.
        </div>
      )}
      {examples.length > 0 && (
        <div style={{ marginTop: '0.5rem', color: 'var(--text-dim)', fontSize: '0.78rem' }}>
          Example API error: {sanitizeLlmError(examples[0].llm_error)}
        </div>
      )}
    </div>
  )
}

function TestResultsTable({ results, jobId }) {
  const [expanded, setExpanded] = useState({})
  const [patches, setPatches] = useState({})
  if (!results || results.length === 0) return null

  const toggle = (i) => setExpanded(p => ({ ...p, [i]: !p[i] }))
  const generatePatch = async (i, r) => {
    const patch = buildPatchSuggestion(r)
    setPatches(prev => ({ ...prev, [i]: patch }))
    try { await navigator.clipboard.writeText(patch) } catch {}
  }

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
                    {r?.triage_meta?.fix_recommendation && (
                      <div style={{ marginTop: '0.35rem', fontSize: '0.76rem', color: 'var(--info)' }}>
                        Fix: {r.triage_meta.fix_recommendation}
                        {typeof r.triage_meta.reliability_score === 'number' ? ` (confidence ${r.triage_meta.reliability_score}%)` : ''}
                      </div>
                    )}
                    {(r.failed || (r.errors ?? 0) > 0) && (
                      <button
                        onClick={() => generatePatch(i, r)}
                        className="btn-outline"
                        style={{ marginTop: '0.45rem', padding: '0.22rem 0.55rem', fontSize: '0.72rem' }}
                        title="Generate a draft patch and copy to clipboard"
                      >
                        Generate Patch
                      </button>
                    )}
                    {patches[i] && (
                      <pre style={{ marginTop: '0.45rem', fontSize: '0.68rem', color: 'var(--text-dim)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'var(--font-mono)' }}>
                        {patches[i]}
                      </pre>
                    )}
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

function ComparePanel({ primaryReport, secondaryReport, secondaryUrl }) {
  if (!primaryReport || !secondaryReport) return null
  const a = primaryReport.summary || {}
  const b = secondaryReport.summary || {}
  const winner = (x, y, higherBetter = true) => {
    if (x == null || y == null) return '—'
    if (x === y) return 'Tie'
    return higherBetter ? (x > y ? 'Primary' : 'Compare') : (x < y ? 'Primary' : 'Compare')
  }
  const rows = [
    ['Pass Rate', `${a.pass_rate ?? 0}%`, `${b.pass_rate ?? 0}%`, winner(a.pass_rate, b.pass_rate, true)],
    ['Coverage', `${a.coverage_pct ?? 'n/a'}%`, `${b.coverage_pct ?? 'n/a'}%`, winner(a.coverage_pct, b.coverage_pct, true)],
    ['Mutation', a.mutation_score_pct >= 0 ? `${a.mutation_score_pct}%` : 'n/a', b.mutation_score_pct >= 0 ? `${b.mutation_score_pct}%` : 'n/a', winner(a.mutation_score_pct, b.mutation_score_pct, true)],
    ['LLM Utilization', `${a.llm_utilization_pct ?? 0}%`, `${b.llm_utilization_pct ?? 0}%`, winner(a.llm_utilization_pct, b.llm_utilization_pct, true)],
    ['Failed', `${a.failed ?? 0}`, `${b.failed ?? 0}`, winner(a.failed, b.failed, false)],
  ]
  return (
    <div className="card mt-2">
      <div className="card-title">Repository Comparison</div>
      <div style={{ color: 'var(--text-dim)', fontSize: '0.8rem', marginBottom: '0.75rem' }}>
        Side-by-side benchmark between your repository and a buggy comparison repository.
      </div>
      <div className="compare-head-grid">
        <div className="compare-head-card">
          <div className="compare-head-label">Primary Repository</div>
          <div className="compare-head-value">{primaryReport.repo}</div>
        </div>
        <div className="compare-head-card">
          <div className="compare-head-label">Comparison Repository</div>
          <div className="compare-head-value">{secondaryReport.repo || secondaryUrl}</div>
        </div>
      </div>
      <table className="result-table">
        <thead>
          <tr>
            <th>Metric</th>
            <th>Primary Repo</th>
            <th>Compare Repo</th>
            <th>Better</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, left, right, better]) => (
            <tr key={label}>
              <td>{label}</td>
              <td>{left}</td>
              <td>{right}</td>
              <td>{better}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ marginTop: '0.75rem', color: 'var(--text-dim)', fontSize: '0.78rem' }}>
        Benchmark rule: higher is better for Pass Rate, Coverage, Mutation, and LLM Utilization. Lower is better for Failed count.
      </div>
    </div>
  )
}

function PortalGuide() {
  return (
    <div className="card mt-2">
      <div className="card-title">Portal Walkthrough</div>
      <div className="guide-grid">
        <div className="guide-item">
          <div className="guide-title">1) Add repositories</div>
          <div className="guide-text">Put your repository in the first input and keep a buggy repository in compare input.</div>
        </div>
        <div className="guide-item">
          <div className="guide-title">2) Run Analyze & Compare</div>
          <div className="guide-text">The portal analyzes both repos and streams each stage in Pipeline Progress.</div>
        </div>
        <div className="guide-item">
          <div className="guide-title">3) Watch pipeline icons</div>
          <div className="guide-text">Hover icons to see what each stage does and what is currently happening.</div>
        </div>
        <div className="guide-item">
          <div className="guide-title">4) Read benchmark metrics</div>
          <div className="guide-text">Pass rate, coverage, mutation score, LLM utilization, and failure count are compared side by side.</div>
        </div>
      </div>
    </div>
  )
}

function MetricGuide() {
  const items = [
    ['Pass Rate', 'How many generated tests pass. Higher is better.'],
    ['Coverage', 'How much test code path is exercised. Higher is better.'],
    ['Mutation Score', 'How many injected code mutations are caught by tests. Higher means stronger tests.'],
    ['LLM Utilization', 'How many tests were successfully enhanced by LLM out of total generated tests.'],
    ['Quality Score', 'Weighted benchmark score from pass rate and coverage.'],
  ]
  return (
    <div className="card mt-2">
      <div className="card-title">Metric Explanations</div>
      <div className="guide-grid">
        {items.map(([name, desc]) => (
          <div key={name} className="guide-item">
            <div className="guide-title">{name}</div>
            <div className="guide-text">{desc}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function ShortfallPanel({ primaryReport, benchmarkReport }) {
  if (!primaryReport || !benchmarkReport) return null
  const u = primaryReport.summary || {}
  const b = benchmarkReport.summary || {}
  const checks = [
    ['Pass Rate', u.pass_rate ?? 0, b.pass_rate ?? 0, 'Increase correctness and edge-case handling in core functions.'],
    ['Coverage', u.coverage_pct ?? 0, b.coverage_pct ?? 0, 'Add tests for uncovered branches and error paths.'],
    ['Mutation Score', u.mutation_score_pct ?? -1, b.mutation_score_pct ?? -1, 'Add stronger assertions that fail when behavior changes.'],
    ['LLM Utilization', u.llm_utilization_pct ?? 0, b.llm_utilization_pct ?? 0, 'Resolve Gemini quota/config issues to improve LLM-enhanced tests.'],
  ]
  const shortfalls = checks.filter(([, uv, bv]) => uv >= 0 && bv >= 0 && uv < bv)

  return (
    <div className="card mt-2">
      <div className="card-title">Where Your Repo Falls Short</div>
      {shortfalls.length === 0 ? (
        <div style={{ color: 'var(--pass)', fontSize: '0.85rem' }}>
          Your repository is matching or exceeding the benchmark on available metrics.
        </div>
      ) : (
        shortfalls.map(([name, uv, bv, advice]) => (
          <div key={name} className="guide-item" style={{ marginBottom: '0.55rem' }}>
            <div className="guide-title">{name}: {uv}% vs benchmark {bv}%</div>
            <div className="guide-text">{advice}</div>
          </div>
        ))
      )}
    </div>
  )
}

function computeVerdict(primarySummary, benchmarkSummary) {
  const p = primarySummary || {}
  const b = benchmarkSummary || {}
  const safe = (v) => (typeof v === 'number' ? v : 0)
  const passDelta = safe(p.pass_rate) - safe(b.pass_rate)
  const covDelta = safe(p.coverage_pct) - safe(b.coverage_pct)
  const mutP = safe(p.mutation_score_pct) < 0 ? 0 : safe(p.mutation_score_pct)
  const mutB = safe(b.mutation_score_pct) < 0 ? 0 : safe(b.mutation_score_pct)
  const mutDelta = mutP - mutB
  const failDelta = safe(b.failed) - safe(p.failed) // lower failed is better

  const weighted =
    passDelta * 0.35 +
    covDelta * 0.30 +
    mutDelta * 0.25 +
    failDelta * 2.0

  if (weighted >= 12) return { label: 'Excellent', color: 'var(--pass)', note: 'Your repo clearly outperforms the benchmark.' }
  if (weighted >= 2) return { label: 'Good', color: 'var(--info)', note: 'Your repo is close to or better than benchmark overall.' }
  if (weighted >= -8) return { label: 'Needs Work', color: 'var(--warn)', note: 'Some core quality metrics are below benchmark.' }
  return { label: 'Critical Gap', color: 'var(--fail)', note: 'Large quality gaps vs benchmark; prioritize test strength and reliability.' }
}

function VerdictPanel({ primaryReport, benchmarkReport }) {
  if (!primaryReport || !benchmarkReport) return null
  const verdict = computeVerdict(primaryReport.summary, benchmarkReport.summary)
  return (
    <div className="card mt-2">
      <div className="card-title">Benchmark Verdict</div>
      <div className="verdict-row">
        <div className="verdict-badge" style={{ borderColor: `${verdict.color}66`, color: verdict.color }}>
          {verdict.label}
        </div>
        <div style={{ color: 'var(--text-dim)', fontSize: '0.84rem' }}>{verdict.note}</div>
      </div>
    </div>
  )
}

function BetterRepoWhyPanel({ primaryReport, benchmarkReport }) {
  if (!primaryReport || !benchmarkReport) return null
  const p = primaryReport.summary || {}
  const b = benchmarkReport.summary || {}
  const points = [
    {
      key: 'Pass Rate',
      better: (p.pass_rate ?? 0) >= (b.pass_rate ?? 0) ? 'Primary' : 'Benchmark',
      why: 'Higher pass rate indicates generated tests execute reliably.',
      values: `${p.pass_rate ?? 0}% vs ${b.pass_rate ?? 0}%`,
    },
    {
      key: 'Coverage',
      better: (p.coverage_pct ?? 0) >= (b.coverage_pct ?? 0) ? 'Primary' : 'Benchmark',
      why: 'Higher coverage suggests broader code path validation.',
      values: `${p.coverage_pct ?? 0}% vs ${b.coverage_pct ?? 0}%`,
    },
    {
      key: 'Mutation',
      better: (p.mutation_score_pct ?? -1) >= (b.mutation_score_pct ?? -1) ? 'Primary' : 'Benchmark',
      why: 'Higher mutation score means tests catch deeper behavioral changes.',
      values: `${p.mutation_score_pct ?? 'n/a'}% vs ${b.mutation_score_pct ?? 'n/a'}%`,
    },
    {
      key: 'Failures',
      better: (p.failed ?? 0) <= (b.failed ?? 0) ? 'Primary' : 'Benchmark',
      why: 'Lower failed count usually means more stable test execution.',
      values: `${p.failed ?? 0} vs ${b.failed ?? 0}`,
    },
  ]
  return (
    <div className="card mt-2">
      <div className="card-title">What Makes Better Repository</div>
      <div className="guide-grid">
        {points.map((pt) => (
          <div key={pt.key} className="guide-item">
            <div className="guide-title">{pt.key}: {pt.better} better</div>
            <div className="guide-text">{pt.values}</div>
            <div className="guide-text">{pt.why}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function LlmUsagePanel({ primaryReport, benchmarkReport }) {
  if (!primaryReport || !benchmarkReport) return null
  const ps = primaryReport.summary || {}
  const bs = benchmarkReport.summary || {}
  const item = (label, s) => ({
    label,
    configured: s.gemini_configured ? 'Yes' : 'No',
    attempted: s.llm_tests_attempted ?? 0,
    enhanced: s.llm_tests_enhanced ?? 0,
    failed: s.llm_tests_failed ?? 0,
    util: s.llm_utilization_pct ?? 0,
    reason: s.llm_usage_reason || 'No LLM note.',
  })
  const a = item('Primary Repo', ps)
  const b = item('Benchmark Repo', bs)
  return (
    <div className="card mt-2">
      <div className="card-title">Where LLM Is Used</div>
      <div style={{ color: 'var(--text-dim)', fontSize: '0.82rem', marginBottom: '0.65rem' }}>
        LLM is used in Test Writer (enhancing generated tests) and Triage fallback (explaining failures when needed).
      </div>
      <table className="result-table">
        <thead>
          <tr>
            <th>Repo</th>
            <th>Gemini Key</th>
            <th>Attempts</th>
            <th>Enhanced</th>
            <th>Failed</th>
            <th>Utilization</th>
          </tr>
        </thead>
        <tbody>
          {[a, b].map((x) => (
            <tr key={x.label}>
              <td>{x.label}</td>
              <td>{x.configured}</td>
              <td>{x.attempted}</td>
              <td>{x.enhanced}</td>
              <td>{x.failed}</td>
              <td>{x.util}%</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="guide-grid mt-1">
        <div className="guide-item">
          <div className="guide-title">Primary LLM Note</div>
          <div className="guide-text">{a.reason}</div>
        </div>
        <div className="guide-item">
          <div className="guide-title">Benchmark LLM Note</div>
          <div className="guide-text">{b.reason}</div>
        </div>
      </div>
    </div>
  )
}

function currentStageFromSteps(stepMap) {
  const running = AGENTS.find((a) => stepMap[a.name] === 'running')
  if (running) return running.name
  const lastDone = [...AGENTS].reverse().find((a) => stepMap[a.name] === 'done')
  return lastDone ? `${lastDone.name} done` : 'Waiting'
}

function progressPct(stepMap) {
  const done = AGENTS.filter((a) => stepMap[a.name] === 'done').length
  const running = AGENTS.filter((a) => stepMap[a.name] === 'running').length
  const pct = ((done + running * 0.5) / AGENTS.length) * 100
  return Math.max(0, Math.min(100, Math.round(pct)))
}

function LiveComparisonHeader({ loading, primarySteps, benchmarkSteps }) {
  const primaryPct = progressPct(primarySteps)
  const benchmarkPct = progressPct(benchmarkSteps)
  const avg = Math.round((primaryPct + benchmarkPct) / 2)
  return (
    <div className="card mt-2 compact-card">
      <div className="card-title">Live Comparison Dashboard</div>
      <div className="dashboard-head-grid">
        <div className="dashboard-head-item">
          <div className="dashboard-head-label">Your Repository</div>
          <div className="dashboard-head-meta">
            <span>{currentStageFromSteps(primarySteps)}</span>
            <strong>{primaryPct}%</strong>
          </div>
          <div className="progress-bar"><span style={{ width: `${primaryPct}%` }} /></div>
        </div>
        <div className="dashboard-head-item">
          <div className="dashboard-head-label">Benchmark Repository</div>
          <div className="dashboard-head-meta">
            <span>{currentStageFromSteps(benchmarkSteps)}</span>
            <strong>{benchmarkPct}%</strong>
          </div>
          <div className="progress-bar info"><span style={{ width: `${benchmarkPct}%` }} /></div>
        </div>
      </div>
      <div style={{ marginTop: '0.45rem', color: 'var(--text-dim)', fontSize: '0.78rem' }}>
        {loading ? `Running both pipelines in realtime. Combined progress ${avg}%.` : 'Ready for next analysis run.'}
      </div>
    </div>
  )
}

function stageStatusBadge(status) {
  const s = status || 'idle'
  return <span className={`badge ${s === 'done' ? 'pass' : s === 'running' ? 'warn' : s === 'error' ? 'fail' : ''}`}>{s.toUpperCase()}</span>
}

function PipelineMatrix({ primarySteps, benchmarkSteps, primaryLogs, benchmarkLogs }) {
  const latestPrimary = {}
  for (const log of primaryLogs) if (log?.step) latestPrimary[log.step] = log.msg
  const latestBenchmark = {}
  for (const log of benchmarkLogs) if (log?.step) latestBenchmark[log.step] = log.msg

  return (
    <div className="card section-gap mt-2 compact-card">
      <div className="card-title">Realtime Stage Matrix</div>
      <div style={{ overflowX: 'auto' }}>
        <table className="result-table compact-table">
          <thead>
            <tr>
              <th>Stage</th>
              <th>Your Repo</th>
              <th>Current Activity</th>
              <th>Benchmark Repo</th>
              <th>Current Activity</th>
            </tr>
          </thead>
          <tbody>
            {AGENTS.map((a) => (
              <tr key={`mx-${a.name}`}>
                <td style={{ minWidth: 120 }}>{a.name}</td>
                <td>{stageStatusBadge(primarySteps[a.name])}</td>
                <td className="table-ellipsis-cell" title={latestPrimary[a.name] || a.blurb}>{latestPrimary[a.name] || a.blurb}</td>
                <td>{stageStatusBadge(benchmarkSteps[a.name])}</td>
                <td className="table-ellipsis-cell" title={latestBenchmark[a.name] || a.blurb}>{latestBenchmark[a.name] || a.blurb}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function RuntimeStatusPanel({ summary }) {
  if (!summary) return null
  const runtime = summary.executor_runtime || 'local'
  const dockerOk = Boolean(summary.docker_available)
  const mutationOn = Boolean(summary.mutation_enabled)
  return (
    <div className="card mt-2 compact-card">
      <div className="card-title">Execution Environment Status</div>
      <div className="guide-grid">
        <div className="guide-item">
          <div className="guide-title">Executor Runtime</div>
          <div className="guide-text">
            Running in <strong>{runtime}</strong> mode.
          </div>
          <div className="guide-text">{summary.docker_reason || 'No Docker status details.'}</div>
        </div>
        <div className="guide-item">
          <div className="guide-title">Mutation Testing (mutmut)</div>
          <div className="guide-text">
            Status: <strong>{mutationOn ? 'Enabled' : 'Disabled'}</strong>
          </div>
          <div className="guide-text">{summary.mutation_reason || 'No mutation status details.'}</div>
        </div>
      </div>
      {!dockerOk && (
        <div className="error-banner mt-1" style={{ borderColor: 'var(--warn)', background: 'rgba(245,158,11,0.08)', color: 'var(--warn)' }}>
          <AlertTriangle size={16} />
          Docker is not active for this run, so tests executed locally.
        </div>
      )}
      {!mutationOn && (
        <div className="error-banner mt-1" style={{ borderColor: 'var(--warn)', background: 'rgba(245,158,11,0.08)', color: 'var(--warn)' }}>
          <AlertTriangle size={16} />
          Mutation score will remain n/a until mutation testing is enabled.
        </div>
      )}
    </div>
  )
}

function OverviewPanel({ report, compareReport }) {
  if (!report) return null
  return (
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
      <VerdictPanel primaryReport={report} benchmarkReport={compareReport} />
      <RuntimeStatusPanel summary={report.summary} />
      <ShortfallPanel primaryReport={report} benchmarkReport={compareReport} />
    </>
  )
}

export default function AnalysisPage() {
  const [url,     setUrl]     = useState('')
  const [loading, setLoading] = useState(false)
  const [steps,   setSteps]   = useState({})
  const [benchmarkSteps, setBenchmarkSteps] = useState({})
  const [logs,    setLogs]    = useState([])
  const [benchmarkLogs, setBenchmarkLogs] = useState([])
  const [report,  setReport]  = useState(null)
  const [compareReport, setCompareReport] = useState(null)
  const [jobId,   setJobId]   = useState(null)
  const [error,   setError]   = useState(null)
  const [activePanel, setActivePanel] = useState('overview')
  const esRef = useRef(null)
  const benchmarkEsRef = useRef(null)
  const runStateRef = useRef({ primaryDone: false, benchmarkDone: false })

  const isValid = isValidGitHubUrl(url)

  const resetState = () => {
    setSteps({});
    setBenchmarkSteps({});
    setLogs([]);
    setBenchmarkLogs([]);
    setReport(null);
    setCompareReport(null);
    setError(null);
    setJobId(null);
    setActivePanel('overview');
    if (esRef.current) { esRef.current.close(); esRef.current = null; }
    if (benchmarkEsRef.current) { benchmarkEsRef.current.close(); benchmarkEsRef.current = null; }
    runStateRef.current = { primaryDone: false, benchmarkDone: false }
  }

  const markDoneAndMaybeStop = useCallback((kind) => {
    runStateRef.current = {
      ...runStateRef.current,
      [kind]: true,
    }
    if (runStateRef.current.primaryDone && runStateRef.current.benchmarkDone) {
      setLoading(false)
      if (esRef.current) { esRef.current.close(); esRef.current = null }
      if (benchmarkEsRef.current) { benchmarkEsRef.current.close(); benchmarkEsRef.current = null }
    }
  }, [])

  const startLiveJob = useCallback(async (repoUrl, kind) => {
    const isPrimary = kind === 'primary'
    const res = await fetch(`${API_BASE}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ github_url: repoUrl.trim() }),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`)
    const jobData = await res.json()
    const id = jobData.job_id
    const es = new EventSource(`${API_BASE}/stream/${id}`)
    if (isPrimary) {
      setJobId(id)
      esRef.current = es
    } else {
      benchmarkEsRef.current = es
    }
    es.onmessage = (evt) => {
      let msg
      try { msg = JSON.parse(evt.data) } catch { return }
      if (msg.type === 'step') {
        if (isPrimary) setSteps(prev => ({ ...prev, [msg.data.step]: msg.data.status }))
        else setBenchmarkSteps(prev => ({ ...prev, [msg.data.step]: msg.data.status }))
      } else if (msg.type === 'log') {
        if (isPrimary) setLogs(prev => [...prev, msg.data])
        else setBenchmarkLogs(prev => [...prev, msg.data])
      } else if (msg.type === 'done') {
        if (isPrimary) setReport(msg.report)
        else setCompareReport(msg.report)
        es.close()
        markDoneAndMaybeStop(isPrimary ? 'primaryDone' : 'benchmarkDone')
      } else if (msg.type === 'error' || msg.error) {
        setError(msg.detail || msg.error || `Pipeline failed (${kind})`)
        es.close()
        markDoneAndMaybeStop(isPrimary ? 'primaryDone' : 'benchmarkDone')
      }
    }
    es.onerror = () => {
      setError(`Lost connection to server during ${kind} analysis`)
      es.close()
      markDoneAndMaybeStop(isPrimary ? 'primaryDone' : 'benchmarkDone')
    }
  }, [markDoneAndMaybeStop])

  const handleAnalyze = useCallback(async () => {
    if (!isValid || loading) return
    resetState()
    setLoading(true)
    try {
      setLogs(prev => [...prev, { id: `dual-${Date.now()}`, type: 'system', msg: 'Starting primary + benchmark in realtime...', step: 'GitHub Fetch', depth: 0 }])
      setBenchmarkLogs(prev => [...prev, { id: `bench-start-${Date.now()}`, type: 'system', msg: 'Benchmark stream started.', step: 'GitHub Fetch', depth: 0 }])
      await Promise.all([
        startLiveJob(url, 'primary'),
        startLiveJob(BENCHMARK_REPO, 'benchmark'),
      ])
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }, [isValid, loading, startLiveJob, url])

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
            {loading ? <><span className="spinner" style={{ marginRight: 6 }} />Analyzing…</> : 'Analyze vs Benchmark'}
          </button>
        </div>
        <div style={{ marginTop: '0.5rem', color: 'var(--text-dim)', fontSize: '0.78rem' }}>
          Fixed benchmark repository: <code>{BENCHMARK_REPO}</code>
        </div>
        <div className="sample-repo-row">
          {SAMPLE_REPOS.map((repo) => (
            <button
              key={repo.url}
              className="sample-repo-card"
              onClick={() => setUrl(repo.url)}
              disabled={loading}
              title={repo.url}
            >
              <div className="sample-repo-label">{repo.label}</div>
              <div className="sample-repo-desc">{repo.desc}</div>
              <div className="sample-repo-url">{repo.url}</div>
            </button>
          ))}
        </div>
        {url && !isValid && (
          <p style={{ marginTop: '0.5rem', fontSize: '0.78rem', color: 'var(--fail)' }}>
            ⚠ Use format: https://github.com/owner/repo
          </p>
        )}
      </div>

      <LiveComparisonHeader loading={loading} primarySteps={steps} benchmarkSteps={benchmarkSteps} />

      {/* Error */}
      {error && (
        <div className="error-banner mt-2">
          <XCircle size={16} /> {error}
        </div>
      )}

      {/* Pipeline progress */}
      {(loading || Object.keys(steps).length > 0 || Object.keys(benchmarkSteps).length > 0) && (
        <>
          <PipelineMatrix
            primarySteps={steps}
            benchmarkSteps={benchmarkSteps}
            primaryLogs={logs}
            benchmarkLogs={benchmarkLogs}
          />
          <div className="card section-gap mt-2 compact-card">
            <div className="card-title">Realtime Logs</div>
          <div className="two-col compact-grid">
            <LogFeed logs={logs} title="Your Repository Logs" />
            <LogFeed logs={benchmarkLogs} title="Benchmark Repository Logs" emptyText="Benchmark stream not started yet…" />
          </div>
          </div>
        </>
      )}
      {(logs.length > 0 || benchmarkLogs.length > 0) && (
        <ProcessTracePanel primaryLogs={logs} benchmarkLogs={benchmarkLogs} />
      )}

      {/* Results */}
      {report && (
        <>
          <div className="card mt-2 compact-card">
            <div className="panel-tabs">
              {[
                ['overview', 'Overview'],
                ['tests', 'Tests'],
                ['reasons', 'Pass/Fail Reasons'],
                ['compare', 'Comparison'],
                ['llm', 'LLM'],
                ['guide', 'Guide'],
              ].map(([key, label]) => (
                <button
                  key={key}
                  className={`panel-tab ${activePanel === key ? 'active' : ''}`}
                  onClick={() => setActivePanel(key)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          {activePanel === 'overview' && (
            <OverviewPanel report={report} compareReport={compareReport} />
          )}
          {activePanel === 'tests' && (
            <TestResultsTable results={report.test_results} jobId={jobId} />
          )}
          {activePanel === 'reasons' && (
            <PassFailReasonPanel report={report} />
          )}
          {activePanel === 'compare' && (
            <>
              <ComparePanel primaryReport={report} secondaryReport={compareReport} secondaryUrl={BENCHMARK_REPO} />
              <BetterRepoWhyPanel primaryReport={report} benchmarkReport={compareReport} />
            </>
          )}
          {activePanel === 'llm' && (
            <>
              <LlmWalkthrough report={report} />
              <LlmUsagePanel primaryReport={report} benchmarkReport={compareReport} />
            </>
          )}
          {activePanel === 'guide' && (
            <>
              <PipelineExplainer />
              <PortalGuide />
              <MetricGuide />
            </>
          )}
        </>
      )}
    </div>
  )
}
