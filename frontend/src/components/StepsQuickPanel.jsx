import { useEffect, useRef, useState } from 'react';
import { getSteps, saveSteps } from '../api';
import { fmt, toKey } from '../stepsUtil';

const ACCENT = '#2dd4bf';      // teal — goal reached
const ACCENT_DIM = '#134e4a';  // dim teal — borders / save button
const AMBER = '#f59e0b';       // almost there

// Compact "log today's steps" card shown under the steps metric label on hover.
export default function StepsQuickPanel({ id, isLeft }) {
  const [goal, setGoal] = useState(10000);
  const [draft, setDraft] = useState(0);
  const [saved, setSaved] = useState(false);
  const loaded = useRef(false);

  const todayKey = toKey(new Date());

  useEffect(() => {
    getSteps(id).then((data) => {
      if (data && typeof data.goal === 'number') setGoal(data.goal);
      const today = data && data.entries ? data.entries[todayKey] : 0;
      setDraft(today || 0);
      loaded.current = true;
    });
  }, [id, todayKey]);

  const reached = draft >= goal && draft > 0;
  const pct = goal > 0 ? Math.min(100, Math.round(((Number(draft) || 0) / goal) * 100)) : 0;

  const save = () => {
    if (!loaded.current) return;
    const steps = Math.max(0, Math.round(Number(draft)) || 0);
    saveSteps(id, todayKey, steps).then(() => {
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    });
  };

  const stop = (e) => e.stopPropagation();

  return (
    <div
      style={{ ...S.panel, [isLeft ? 'left' : 'right']: 0 }}
      onClick={stop}
      onMouseDown={stop}
    >
      <div style={S.label}>Today</div>

      <div style={S.progress}>
        <span style={{ color: reached ? ACCENT : AMBER }}>{fmt(Number(draft) || 0)}</span>
        <span style={S.slash}> / {fmt(goal)}</span>
      </div>

      <div style={S.barTrack}>
        <div style={{ ...S.barFill, width: `${pct}%`, background: reached ? ACCENT : AMBER }} />
      </div>

      <input
        type="number"
        min={0}
        value={draft}
        onChange={(e) => setDraft(Number(e.target.value))}
        style={S.input}
      />

      <div style={S.actions}>
        <button style={S.ghost} onClick={() => setDraft(goal)}>Set goal</button>
        <button
          style={S.save}
          onClick={save}
          onMouseEnter={(e) => (e.currentTarget.style.background = ACCENT)}
          onMouseLeave={(e) => (e.currentTarget.style.background = ACCENT_DIM)}
        >
          {saved ? 'Saved ✓' : 'Save'}
        </button>
      </div>
    </div>
  );
}

const S = {
  panel: {
    position: 'absolute',
    top: '100%',
    marginTop: '6px',
    width: '190px',
    background: '#0d1526',
    border: `1px solid ${ACCENT_DIM}`,
    borderRadius: '14px',
    padding: '14px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    boxShadow: '0 8px 30px rgba(0,0,0,0.25)',
    cursor: 'default',
    zIndex: 30,
  },
  label: {
    fontSize: '0.55rem', letterSpacing: '0.18em', textTransform: 'uppercase',
    color: ACCENT, fontWeight: 600,
  },
  progress: { fontSize: '1.05rem', fontWeight: 300, letterSpacing: '0.02em', lineHeight: 1 },
  slash: { color: 'rgba(255,255,255,0.4)' },
  barTrack: { height: '4px', borderRadius: '4px', background: 'rgba(255,255,255,0.1)', overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: '4px', transition: 'width 0.2s ease, background 0.2s ease' },
  input: {
    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: '10px', color: 'white', fontSize: '1rem', fontWeight: 300,
    padding: '8px 10px', textAlign: 'center', fontFamily: 'inherit', width: '100%', outline: 'none',
  },
  actions: { display: 'flex', gap: '8px' },
  ghost: {
    flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
    color: 'rgba(255,255,255,0.8)', borderRadius: '9px', padding: '8px 0', fontSize: '0.65rem',
    cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '0.03em',
  },
  save: {
    flex: 1, background: ACCENT_DIM, border: 'none', color: 'white', borderRadius: '9px',
    padding: '8px 0', fontSize: '0.65rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
    letterSpacing: '0.03em', transition: 'background 0.15s',
  },
};
