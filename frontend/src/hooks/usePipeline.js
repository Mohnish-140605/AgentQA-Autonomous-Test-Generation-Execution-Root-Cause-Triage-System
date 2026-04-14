import { useState, useRef, useCallback } from 'react';

const API_BASE = import.meta.env.VITE_API_BASE?.trim() || '';
const AGENT_ORDER = [
  'GitHub Fetch',
  'Code Analyst',
  'Test Writer',
  'Executor',
  'Triage',
  'Reporter'
];

export function usePipeline() {
  const [url, setUrl] = useState('');
  const [pipelineState, setPipelineState] = useState('idle'); // idle, running, success, error
  const [steps, setSteps] = useState(
    AGENT_ORDER.map(name => ({ step: name, status: 'idle', detail: '' }))
  );
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState({ files: 0, tests: 0, passed: 0, failed: 0, errors: 0 });
  const [jobId, setJobId] = useState(null);
  
  const esRef = useRef(null);

  const addLog = (msg, type = 'info') => {
    setLogs(prev => [...prev, { id: Date.now() + Math.random(), msg, type }]);
  };

  const reset = () => {
    setPipelineState('idle');
    setSteps(AGENT_ORDER.map(name => ({ step: name, status: 'idle', detail: '' })));
    setLogs([]);
    setStats({ files: 0, tests: 0, passed: 0, failed: 0, errors: 0 });
    setJobId(null);
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
  };

  const startPipeline = useCallback(async () => {
    if (!url.trim() || pipelineState === 'running') return;
    
    reset();
    setPipelineState('running');
    addLog(`Initializing analysis engine for ${url}...`, 'system');

    let jobData;
    try {
      const res = await fetch(`${API_BASE}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ github_url: url.trim() }),
      });
      
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Server error ${res.status}: ${txt}`);
      }
      jobData = await res.json();
    } catch (err) {
      setPipelineState('error');
      addLog(`Failed to start: ${err.message}`, 'error');
      return;
    }

    const id = jobData.job_id;
    setJobId(id);
    addLog(`Connection established. Job ID: ${id}`, 'system');

    const es = new EventSource(`${API_BASE}/stream/${id}`);
    esRef.current = es;

    es.onmessage = (evt) => {
      let msg;
      try {
        msg = JSON.parse(evt.data);
      } catch {
        return;
      }

      if (msg.type === 'step') {
        const currentPhaseName = msg.data.step;
        const currentStatus = msg.data.status;
        
        setSteps(prev => prev.map(s => {
          if (s.step === currentPhaseName) {
            return { ...s, ...msg.data };
          }
           // Auto-mark previous steps as done if we moved past them
          const currentIndex = AGENT_ORDER.indexOf(currentPhaseName);
          const sIndex = AGENT_ORDER.indexOf(s.step);
          if (sIndex < currentIndex && s.status !== 'error') {
            return { ...s, status: 'done' };
          }
          return s;
        }));

        if (currentStatus === 'running') {
           addLog(`[${currentPhaseName}] Initiating sequence...`, 'info');
        } else if (currentStatus === 'done') {
           addLog(`[${currentPhaseName}] Sequence complete.`, 'success');
        } else if (currentStatus === 'error') {
           addLog(`[${currentPhaseName}] ERR: ${msg.data.detail}`, 'error');
        }
      }
      else if (msg.type === 'done') {
        setPipelineState('success');
        
        // Wait briefly to show 'All modules completed', then show metrics
        setTimeout(() => addLog('All pipeline modules completed. Generating visuals.', 'success'), 500);
        
        const summary = msg.report?.summary || {};
        setStats({
          files: summary.files_analyzed || 0,
          tests: summary.tests_generated || 0,
          passed: summary.passed || 0,
          failed: summary.failed || 0,
          errors: summary.errors || 0
        });

        es.close();
        esRef.current = null;
      }
      else if (msg.type === 'error' || msg.error) {
        setPipelineState('error');
        addLog(`Pipeline Terminated: ${msg.error || msg.detail}`, 'error');
        
        setSteps(prev => prev.map(s => s.status === 'running' ? { ...s, status: 'error', detail: msg.error || msg.detail } : s));

        es.close();
        esRef.current = null;
      }
    };

    es.onerror = () => {
      if (esRef.current) { // if not already closed heavily
        setPipelineState('error');
        addLog('Lost connection to orchestration server.', 'error');
        es.close();
        esRef.current = null;
      }
    };
  }, [url, pipelineState]);

  return {
    url,
    setUrl,
    startPipeline,
    pipelineState,
    steps,
    logs,
    stats,
    jobId
  };
}
