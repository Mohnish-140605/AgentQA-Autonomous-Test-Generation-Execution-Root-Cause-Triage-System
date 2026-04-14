// Input panel for entering GitHub repository URL

function isValidGitHubUrl(url) {
  if (!url.trim()) return false
  const patterns = [
    /^https?:\/\/github\.com\/[\w-]+\/[\w.\-]+\/?$/i,
    /^git@github\.com:[\w-]+\/[\w.\-]+\.git\/?$/i,
    /^github\.com\/[\w-]+\/[\w.\-]+\/?$/i,
  ]
  return patterns.some(p => p.test(url.trim()))
}

export default function InputPanel({ url, setUrl, onStart, loading }) {
  const handleKey = (e) => {
    if (e.key === 'Enter' && !loading && isValidGitHubUrl(url)) onStart()
  }

  const isValid = isValidGitHubUrl(url)

  return (
    <div className="card">
      <p className="card-title">Repository URL</p>
      
      <div className="input-row">
        <input
          id="github-url-input"
          type="text"
          placeholder="https://github.com/owner/repo"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={handleKey}
          disabled={loading}
          spellCheck={false}
          autoComplete="off"
          style={url.trim() && !isValid ? { borderColor: '#ff4444' } : {}}
        />
        
        <button
          id="start-btn"
          className="btn"
          onClick={onStart}
          disabled={loading || !isValid}
          title={!isValid && url.trim() ? 'Invalid GitHub URL format' : ''}
        >
          {loading ? 'Analyzing…' : 'Analyze'}
        </button>
      </div>
      <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
        Works with any public GitHub Python repository. Add a GITHUB_TOKEN in your .env for rate-limit relief.
      </p>
      {url.trim() && !isValid && (
        <p style={{ fontSize: '0.72rem', color: '#ff8844', marginTop: '0.25rem' }}>
          ⚠ Invalid GitHub URL. Use format: https://github.com/owner/repo
        </p>
      )}
    </div>
  )
}
