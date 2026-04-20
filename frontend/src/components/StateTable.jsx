import React from 'react';

export default function StateTable({ systemState, safetyResult, deadlockResult }) {
  if (!systemState) return null;

  const { num_processes, num_resources, allocation, max_demand, need, available,
          process_names, resource_names } = systemState;

  const deadlockedSet = new Set(deadlockResult?.deadlocked_processes || []);
  const safeSeqSet = {};
  if (safetyResult?.safe_sequence) {
    safetyResult.safe_sequence.forEach((pid, idx) => { safeSeqSet[pid] = idx + 1; });
  }

  const cellStyle = (val, isNeed = false, isDeadlocked = false) => ({
    padding: '8px 12px',
    textAlign: 'center',
    fontFamily: 'var(--mono)',
    fontSize: '0.82rem',
    color: isDeadlocked ? '#fc8181' : isNeed && val > 0 ? 'var(--warn)' : 'var(--cream)',
    borderBottom: '1px solid var(--border)',
  });

  const headerStyle = {
    padding: '8px 12px',
    textAlign: 'center',
    fontSize: '0.7rem',
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: 'var(--accent-mid)',
    borderBottom: '1px solid var(--border-bright)',
    background: 'rgba(28, 40, 73,0.12)',
    whiteSpace: 'nowrap',
  };

  const rowStyle = (pid) => ({
    background: deadlockedSet.has(pid)
      ? 'rgba(229,62,62,0.08)'
      : pid % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent',
    transition: 'background 0.2s',
  });

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
        <thead>
          <tr>
            <th style={{ ...headerStyle, textAlign: 'left' }}>Process</th>
            {resource_names.map(r => (
              <th key={`alloc-${r}`} style={headerStyle} colSpan={1}>Alloc ({r})</th>
            ))}
            {resource_names.map(r => (
              <th key={`max-${r}`} style={headerStyle} colSpan={1}>Max ({r})</th>
            ))}
            {resource_names.map(r => (
              <th key={`need-${r}`} style={headerStyle} colSpan={1}>Need ({r})</th>
            ))}
            <th style={headerStyle}>Status</th>
            {safetyResult?.safe_sequence?.length > 0 && <th style={headerStyle}>Order</th>}
          </tr>
        </thead>
        <tbody>
          {process_names.map((name, pid) => {
            const isDl = deadlockedSet.has(pid);
            return (
              <tr key={pid} style={rowStyle(pid)}>
                <td style={{ ...cellStyle(0), textAlign: 'left', fontWeight: 600,
                  color: isDl ? '#fc8181' : 'var(--cream)' }}>
                  {isDl && <span style={{ marginRight: 6, color: 'var(--danger)' }}>⚠</span>}
                  {name}
                </td>
                {allocation[pid].map((v, j) => (
                  <td key={j} style={cellStyle(v, false, isDl)}>{v}</td>
                ))}
                {max_demand[pid].map((v, j) => (
                  <td key={j} style={cellStyle(v, false, isDl)}>{v}</td>
                ))}
                {need[pid].map((v, j) => (
                  <td key={j} style={cellStyle(v, true, isDl)}>{v}</td>
                ))}
                <td style={{ ...cellStyle(0), padding: '6px 10px' }}>
                  {isDl
                    ? <span className="badge badge-danger">Deadlocked</span>
                    : allocation[pid].every(v => v === 0)
                      ? <span className="badge badge-neutral">Idle</span>
                      : <span className="badge badge-safe">Running</span>
                  }
                </td>
                {safetyResult?.safe_sequence?.length > 0 && (
                  <td style={{ ...cellStyle(0), fontFamily: 'var(--mono)' }}>
                    {safeSeqSet[pid] != null
                      ? <span style={{ color: 'var(--accent-light)', fontWeight: 700 }}>#{safeSeqSet[pid]}</span>
                      : <span style={{ color: 'var(--text-dim)' }}>—</span>
                    }
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr style={{ background: 'rgba(28, 40, 73,0.1)' }}>
            <td style={{ ...cellStyle(0), textAlign: 'left', fontWeight: 700, color: 'var(--accent-light)' }}>
              Available
            </td>
            {available.map((v, j) => (
              <td key={j} colSpan={1} style={{ ...cellStyle(v), color: 'var(--accent-light)', fontWeight: 600 }}>{v}</td>
            ))}
            {/* Fill remaining columns */}
            {Array(num_resources * 2 + 1 + (safetyResult?.safe_sequence?.length > 0 ? 1 : 0)).fill(null).map((_, i) => (
              <td key={i} style={cellStyle(0)}>—</td>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
