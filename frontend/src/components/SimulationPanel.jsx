import React, { useState, useEffect } from 'react';
import { initSystem, loadPreset, getPresets, requestResources } from '../api/deadlock';

const PRESET_LABELS = {
  classic_safe: 'Classic Safe (Banker\'s)',
  deadlock: 'Deadlock Scenario',
  dining_philosophers: 'Dining Philosophers',
  unsafe_not_deadlocked: 'Unsafe (Not Deadlocked)',
};

function makeMatrix(rows, cols, fill = 0) {
  return Array.from({ length: rows }, () => Array(cols).fill(fill));
}

export default function SimulationPanel({ onInit, onLog, loading }) {
  const [mode, setMode] = useState('preset');  // 'preset' | 'custom' | 'request'
  const [presets, setPresets] = useState({});
  const [selectedPreset, setSelectedPreset] = useState('classic_safe');

  // Custom mode state
  const [numP, setNumP] = useState(3);
  const [numR, setNumR] = useState(3);
  const [available, setAvailable] = useState([3, 3, 2]);
  const [maxDemand, setMaxDemand] = useState(makeMatrix(3, 3));
  const [allocation, setAllocation] = useState(makeMatrix(3, 3));

  // Resource request state
  const [reqPid, setReqPid] = useState(0);
  const [reqVec, setReqVec] = useState([0, 0, 0]);
  const [reqNumR, setReqNumR] = useState(3);

  useEffect(() => {
    getPresets().then(r => setPresets(r.data)).catch(() => {});
  }, []);

  const handleMatrixChange = (setter, mat, row, col, val) => {
    const updated = mat.map(r => [...r]);
    updated[row][col] = Number(val) || 0;
    setter(updated);
  };

  const handleDimChange = (newP, newR) => {
    setNumP(newP);
    setNumR(newR);
    setAvailable(Array(newR).fill(0));
    setMaxDemand(makeMatrix(newP, newR));
    setAllocation(makeMatrix(newP, newR));
    setReqVec(Array(newR).fill(0));
    setReqNumR(newR);
  };

  const handleLoadPreset = async () => {
    try {
      const res = await loadPreset(selectedPreset);
      onInit(res.data);
      onLog('init', `Loaded preset: "${PRESET_LABELS[selectedPreset] || selectedPreset}"`);
    } catch (e) {
      onLog('error', e.response?.data?.detail || 'Failed to load preset');
    }
  };

  const handleCustomInit = async () => {
    try {
      const res = await initSystem({
        num_processes: numP,
        num_resources: numR,
        available,
        max_demand: maxDemand,
        allocation,
      });
      onInit(res.data);
      onLog('init', `Custom system initialized: ${numP} processes, ${numR} resource types.`);
    } catch (e) {
      onLog('error', e.response?.data?.detail || 'Initialization failed');
    }
  };

  const handleResourceRequest = async () => {
    try {
      const res = await requestResources(reqPid, reqVec);
      if (res.data.granted) {
        onInit(res.data.new_state);
        onLog('request', `P${reqPid} request [${reqVec.join(', ')}] GRANTED. ${res.data.message}`);
      } else {
        onLog('error', `P${reqPid} request [${reqVec.join(', ')}] DENIED: ${res.data.message}`);
      }
    } catch (e) {
      onLog('error', e.response?.data?.detail || 'Request failed');
    }
  };

  const inputH = { height: 36 };
  const sectionTitle = (t) => <div className="section-label" style={{ marginTop: 14 }}>{t}</div>;
  const matrixLabel = (labels) => (
    <div style={{ display: 'flex', gap: 4, marginBottom: 4, marginLeft: 60 }}>
      {labels.map((l, i) => (
        <div key={i} style={{ width: 52, textAlign: 'center', fontSize: '0.7rem', color: 'var(--accent-mid)', fontWeight: 700 }}>{l}</div>
      ))}
    </div>
  );

  const rLabels = Array.from({ length: numR }, (_, j) => `R${j}`);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* Tab strip */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', marginBottom: 18 }}>
        {[['preset', 'Presets'], ['custom', 'Custom Setup'], ['request', 'Resource Request']].map(([val, label]) => (
          <button
            key={val}
            onClick={() => setMode(val)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              padding: '9px 18px', fontSize: '0.82rem', fontWeight: 600,
              fontFamily: 'var(--font)',
              color: mode === val ? 'var(--accent-light)' : 'var(--text-muted)',
              borderBottom: mode === val ? '2px solid var(--accent-light)' : '2px solid transparent',
              transition: 'all 0.2s', marginBottom: -1,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Preset Mode ──────────────────────── */}
      {mode === 'preset' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, animation: 'fadein 0.3s ease' }}>
          {sectionTitle('Choose a Scenario')}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {Object.entries(PRESET_LABELS).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setSelectedPreset(key)}
                className="preset-card"
                style={{
                  background: selectedPreset === key ? 'rgba(28, 40, 73,0.35)' : 'rgba(8, 11, 26,0.5)',
                  border: selectedPreset === key ? '1px solid var(--accent-mid)' : '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '11px 14px',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <div style={{ fontSize: '0.82rem', fontWeight: 600, color: selectedPreset === key ? 'var(--accent-light)' : 'var(--cream)', marginBottom: 4 }}>
                  {label}
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
                  {presets[key] ? `${presets[key].num_processes} processes · ${presets[key].num_resources} resources` : '...'}
                </div>
              </button>
            ))}
          </div>
          <button className="btn btn-primary" onClick={handleLoadPreset} disabled={loading} style={{ marginTop: 6, alignSelf: 'flex-start' }}>
            {loading ? <><span className="spinner" /> Loading…</> : '⚡ Load Preset'}
          </button>
        </div>
      )}

      {/* ── Custom Mode ──────────────────────── */}
      {mode === 'custom' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, animation: 'fadein 0.3s ease' }}>
          {sectionTitle('System Dimensions')}
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: '1 1 120px' }}>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Processes (n)</label>
              <input type="number" min={1} max={8} value={numP}
                onChange={e => handleDimChange(Number(e.target.value) || 1, numR)}
                style={inputH} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: '1 1 120px' }}>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Resource Types (m)</label>
              <input type="number" min={1} max={6} value={numR}
                onChange={e => handleDimChange(numP, Number(e.target.value) || 1)}
                style={inputH} />
            </div>
          </div>

          {sectionTitle('Available Resources')}
          {matrixLabel(rLabels)}
          <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
            {available.map((v, j) => (
              <input key={j} type="number" className="matrix-cell" min={0} value={v}
                onChange={e => {
                  const a = [...available]; a[j] = Number(e.target.value) || 0; setAvailable(a);
                }}
              />
            ))}
          </div>

          {sectionTitle('Max Demand Matrix')}
          {matrixLabel(rLabels)}
          {maxDemand.map((row, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
              <span style={{ width: 52, fontSize: '0.75rem', color: 'var(--accent-mid)', fontWeight: 700, textAlign: 'center' }}>P{i}</span>
              {row.map((v, j) => (
                <input key={j} type="number" className="matrix-cell" min={0} value={v}
                  onChange={e => handleMatrixChange(setMaxDemand, maxDemand, i, j, e.target.value)}
                />
              ))}
            </div>
          ))}

          {sectionTitle('Allocation Matrix')}
          {matrixLabel(rLabels)}
          {allocation.map((row, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
              <span style={{ width: 52, fontSize: '0.75rem', color: 'var(--accent-mid)', fontWeight: 700, textAlign: 'center' }}>P{i}</span>
              {row.map((v, j) => (
                <input key={j} type="number" className="matrix-cell" min={0} value={v}
                  onChange={e => handleMatrixChange(setAllocation, allocation, i, j, e.target.value)}
                />
              ))}
            </div>
          ))}

          <button className="btn btn-primary" onClick={handleCustomInit} disabled={loading} style={{ marginTop: 8, alignSelf: 'flex-start' }}>
            {loading ? <><span className="spinner" /> Initializing…</> : '⚡ Initialize System'}
          </button>
        </div>
      )}

      {/* ── Resource Request Mode ─────────────── */}
      {mode === 'request' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, animation: 'fadein 0.3s ease' }}>
          {sectionTitle('Process Resource Request')}
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
            Simulate a process requesting additional resources. The Banker's algorithm will validate if granting this request keeps the system in a safe state.
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Requesting Process</label>
            <select value={reqPid} onChange={e => setReqPid(Number(e.target.value))} style={{ height: 36 }}>
              {Array.from({ length: 8 }, (_, i) => (
                <option key={i} value={i}>P{i}</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Number of Resource Types</label>
            <input type="number" min={1} max={6} value={reqNumR}
              onChange={e => { const n = Number(e.target.value) || 1; setReqNumR(n); setReqVec(Array(n).fill(0)); }}
              style={{ height: 36 }} />
          </div>

          {sectionTitle('Request Vector')}
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {Array.from({ length: reqNumR }, (_, j) => (
              <div key={j} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                <span style={{ fontSize: '0.7rem', color: 'var(--accent-mid)', fontWeight: 700 }}>R{j}</span>
                <input type="number" className="matrix-cell" min={0} value={reqVec[j] || 0}
                  onChange={e => { const v = [...reqVec]; v[j] = Number(e.target.value) || 0; setReqVec(v); }}
                />
              </div>
            ))}
          </div>

          <button className="btn btn-warn" onClick={handleResourceRequest} disabled={loading} style={{ alignSelf: 'flex-start', marginTop: 6 }}>
            {loading ? <><span className="spinner" /> Processing…</> : '📤 Submit Request'}
          </button>
        </div>
      )}
    </div>
  );
}
