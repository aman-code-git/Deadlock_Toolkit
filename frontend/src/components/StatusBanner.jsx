import React from 'react';

const STATUS = {
  idle:      { label: 'Not Initialized', cls: 'neutral', icon: '○' },
  safe:      { label: 'Safe State',      cls: 'safe',    icon: '✓' },
  unsafe:    { label: 'Unsafe State',    cls: 'warn',    icon: '⚠' },
  deadlock:  { label: 'Deadlock Detected', cls: 'danger', icon: '✕' },
  recovered: { label: 'Recovered',       cls: 'safe',    icon: '↺' },
};

export default function StatusBanner({ status = 'idle', message = '', loading = false }) {
  const s = STATUS[status] || STATUS.idle;

  const styles = {
    wrapper: {
      width: '100%',
      padding: '14px 22px',
      borderRadius: 'var(--radius-md)',
      border: '1px solid',
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      transition: 'all 0.4s ease',
      position: 'relative',
      overflow: 'hidden',
      ...(s.cls === 'safe'    && { borderColor: 'rgba(45, 65, 115,0.45)', background: 'rgba(28, 40, 73,0.18)', boxShadow: '0 0 28px rgba(28, 40, 73,0.25)' }),
      ...(s.cls === 'danger'  && { borderColor: 'rgba(229,62,62,0.5)',    background: 'rgba(229,62,62,0.12)', boxShadow: '0 0 32px rgba(229,62,62,0.3)', animation: 'dangerpulse 2s infinite' }),
      ...(s.cls === 'warn'    && { borderColor: 'rgba(214,158,46,0.45)',  background: 'rgba(214,158,46,0.1)' }),
      ...(s.cls === 'neutral' && { borderColor: 'var(--border)',          background: 'var(--bg-card)' }),
    },
    icon: {
      width: 40, height: 40,
      borderRadius: '50%',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: '1.2rem', fontWeight: 800, flexShrink: 0,
      ...(s.cls === 'safe'    && { background: 'rgba(28, 40, 73,0.5)',  color: 'var(--accent-light)' }),
      ...(s.cls === 'danger'  && { background: 'rgba(229,62,62,0.3)',  color: '#fc8181' }),
      ...(s.cls === 'warn'    && { background: 'rgba(214,158,46,0.25)',color: 'var(--warn)' }),
      ...(s.cls === 'neutral' && { background: 'rgba(255, 255, 255,0.08)', color: 'var(--text-muted)' }),
    },
    body: { flex: 1 },
    label: {
      fontWeight: 700, fontSize: '0.82rem', letterSpacing: '0.08em',
      textTransform: 'uppercase', marginBottom: 3,
      ...(s.cls === 'safe'    && { color: 'var(--accent-light)' }),
      ...(s.cls === 'danger'  && { color: '#fc8181' }),
      ...(s.cls === 'warn'    && { color: 'var(--warn)' }),
      ...(s.cls === 'neutral' && { color: 'var(--text-muted)' }),
    },
    msg: { fontSize: '0.875rem', color: 'var(--text-primary)', lineHeight: 1.5 },
  };

  return (
    <div style={styles.wrapper}>
      <div style={styles.icon}>
        {loading ? <span className="spinner" style={{ width: 20, height: 20 }} /> : s.icon}
      </div>
      <div style={styles.body}>
        <div style={styles.label}>{s.label}</div>
        {message && <div style={styles.msg}>{message}</div>}
      </div>
    </div>
  );
}
