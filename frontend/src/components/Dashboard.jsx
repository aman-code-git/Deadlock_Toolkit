import React, { useState, useCallback } from 'react';
import SimulationPanel from './SimulationPanel';
import StateTable from './StateTable';
import ResourceGraph from './ResourceGraph';
import EventLog from './EventLog';
import StatusBanner from './StatusBanner';
import { checkSafety, detectDeadlock, recoverDeadlock, resetSystem, assignFreeResource } from '../api/deadlock';

function timestamp() {
  return new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export default function Dashboard() {
  const [systemState, setSystemState] = useState(null);
  const [safetyResult, setSafetyResult] = useState(null);
  const [deadlockResult, setDeadlockResult] = useState(null);
  const [status, setStatus] = useState('idle');
  const [statusMsg, setStatusMsg] = useState('');
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('graph');   // 'graph' | 'table' | 'steps'
  const [safeSteps, setSafeSteps] = useState([]);

  const log = useCallback((type, message) => {
    setEvents(prev => [...prev, { type, message, time: timestamp() }]);
  }, []);

  const handleInit = useCallback((state) => {
    setSystemState(state);
    setSafetyResult(null);
    setDeadlockResult(null);
    setStatus('idle');
    setStatusMsg('System initialized. Run detection or safety check.');
    setSafeSteps([]);
  }, []);

  const handleCheckSafety = async () => {
    if (!systemState) return;
    setLoading(true);
    try {
      const res = await checkSafety();
      setSafetyResult(res.data);
      setSafeSteps(res.data.work_steps || []);
      if (res.data.is_safe) {
        setStatus('safe');
        setStatusMsg(res.data.message);
        log('safety', `✅ SAFE — sequence: ${res.data.safe_sequence.map(i => `P${i}`).join(' → ')}`);
      } else {
        setStatus('unsafe');
        setStatusMsg(res.data.message);
        log('safety', `⚠ UNSAFE — ${res.data.message}`);
      }
    } catch (e) {
      log('error', e.response?.data?.detail || 'Safety check failed');
    }
    setLoading(false);
  };

  const handleDetectDeadlock = async () => {
    if (!systemState) return;
    setLoading(true);
    try {
      const res = await detectDeadlock();
      setDeadlockResult(res.data);
      if (res.data.has_deadlock) {
        setStatus('deadlock');
        setStatusMsg(res.data.message);
        log('deadlock', `💀 DEADLOCK: ${res.data.deadlocked_process_names.join(', ')} are deadlocked.`);
      } else {
        setStatus('safe');
        setStatusMsg(res.data.message);
        log('deadlock', '✅ No deadlock detected.');
      }
    } catch (e) {
      log('error', e.response?.data?.detail || 'Detection failed');
    }
    setLoading(false);
  };

  const handleRecover = async () => {
    if (!systemState) return;
    setLoading(true);
    try {
      const res = await recoverDeadlock();
      setSystemState(res.data.new_state);
      setDeadlockResult(null);
      setSafetyResult(res.data.final_check);
      setStatus('recovered');
      setStatusMsg(`Recovered! Terminated: ${res.data.terminated_process_names.join(', ')}`);
      res.data.steps.forEach(s => log('recovery', s));
      log('recovery', `✅ System recovered. ${res.data.final_check?.message || ''}`);
    } catch (e) {
      log('error', e.response?.data?.detail || 'Recovery failed');
    }
    setLoading(false);
  };

  const handleAssignFree = async () => {
    if (!systemState) return;
    setLoading(true);
    try {
      const res = await assignFreeResource();
      if (res.data.assigned) {
        setSystemState(res.data.new_state);
        log('request', `✅ ${res.data.message}`);
        // After assigning, re-run deadlock detection automatically
        const dlRes = await detectDeadlock();
        setDeadlockResult(dlRes.data);
        if (dlRes.data.has_deadlock) {
          setStatus('deadlock');
          setStatusMsg("Deadlock still persists after assignment.");
        } else {
          setStatus('safe');
          setStatusMsg(dlRes.data.message);
          log('deadlock', '✅ No deadlock detected after assignment.');
        }
      } else {
         log('error', res.data.message);
      }
    } catch (e) {
      log('error', e.response?.data?.detail || 'Assignment failed');
    }
    setLoading(false);
  };

  const handleReset = async () => {
    try {
      await resetSystem();
      setSystemState(null);
      setSafetyResult(null);
      setDeadlockResult(null);
      setStatus('idle');
      setStatusMsg('');
      setSafeSteps([]);
      log('reset', 'System reset. Ready for new simulation.');
    } catch (e) {
      log('error', 'Reset failed');
    }
  };

  const hasDeadlock = deadlockResult?.has_deadlock;
  const canAssignFree = hasDeadlock && systemState?.available.some((avail, j) => 
    avail > 0 && deadlockResult.deadlocked_processes.some(i => systemState.need[i][j] > 0)
  );

  return (
    <div style={{
      minHeight: '100vh',
      display: 'grid',
      gridTemplateRows: 'auto 1fr',
      overflow: 'hidden',
    }}>
      {/* ── Header ─────────────────────────────── */}
      <header style={{
        padding: '18px 28px',
        borderBottom: '1px solid var(--border)',
        background: 'rgba(8,15,9,0.85)',
        backdropFilter: 'blur(16px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 100,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 42, height: 42, borderRadius: 11,
            background: 'linear-gradient(135deg, var(--accent-dark), var(--accent-mid))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1.4rem', boxShadow: '0 0 18px rgba(28, 40, 73,0.5)',
          }}>🔒</div>
          <div>
            <h1 style={{ fontSize: '1.1rem', fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--cream)' }}>
              Deadlock Prevention &amp; Recovery Toolkit
            </h1>
            <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 1 }}>
              Banker's Algorithm · RAG Detection · Real-time Recovery
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button className="btn btn-ghost" onClick={handleCheckSafety} disabled={!systemState || loading}
            data-tooltip="Run Banker's safety algorithm">
            🔍 Check Safety
          </button>
          <button className="btn btn-primary" onClick={handleDetectDeadlock} disabled={!systemState || loading}
            data-tooltip="Detect deadlock via RAG analysis">
            {loading ? <span className="spinner" /> : '🕵'} Detect Deadlock
          </button>
          {hasDeadlock && canAssignFree && (
            <button className="btn btn-warn" onClick={handleAssignFree} disabled={loading}
              data-tooltip="Assign free resources to deadlocked processes">
              {loading ? <span className="spinner" /> : '🔗'} Assign Free
            </button>
          )}
          <button
            className={`btn btn-danger ${hasDeadlock ? 'pulse' : ''}`}
            onClick={handleRecover}
            disabled={!systemState || !hasDeadlock || loading}
            data-tooltip="Recover from deadlock by terminating processes"
          >
            🔧 Recover
          </button>
          <div style={{ width: 1, height: 28, background: 'var(--border)', margin: '0 4px' }} />
          <button className="btn btn-ghost" onClick={handleReset} disabled={loading}
            data-tooltip="Reset entire system">
            ↺ Reset
          </button>
        </div>
      </header>

      {/* ── Main Layout ─────────────────────── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '320px 1fr',
        gap: 0,
        overflow: 'hidden',
        flex: 1,
        height: 'calc(100vh - 79px)',
      }}>
        {/* Left Sidebar */}
        <aside style={{
          borderRight: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}>
          {/* Simulation Panel */}
          <div className="scrollable" style={{ flex: 1, padding: '20px 18px' }}>
            <div className="section-label">Simulation Setup</div>
            <SimulationPanel onInit={handleInit} onLog={log} loading={loading} />
          </div>

          {/* Event Log */}
          <div style={{ borderTop: '1px solid var(--border)', padding: '12px 18px 14px' }}>
            <div className="section-label">Event Log</div>
            <EventLog events={events} />
          </div>
        </aside>

        {/* Main Content */}
        <main style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Status Banner */}
          <div style={{ padding: '16px 24px 0' }}>
            <StatusBanner status={status} message={statusMsg} loading={loading} />
          </div>

          {/* Safe Sequence Bar */}
          {safetyResult?.is_safe && safetyResult.safe_sequence?.length > 0 && (
            <div style={{ padding: '10px 24px 0' }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
                background: 'rgba(28, 40, 73,0.15)', border: '1px solid rgba(45, 65, 115,0.25)',
                borderRadius: 'var(--radius-sm)', padding: '9px 16px',
              }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--accent-mid)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  Safe Sequence:
                </span>
                {safetyResult.safe_sequence.map((pid, idx) => (
                  <React.Fragment key={pid}>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: '0.82rem', color: 'var(--accent-light)', fontWeight: 600 }}>
                      P{pid}
                    </span>
                    {idx < safetyResult.safe_sequence.length - 1 && (
                      <span style={{ color: 'var(--text-dim)', fontSize: '0.75rem' }}>→</span>
                    )}
                  </React.Fragment>
                ))}
              </div>
            </div>
          )}

          {/* Tab bar for main content */}
          <div style={{ padding: '12px 24px 0', display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', marginTop: 12 }}>
            {[
              ['graph', '◈ Resource Graph'],
              ['table', '⊞ State Table'],
              ['steps', '≡ Algorithm Trace'],
            ].map(([tab, label]) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  padding: '7px 18px', fontSize: '0.82rem', fontWeight: 600,
                  fontFamily: 'var(--font)',
                  color: activeTab === tab ? 'var(--accent-light)' : 'var(--text-muted)',
                  borderBottom: activeTab === tab ? '2px solid var(--accent-light)' : '2px solid transparent',
                  transition: 'all 0.2s', marginBottom: -1,
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Content Area */}
          <div className="scrollable" style={{ flex: 1, padding: '20px 24px' }}>

            {/* Resource Graph Tab */}
            {activeTab === 'graph' && (
              <div className="card" style={{ padding: '20px 20px 12px', animation: 'fadein 0.35s ease' }}>
                <div className="section-label">Resource Allocation Graph</div>
                <ResourceGraph
                  nodes={deadlockResult?.graph_nodes || (systemState ? buildNodesFromState(systemState) : [])}
                  edges={deadlockResult?.graph_edges || (systemState ? buildEdgesFromState(systemState) : [])}
                  deadlocked={hasDeadlock}
                />
              </div>
            )}

            {/* State Table Tab */}
            {activeTab === 'table' && (
              <div className="card" style={{ padding: '20px', animation: 'fadein 0.35s ease' }}>
                <div className="section-label">System State</div>
                {systemState
                  ? <StateTable systemState={systemState} safetyResult={safetyResult} deadlockResult={deadlockResult} />
                  : <div style={{ color: 'var(--text-dim)', padding: '24px 0', textAlign: 'center', fontSize: '0.85rem' }}>
                      Initialize system to see state table.
                    </div>
                }
              </div>
            )}

            {/* Algorithm Trace Tab */}
            {activeTab === 'steps' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, animation: 'fadein 0.35s ease' }}>
                {safeSteps.length === 0 && (
                  <div style={{ color: 'var(--text-dim)', textAlign: 'center', padding: '32px 0', fontSize: '0.85rem' }}>
                    Run "Check Safety" to see the Banker's Algorithm step-by-step trace.
                  </div>
                )}
                {safeSteps.map((step, idx) => (
                  <div key={idx} className="card" style={{ padding: '14px 18px', animation: 'slidein 0.3s ease', animationDelay: `${idx * 0.04}s`, animationFillMode: 'both' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                      <div style={{
                        width: 26, height: 26, borderRadius: '50%',
                        background: 'rgba(28, 40, 73,0.4)', border: '1px solid var(--accent-mid)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '0.75rem', fontWeight: 700, color: 'var(--accent-light)', flexShrink: 0,
                      }}>
                        {step.step}
                      </div>
                      <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--cream)' }}>
                        Process <span style={{ color: 'var(--accent-light)', fontFamily: 'var(--mono)' }}>P{step.process}</span> can proceed
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: '0.78rem', color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>
                      <span>Need: <span style={{ color: 'var(--warn)' }}>[{step.need.join(', ')}]</span></span>
                      <span>Work before: <span style={{ color: 'var(--cream)' }}>[{step.work_before.join(', ')}]</span></span>
                      <span>Released: <span style={{ color: 'var(--accent-light)' }}>[{step.allocation_released.join(', ')}]</span></span>
                      <span>Work after: <span style={{ color: 'var(--accent-light)' }}>[{step.work_after.join(', ')}]</span></span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

// Build RAG nodes/edges directly from system state (before detection is run)
function buildNodesFromState(st) {
  if (!st) return [];
  const nodes = [];
  for (let i = 0; i < st.num_processes; i++) nodes.push({ id: `P${i}`, type: 'process', index: i });
  for (let j = 0; j < st.num_resources; j++) {
    const totalAlloc = st.allocation.reduce((s, row) => s + row[j], 0);
    nodes.push({
      id: `R${j}`, type: 'resource', index: j,
      instances: st.available[j] + totalAlloc,
      available: st.available[j],
    });
  }
  return nodes;
}

function buildEdgesFromState(st) {
  if (!st) return [];
  const edges = [];
  for (let i = 0; i < st.num_processes; i++) {
    for (let j = 0; j < st.num_resources; j++) {
      if (st.allocation[i][j] > 0) edges.push({ source: `R${j}`, target: `P${i}`, type: 'assignment', count: st.allocation[i][j] });
      if (st.need[i][j] > 0)       edges.push({ source: `P${i}`, target: `R${j}`, type: 'request',    count: st.need[i][j] });
    }
  }
  return edges;
}
