import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSteps, saveGoal, saveSteps } from '../api';
import { fmt, toKey } from '../stepsUtil';

const ACCENT = '#2dd4bf'; // home page teal accent
const ACCENT_DIM = '#134e4a'; // home page dim teal (borders)
const AMBER = '#f59e0b';
const CHIPS = [5, 6, 7, 8, 9, 10, 12, 15];
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const startOfWeek = (d) => {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = (r.getDay() + 6) % 7; // Mon = 0
  r.setDate(r.getDate() - day);
  return r;
};

const addDays = (d, n) => {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
};

export default function StepsTracker({ id }) {
  const navigate = useNavigate();
  const [goal, setGoal] = useState(10000);
  const [entries, setEntries] = useState({});
  const [weekOffset, setWeekOffset] = useState(0);
  const [editing, setEditing] = useState(null); // { key, label }
  const [draft, setDraft] = useState(0);
  const loaded = useRef(false);

  useEffect(() => {
    getSteps(id).then((data) => {
      if (data && typeof data.goal === 'number') setGoal(data.goal);
      if (data && data.entries) setEntries(data.entries);
      loaded.current = true;
    });
  }, [id]);

  const commitGoal = (g) => {
    const clamped = Math.max(1000, Math.min(20000, g));
    setGoal(clamped);
    if (loaded.current) saveGoal(id, clamped);
  };

  const today = new Date();
  const todayKey = toKey(today);
  const weekStart = addDays(startOfWeek(today), weekOffset * 7);
  const weekEnd = addDays(weekStart, 6);
  const days = WEEKDAYS.map((_, i) => addDays(weekStart, i));

  const rangeLabel = `${weekStart.getDate()} ${MONTHS[weekStart.getMonth()]} — ${weekEnd.getDate()} ${MONTHS[weekEnd.getMonth()]}`;
  const stateLabel =
    weekOffset === 0 ? 'Current week' : weekOffset > 0 ? 'Upcoming week' : 'Finished week';
  const finished = weekOffset < 0;

  const dayStatus = (key) => {
    const steps = entries[key];
    if (steps == null || steps <= 0) return 'none';
    return steps >= goal ? 'done' : 'almost';
  };

  const openEditor = (d, key) => {
    setEditing({
      key,
      label: `${WEEKDAYS[(d.getDay() + 6) % 7]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`,
    });
    setDraft(entries[key] || 0);
  };

  const saveDraft = () => {
    const steps = Math.max(0, Math.round(draft) || 0);
    setEntries((prev) => {
      const next = { ...prev };
      if (steps > 0) next[editing.key] = steps;
      else delete next[editing.key];
      return next;
    });
    saveSteps(id, editing.key, steps);
    setEditing(null);
  };

  return (
    <div className="st-page" style={S.page}>
      <style>{thumbCss}</style>

      <button
        onClick={() => navigate('/')}
        style={S.back}
        onMouseEnter={(e) => (e.currentTarget.style.color = 'rgba(0,0,0,0.6)')}
        onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(0,0,0,0.25)')}
      >
        ← Back
      </button>

      <div style={S.inner}>
        {/* ---- Goal ---- */}
        <section style={S.goalSection}>
          <div style={S.eyebrow}>Daily goal</div>
          <div style={S.counter}>
            {fmt(goal)}
            <span style={S.counterUnit}>steps / day</span>
          </div>

          <div style={S.chips}>
            {CHIPS.map((k) => {
              const active = goal === k * 1000;
              return (
                <button
                  key={k}
                  onClick={() => commitGoal(k * 1000)}
                  style={{
                    ...S.chip,
                    ...(active ? S.chipActive : null),
                  }}
                >
                  {k}k
                </button>
              );
            })}
          </div>

          <div style={S.sliderWrap}>
            <span style={S.sliderEnd}>1k</span>
            <input
              type="range"
              min={1}
              max={20}
              step={1}
              value={Math.round(goal / 1000)}
              onChange={(e) => setGoal(Number(e.target.value) * 1000)}
              onMouseUp={(e) => commitGoal(Number(e.target.value) * 1000)}
              onTouchEnd={(e) => commitGoal(Number(e.target.value) * 1000)}
              style={S.slider}
            />
            <span style={S.sliderEnd}>20k</span>
          </div>
        </section>

        {/* ---- Week ---- */}
        <section style={S.weekSection}>
          <div style={S.weekHeader}>
            <button style={S.arrow} onClick={() => setWeekOffset((o) => o - 1)}>
              ‹
            </button>
            <div style={S.weekHeaderMid}>
              <div style={S.range}>{rangeLabel}</div>
              <div
                style={{
                  ...S.weekState,
                  color: finished ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.55)',
                }}
              >
                {stateLabel}
              </div>
            </div>
            <button style={S.arrow} onClick={() => setWeekOffset((o) => o + 1)}>
              ›
            </button>
          </div>

          <div style={{ ...S.grid, ...(finished ? S.gridFinished : null) }}>
            {days.map((d, i) => {
              const key = toKey(d);
              const isToday = key === todayKey;
              const isFuture = key > todayKey;
              const status = dayStatus(key);
              const c =
                status === 'done' ? ACCENT : status === 'almost' ? AMBER : 'rgba(0,0,0,0.3)';
              const mark = status === 'done' ? '✓' : status === 'almost' ? '◔' : '–';
              return (
                <button
                  key={key}
                  disabled={isFuture}
                  onClick={() => !isFuture && openEditor(d, key)}
                  style={{
                    ...S.cell,
                    cursor: isFuture ? 'default' : 'pointer',
                    opacity: isFuture ? 0.35 : 1,
                    border: isToday ? '1px solid rgba(0,0,0,0.45)' : '1px solid rgba(0,0,0,0.08)',
                  }}
                >
                  <span style={S.cellDow}>{WEEKDAYS[i]}</span>
                  <span style={S.cellNum}>{d.getDate()}</span>
                  <span
                    style={{
                      ...S.mark,
                      color: status === 'none' ? c : '#0f172a',
                      background: status === 'none' ? 'rgba(0,0,0,0.05)' : c,
                    }}
                  >
                    {mark}
                  </span>
                  <span style={S.cellSteps}>{entries[key] ? fmt(entries[key]) : ''}</span>
                </button>
              );
            })}
          </div>
        </section>

        {/* ---- Legend ---- */}
        <section style={S.legend}>
          <span style={S.legendItem}>
            <i style={{ ...S.dot, background: ACCENT }} /> goal reached
          </span>
          <span style={S.legendItem}>
            <i style={{ ...S.dot, background: AMBER }} /> almost
          </span>
          <span style={S.legendItem}>
            <i style={{ ...S.dot, background: 'rgba(0,0,0,0.18)' }} /> no data
          </span>
        </section>
      </div>

      {/* ---- Editor ---- */}
      {editing && (
        <div style={S.overlay} onClick={() => setEditing(null)}>
          <div style={S.editor} onClick={(e) => e.stopPropagation()}>
            <div style={S.editorTitle}>{editing.label}</div>

            <input
              type="number"
              min={0}
              value={draft}
              onChange={(e) => setDraft(Number(e.target.value))}
              autoFocus
              style={S.input}
            />

            <div style={S.hint}>
              {draft >= goal ? (
                <span style={{ color: ACCENT }}>✓ Goal reached</span>
              ) : (
                <span style={{ color: '#fbbf24' }}>
                  ◔ {fmt(Math.max(0, goal - Math.round(draft || 0)))} steps to goal
                </span>
              )}
            </div>

            <div style={S.quickRow}>
              <button style={S.quick} onClick={() => setDraft(goal)}>
                Set goal
              </button>
              <button style={S.quick} onClick={() => setDraft((v) => (Number(v) || 0) + 1000)}>
                +1000
              </button>
              <button
                style={S.quick}
                onClick={() => setDraft((v) => Math.max(0, (Number(v) || 0) - 1000))}
              >
                −1000
              </button>
            </div>

            <div style={S.editorActions}>
              <button style={S.clear} onClick={() => setDraft(0)}>
                Clear
              </button>
              <button
                style={S.save}
                onClick={saveDraft}
                onMouseEnter={(e) => (e.currentTarget.style.background = ACCENT)}
                onMouseLeave={(e) => (e.currentTarget.style.background = ACCENT_DIM)}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const thumbCss = `
  .st-page input[type=range] {
    -webkit-appearance: none; appearance: none;
    height: 4px; border-radius: 4px;
    background: rgba(0,0,0,0.1);
    outline: none;
  }
  .st-page input[type=range]::-webkit-slider-thumb {
    -webkit-appearance: none; appearance: none;
    width: 18px; height: 18px; border-radius: 50%;
    background: ${ACCENT}; cursor: pointer;
    box-shadow: 0 0 0 4px rgba(45,212,191,0.18);
  }
  .st-page input[type=range]::-moz-range-thumb {
    width: 18px; height: 18px; border: none; border-radius: 50%;
    background: ${ACCENT}; cursor: pointer;
  }
  .st-page input[type=number]::-webkit-outer-spin-button,
  .st-page input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
`;

const S = {
  page: {
    position: 'relative',
    width: '100vw',
    minHeight: '100vh',
    height: '100vh',
    background: 'white',
    overflowY: 'auto',
    color: 'black',
    fontFamily: "'Inter', system-ui, sans-serif",
  },
  back: {
    position: 'absolute',
    top: '28px',
    left: '28px',
    background: 'none',
    border: 'none',
    color: 'rgba(0,0,0,0.25)',
    fontSize: '0.65rem',
    letterSpacing: '0.18em',
    textTransform: 'uppercase',
    cursor: 'pointer',
    fontFamily: 'inherit',
    zIndex: 20,
    transition: 'color 0.2s',
    padding: 0,
  },
  inner: {
    maxWidth: '720px',
    margin: '0 auto',
    padding: '96px 24px 64px',
    display: 'flex',
    flexDirection: 'column',
    gap: '56px',
  },

  goalSection: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '22px' },
  eyebrow: {
    fontSize: '0.65rem',
    letterSpacing: '0.3em',
    textTransform: 'uppercase',
    color: 'rgba(0,0,0,0.4)',
    fontWeight: 300,
  },
  counter: {
    fontSize: '4rem',
    fontWeight: 200,
    letterSpacing: '0.02em',
    lineHeight: 1,
    color: '#0f172a',
    display: 'flex',
    alignItems: 'flex-end',
    gap: '14px',
  },
  counterUnit: {
    fontSize: '0.8rem',
    fontWeight: 400,
    letterSpacing: '0.06em',
    color: 'rgba(0,0,0,0.35)',
    paddingBottom: '8px',
  },
  chips: { display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center' },
  chip: {
    background: 'transparent',
    border: '1px solid rgba(0,0,0,0.15)',
    color: 'rgba(0,0,0,0.55)',
    borderRadius: '999px',
    padding: '7px 16px',
    fontSize: '0.8rem',
    letterSpacing: '0.04em',
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'all 0.15s',
  },
  chipActive: { background: ACCENT, borderColor: ACCENT, color: '#0f172a', fontWeight: 600 },
  sliderWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
    width: '100%',
    maxWidth: '440px',
  },
  slider: { flex: 1 },
  sliderEnd: { fontSize: '0.65rem', letterSpacing: '0.1em', color: 'rgba(0,0,0,0.3)' },

  weekSection: { display: 'flex', flexDirection: 'column', gap: '18px' },
  weekHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  weekHeaderMid: { textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '4px' },
  range: { fontSize: '1rem', fontWeight: 300, letterSpacing: '0.04em', color: '#0f172a' },
  weekState: { fontSize: '0.6rem', letterSpacing: '0.2em', textTransform: 'uppercase' },
  arrow: {
    background: 'transparent',
    border: `1px solid ${ACCENT_DIM}`,
    color: ACCENT_DIM,
    width: '38px',
    height: '38px',
    borderRadius: '12px',
    fontSize: '1.2rem',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
    gap: '8px',
    transition: 'opacity 0.3s, filter 0.3s',
  },
  gridFinished: { opacity: 0.42, filter: 'saturate(0.6)' },
  cell: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
    background: 'rgba(0,0,0,0.02)',
    borderRadius: '14px',
    padding: '12px 4px',
    fontFamily: 'inherit',
    color: 'inherit',
    transition: 'all 0.15s',
  },
  cellDow: {
    fontSize: '0.58rem',
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    color: 'rgba(0,0,0,0.4)',
  },
  cellNum: { fontSize: '0.95rem', fontWeight: 300, color: '#0f172a' },
  mark: {
    width: '26px',
    height: '26px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '0.8rem',
    fontWeight: 700,
  },
  cellSteps: {
    fontSize: '0.55rem',
    color: 'rgba(0,0,0,0.4)',
    minHeight: '0.7rem',
    letterSpacing: '0.02em',
  },

  legend: {
    display: 'flex',
    gap: '24px',
    justifyContent: 'center',
    flexWrap: 'wrap',
    fontSize: '0.65rem',
    letterSpacing: '0.1em',
    color: 'rgba(0,0,0,0.45)',
    textTransform: 'uppercase',
  },
  legendItem: { display: 'flex', alignItems: 'center', gap: '8px' },
  dot: { width: '10px', height: '10px', borderRadius: '50%', display: 'inline-block' },

  // Day editor — matches the home page's ManageMetrics dark modal
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.65)',
    backdropFilter: 'blur(6px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 30,
  },
  editor: {
    background: '#0d1526',
    border: `1px solid ${ACCENT_DIM}`,
    borderRadius: '16px',
    padding: '28px',
    width: '320px',
    maxWidth: '90vw',
    display: 'flex',
    flexDirection: 'column',
    gap: '18px',
    boxShadow: '0 0 40px rgba(45,212,191,0.08)',
  },
  editorTitle: {
    fontSize: '0.7rem',
    letterSpacing: '0.15em',
    textTransform: 'uppercase',
    color: ACCENT,
    fontWeight: 600,
  },
  input: {
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: '12px',
    color: 'white',
    fontSize: '1.6rem',
    fontWeight: 200,
    padding: '12px 16px',
    textAlign: 'center',
    fontFamily: 'inherit',
    width: '100%',
    outline: 'none',
  },
  hint: { textAlign: 'center', fontSize: '0.8rem', letterSpacing: '0.03em' },
  quickRow: { display: 'flex', gap: '8px' },
  quick: {
    flex: 1,
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)',
    color: 'rgba(255,255,255,0.8)',
    borderRadius: '10px',
    padding: '9px 0',
    fontSize: '0.72rem',
    cursor: 'pointer',
    fontFamily: 'inherit',
    letterSpacing: '0.03em',
  },
  editorActions: { display: 'flex', gap: '8px', marginTop: '4px' },
  clear: {
    flex: 1,
    background: 'transparent',
    border: '1px solid rgba(255,255,255,0.12)',
    color: 'rgba(255,255,255,0.5)',
    borderRadius: '10px',
    padding: '11px 0',
    fontSize: '0.8rem',
    cursor: 'pointer',
    fontFamily: 'inherit',
    letterSpacing: '0.04em',
  },
  save: {
    flex: 2,
    background: ACCENT_DIM,
    border: 'none',
    color: 'white',
    borderRadius: '10px',
    padding: '11px 0',
    fontSize: '0.8rem',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
    letterSpacing: '0.04em',
    transition: 'background 0.15s',
  },
};
