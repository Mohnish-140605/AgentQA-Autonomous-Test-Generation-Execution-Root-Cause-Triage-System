import { useState, useRef, useCallback, useEffect } from 'react';

const API_BASE = import.meta.env.VITE_API_BASE?.trim() || '';
const AGENT_ORDER = [
  'GitHub Fetch',
  'Code Analyst',
  'Test Writer',
  'Executor',
  'Triage',
  'Reporter'
];

export function useExecutionEngine() {
  const [url, setUrl] = useState('');

  // LIVE STATE
  const [pipelineState, setPipelineState] = useState('idle');
  const [steps, setSteps] = useState(
    AGENT_ORDER.map(name => ({ step: name, status: 'idle', detail: '' }))
  );
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState({ files: 0, tests: 0, passed: 0, failed: 0, errors: 0 });
  const [jobId, setJobId] = useState(null);
  const [activeThought, setActiveThought] = useState('System Standby');

  // TIMELINE STATE
  const [history, setHistory] = useState([]);
  const [scrubberIndex, setScrubberIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);

  // BACKEND REFS
  const esRef = useRef(null);
  const eventQueue = useRef([]);
  const processorInterval = useRef(null);
  // Set to true the moment the server sends 'done' on the wire (before queue processes it)
  // This prevents onerror from firing a false "lost connection" when SSE stream closes after success
  const receivedDoneRef = useRef(false);

  // Keep a ref to pipelineState so onerror handler can read current value without stale closures
  const pipelineStateRef = useRef('idle');
  useEffect(() => {
    pipelineStateRef.current = pipelineState;
  }, [pipelineState]);

  // CURRENT EFFECTIVE STATE (for timeline replay)
  const isHistoryMode = scrubberIndex !== -1;
  const currentSnapshot = isHistoryMode && history[scrubberIndex] ? history[scrubberIndex] : null;

  const displayState = currentSnapshot ? currentSnapshot.pipelineState : pipelineState;
  const displaySteps = currentSnapshot ? currentSnapshot.steps : steps;
  const displayLogs = currentSnapshot ? currentSnapshot.logs : logs;
  const displayStats = currentSnapshot ? currentSnapshot.stats : stats;
  const displayThought = currentSnapshot ? currentSnapshot.activeThought : activeThought;

  // Record history snapshots whenever any live state mutates
  useEffect(() => {
    if (pipelineState !== 'idle' || logs.length > 0) {
      setHistory(prev => [...prev, {
        pipelineState, steps, logs, stats, activeThought, time: Date.now()
      }]);
    }
  }, [pipelineState, steps, logs, stats, activeThought]); // eslint-disable-line

  // Event Queue Processor — cinematic stagger
  useEffect(() => {
    processorInterval.current = setInterval(() => {
      if (eventQueue.current.length > 0) {
        const evt = eventQueue.current.shift();
        applyEvent(evt);
      }
    }, 400);

    return () => clearInterval(processorInterval.current);
  }, []); // eslint-disable-line

  const addLog = (msg, type = 'info', depth = 0) => {
    setLogs(prev => [...prev, { id: Date.now() + Math.random(), msg, type, depth }]);
  };

  const applyEvent = (msg) => {
    if (msg.type === 'internal_log') {
      addLog(msg.data.text, msg.data.logType, msg.data.depth);
      return;
    }

    if (msg.type === 'step') {
      const currentPhaseName = msg.data.step;
      const currentStatus = msg.data.status;

      setSteps(prev => prev.map(s => {
        if (s.step === currentPhaseName) return { ...s, ...msg.data };
        const currentIndex = AGENT_ORDER.indexOf(currentPhaseName);
        const sIndex = AGENT_ORDER.indexOf(s.step);
        if (sIndex < currentIndex && s.status !== 'error') return { ...s, status: 'done' };
        return s;
      }));

      if (currentStatus === 'running') {
        setActiveThought(`[${currentPhaseName}] analysis pathways active...`);
        addLog(`[${currentPhaseName}] initiated`, 'system', 0);
        addLog(`Allocating compute resources`, 'info', 1);
      } else if (currentStatus === 'done') {
        setActiveThought(`[${currentPhaseName}] complete — handing off to next agent`);
        addLog(`[${currentPhaseName}] ✓ complete`, 'success', 0);
      } else if (currentStatus === 'error') {
        setActiveThought(`CRITICAL FAILURE in [${currentPhaseName}]`);
        addLog(`[${currentPhaseName}] ✗ ${msg.data.detail || 'unknown error'}`, 'error', 0);
      }
    }
    else if (msg.type === 'done') {
      setPipelineState('success');
      setActiveThought('All agents complete — pipeline finished successfully');
      addLog('═══ Pipeline execution complete ═══', 'success', 0);

      // Close the SSE connection cleanly
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }

      const summary = msg.report?.summary || {};
      setStats({
        files: summary.files_analyzed || 0,
        tests: summary.tests_generated || 0,
        passed: summary.passed || 0,
        failed: summary.failed || 0,
        errors: summary.errors || 0
      });
    }
    else if (msg.type === 'error' || msg.error) {
      setPipelineState('error');
      setActiveThought('SYSTEM HALTED — pipeline error detected');
      addLog(`✗ ${msg.error || msg.detail || 'Unknown pipeline failure'}`, 'error', 0);
      setSteps(prev => prev.map(s =>
        s.status === 'running' ? { ...s, status: 'error', detail: msg.error || msg.detail } : s
      ));
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
    }
  };

  const reset = useCallback(() => {
    setPipelineState('idle');
    setSteps(AGENT_ORDER.map(name => ({ step: name, status: 'idle', detail: '' })));
    setLogs([]);
    setStats({ files: 0, tests: 0, passed: 0, failed: 0, errors: 0 });
    setJobId(null);
    setHistory([]);
    setScrubberIndex(-1);
    setIsPlaying(false);
    setActiveThought('System Standby');
    eventQueue.current = [];
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
  }, []);

  const startPipeline = useCallback(async () => {
    if (!url.trim() || pipelineStateRef.current === 'running') return;

    reset();
    // Need a tick for reset state to propagate before we start
    await new Promise(r => setTimeout(r, 50));

    receivedDoneRef.current = false;
    setPipelineState('running');
    setActiveThought(`Connecting to analysis cluster...`);
    eventQueue.current.push({ type: 'internal_log', data: { text: `Initializing worker pipeline...`, logType: 'system', depth: 0 } });
    eventQueue.current.push({ type: 'internal_log', data: { text: `Resolving target: ${url.trim()}`, logType: 'info', depth: 1 } });

    let jobData;
    try {
      const res = await fetch(`${API_BASE}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ github_url: url.trim() }),
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Server responded ${res.status}: ${errText}`);
      }
      jobData = await res.json();
    } catch (err) {
      eventQueue.current.push({ type: 'error', error: err.message });
      return;
    }

    const id = jobData.job_id;
    setJobId(id);
    eventQueue.current.push({ type: 'internal_log', data: { text: `Job ID: ${id}`, logType: 'success', depth: 0 } });
    eventQueue.current.push({ type: 'internal_log', data: { text: `Establishing SSE stream...`, logType: 'info', depth: 1 } });

    const es = new EventSource(`${API_BASE}/stream/${id}`);
    esRef.current = es;

    es.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        // Mark done immediately on wire receipt — before the queue processes it
        if (msg.type === 'done') {
          receivedDoneRef.current = true;
        }
        eventQueue.current.push(msg);
      } catch { return; }
    };

    es.onerror = () => {
      // onerror fires when the SSE stream closes — even on a clean server-side close after 'done'.
      // We check receivedDoneRef (set on wire, before queue processing) to detect this case.
      const alreadyDone = receivedDoneRef.current;
      const currentState = pipelineStateRef.current;
      if (!alreadyDone && currentState === 'running') {
        // Genuine mid-stream drop
        eventQueue.current.push({ type: 'error', error: 'Stream connection lost unexpectedly.' });
      }
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
    };
  }, [url, reset]);

  return {
    url,
    setUrl,
    startPipeline,
    reset,

    // UI Binds
    pipelineState: displayState,
    steps: displaySteps,
    logs: displayLogs,
    stats: displayStats,
    activeThought: displayThought,
    jobId,

    // Timeline Data
    history,
    scrubberIndex,
    setScrubberIndex,
    isPlaying,
    setIsPlaying
  };
}
