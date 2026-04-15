// Final analysis report display

export default function ReportView({ report, jobId }) {
  if (!report) return null

  const s = report.summary || {}
  const results = report.test_results || []

  const handleDownload = () => {
    window.open(`/report/${jobId}/pdf`, '_blank')
  }
  const handleDownloadJson = () => {
    window.open(`/report/${jobId}/json`, '_blank')
  }

  return (
    <div className="card">
      <p className="card-title">Final Report — {report.repo || 'unknown'}</p>

      <div className="report-summary-grid">
        <div className="stat-box">
          <div className="stat-val">{s.files_analyzed ?? 0}</div>
          <div className="stat-label">Files</div>
        </div>
        
        <div className="stat-box">
          <div className="stat-val">{s.tests_generated ?? 0}</div>
          <div className="stat-label">Tests</div>
        </div>
        
        {/* 
          Passed tests box with green styling
          Shows number of tests that passed
        */}
        <div className="stat-box green">
          <div className="stat-val">{s.passed ?? 0}</div>
          <div className="stat-label">Passed</div>
        </div>
        
        {/* 
          Failed tests box with red styling
          Shows number of tests that failed
        */}
        <div className="stat-box red">
          <div className="stat-val">{s.failed ?? 0}</div>
          <div className="stat-label">Failed</div>
        </div>
        
        {/* 
          Errors box with yellow/warning styling
          Shows number of test execution errors
        */}
        <div className="stat-box yellow">
          <div className="stat-val">{s.errors ?? 0}</div>
          <div className="stat-label">Errors</div>
        </div>
      </div>
      {s.time_comparison && (
        <div style={{ marginTop: '1.5rem', marginBottom: '1.5rem', background: 'var(--bg-card)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border)' }}>
          <h4 style={{ marginBottom: '0.8rem', color: 'var(--text-primary)' }}>LLM Utilization & QA Comparison</h4>
          
          <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
            <div>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Estimated Manual Process:</span>
              <div style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>{s.time_comparison.manual_estimated_mins} mins</div>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Automated AgentQA Process:</span>
              <div style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>{s.time_comparison.agent_measured_mins ?? '—'} mins</div>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Total Time Saved:</span>
              <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--text-success)' }}>{s.time_comparison.time_saved_mins} mins</div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
            <div><strong style={{ color: 'var(--text-primary)' }}>🤖 LLM (Gemini):</strong> {s.llm_utilization?.test_generation} | {s.llm_utilization?.triage}</div>
            <div><strong style={{ color: 'var(--text-primary)' }}>🐳 Docker:</strong> {s.docker_available ? 'Enabled (Isolated test execution)' : `Disabled (${s.docker_reason || 'N/A'})`}</div>
            <div><strong style={{ color: 'var(--text-primary)' }}>👾 Mutmut (Mutation Testing):</strong> {s.mutation_enabled ? 'Enabled (Robustness checks active)' : `Disabled (${s.mutation_reason || 'N/A'})`}</div>
          </div>

          {s.execution_time?.per_agent_seconds && (
            <div style={{ marginTop: '1rem', borderTop: '1px solid var(--border)', paddingTop: '0.85rem' }}>
              <div style={{ color: 'var(--text-primary)', fontWeight: 700, marginBottom: '0.5rem' }}>
                Execution time by agent
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.86rem', color: 'var(--text-dim)' }}>
                {Object.entries(s.execution_time.per_agent_seconds).map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>{k}</span>
                    <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{typeof v === 'number' ? `${v.toFixed(2)}s` : '—'}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                  <span>Total</span>
                  <span style={{ fontWeight: 800, color: 'var(--gold)' }}>
                    {typeof s.execution_time.total_seconds === 'number' ? `${s.execution_time.total_seconds.toFixed(2)}s` : '—'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {s.time_comparison?.manual_breakdown_mins && (
            <div style={{ marginTop: '1rem', borderTop: '1px solid var(--border)', paddingTop: '0.85rem' }}>
              <div style={{ color: 'var(--text-primary)', fontWeight: 700, marginBottom: '0.5rem' }}>
                Manual-equivalent time breakdown (est.)
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.86rem', color: 'var(--text-dim)' }}>
                {Object.entries(s.time_comparison.manual_breakdown_mins).map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>{k.replace(/_/g, ' ')}</span>
                    <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{typeof v === 'number' ? `${v} min` : '—'}</span>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 6, fontSize: '0.78rem', color: 'var(--text-dim)' }}>
                Assumptions: {s.time_comparison?.assumptions ? Object.entries(s.time_comparison.assumptions).map(([k, v]) => `${k}=${v}`).join(', ') : '—'}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 
        Detailed test results table
        Only show if there are test results to display
      */}
      {results.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table className="result-table">
            <thead>
              <tr>
                <th>Function</th>
                <th>File</th>
                <th>Status</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r, i) => {
                // Determine if test passed or failed
                const passed = r.passed && !r.failed
                
                return (
                  <tr key={i}>
                    {/* Function name being tested */}
                    <td>{r.function || '—'}</td>
                    
                    {/* Source file path (dimmed) */}
                    <td style={{ color: 'var(--text-muted)' }}>
                      {r.target_file || '—'}
                    </td>
                    
                    {/* 
                      Status badge
                      Color-coded: green for PASS, red for FAIL
                    */}
                    <td>
                      <span className={`badge ${passed ? 'pass' : 'fail'}`}>
                        {passed ? 'PASS' : 'FAIL'}
                      </span>
                    </td>
                    
                    {/* 
                      Triage notes
                      Human-readable explanation of test outcome
                      Generated by Triage agent (e.g., "Assertion failed...")
                    */}
                    <td className="triage-note">{r.triage || ''}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 
        Download PDF button
        Triggers download of the full PDF report
      */}
      <button
        id="download-report-btn"
        className="btn dl-btn"
        onClick={handleDownload}
        title="Download PDF report"
      >
        ↓ Download PDF Report
      </button>

      <button
        className="btn-outline mt-2"
        onClick={handleDownloadJson}
        title="Download JSON report"
      >
        Download JSON Report
      </button>

      {/* 
        Generation timestamp
        Shows when the report was created (in local time)
      */}
      <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
        Generated at {report.generated_at ? new Date(report.generated_at).toLocaleString() : '—'}
      </p>
    </div>
  )
}
