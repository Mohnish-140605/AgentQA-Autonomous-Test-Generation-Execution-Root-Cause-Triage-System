// Progress display for analysis pipeline

const AGENT_ORDER = [
  'GitHub Fetch',
  'Code Analyst',
  'Test Writer',
  'Executor',
  'Triage',
  'Reporter',
]

function StepIcon({ status }) {
  if (status === 'done')
    return <span className="step-icon done">✓</span>
  if (status === 'running')
    return <span className="step-icon running"><span className="spinner" /></span>
  if (status === 'error')
    return <span className="step-icon error">✗</span>
  return <span className="step-icon pending">·</span>
}

export default function ProgressPanel({ steps, isRunning }) {
  const stepMap = {}
  for (const s of steps) stepMap[s.step] = s

  /**
   * Create display steps by merging expected order with actual data
   * This ensures:
   * 1. Steps display in correct order
   * 2. Completed steps show their status
   * 3. Pending steps are visually grayed out
   */
  const displaySteps = AGENT_ORDER.map((name) => ({
    step: name,
    status: stepMap[name]?.status ?? 'pending',  // Default to 'pending' if not found
    detail: stepMap[name]?.detail ?? '',          // Error/detail message if available
  }))

  // ────────────────────────────────────────────────────────────────────
  // EMPTY STATE: Show placeholder message if no analysis has started
  // ────────────────────────────────────────────────────────────────────
  if (!isRunning && steps.length === 0) {
    return (
      <div className="card">
        <p className="card-title">Pipeline Progress</p>
        <div className="empty-state">Enter a GitHub URL and click Analyze to start.</div>
      </div>
    )
  }

  // ────────────────────────────────────────────────────────────────────
  // RENDER: Display progress for all pipeline steps
  // ────────────────────────────────────────────────────────────────────
  return (
    <div className="card">
      <p className="card-title">Pipeline Progress</p>
      <ul className="step-list">
        {displaySteps.map((s) => (
          // Each step in the pipeline
          <li key={s.step} className="step-item">
            {/* 
              Status icon (✓, •, ✗, or ·)
              Updates in real-time as pipeline progresses
            */}
            <StepIcon status={s.status} />
            
            {/* Step name and detail info */}
            <div>
              {/* Step name (e.g., "Code Analyst") */}
              <div className="step-name">{s.step}</div>
              {/* 
                Optional: Show error detail if step failed
                e.g., "Timeout after 30s"
              */}
              {s.detail && <div className="step-detail">{s.detail}</div>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
