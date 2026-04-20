import React, { useEffect, useRef } from 'react';

export default function EventLog({ events = [] }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [events]);

  const ICONS = {
    init: '⚡', safety: '🔍', deadlock: '💀', recovery: '🔧',
    request: '📤', reset: '↺', error: '⚠', info: '●',
  };

  const COLOR = {
    init: 'var(--accent-mid)',
    safety: 'var(--accent-light)',
    deadlock: '#fc8181',
    recovery: 'var(--warn)',
    request: 'var(--accent-light)',
    reset: 'var(--text-muted)',
    error: '#fc8181',
    info: 'var(--text-muted)',
  };

  return (
    <div className="scrollable" style={{
      maxHeight: 280,
      padding: '4px 0',
      display: 'flex',
      flexDirection: 'column',
      gap: 2,
    }}>
      {events.length === 0 && (
        <div style={{ color: 'var(--text-dim)', fontSize: '0.8rem', padding: '12px 16px', textAlign: 'center' }}>
          No events yet. Initialize the system to begin.
        </div>
      )}
      {events.map((evt, idx) => (
        <div
          key={idx}
          className="animate-slidein"
          style={{
            display: 'flex',
            gap: 10,
            padding: '7px 14px',
            borderRadius: 'var(--radius-sm)',
            background: idx === events.length - 1 ? 'rgba(45, 65, 115,0.06)' : 'transparent',
            transition: 'background 0.2s',
          }}
        >
          <span style={{ fontSize: '0.82rem', flexShrink: 0, color: COLOR[evt.type] || 'var(--text-muted)' }}>
            {ICONS[evt.type] || '●'}
          </span>
          <span style={{ fontFamily: 'var(--mono)', fontSize: '0.7rem', color: 'var(--text-dim)', flexShrink: 0, marginTop: 1 }}>
            {evt.time}
          </span>
          <span style={{ fontSize: '0.82rem', color: 'var(--text-primary)', lineHeight: 1.45, flex: 1 }}>
            {evt.message}
          </span>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
