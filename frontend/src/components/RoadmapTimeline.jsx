import { useEffect, useRef, useState } from 'react';
import {
  getRoadmap,
  createMilestone,
  updateMilestone,
  deleteMilestone,
} from '../api';

const BLUE = '#2563eb';
const TEXT = '#374151';
const MUTED = '#9ca3af';
const BORDER = '#e5e7eb';
const GREEN = '#16a34a';
const FONT = '-apple-system, "Segoe UI", Roboto, system-ui, sans-serif';

const STATUS_META = {
  upcoming:    { label: 'Upcoming',    color: MUTED, ring: '#cbd5e1' },
  in_progress: { label: 'In progress', color: BLUE,  ring: BLUE },
  done:        { label: 'Done',        color: GREEN, ring: GREEN },
};
const STATUS_ORDER = ['upcoming', 'in_progress', 'done'];

const clamp = (n, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, n));

export default function RoadmapTimeline({ id }) {
  const [milestones, setMilestones] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [openId, setOpenId] = useState(null);     // milestone whose menu is open
  const [titleDraft, setTitleDraft] = useState('');
  const [draggingId, setDraggingId] = useState(null);

  const trackRef = useRef(null);
  const dragState = useRef(null);   // { id, moved }
  const nudgeRef = useRef(null);    // { id, position } pending keyboard persist

  useEffect(() => {
    getRoadmap(id).then((rows) => {
      setMilestones(Array.isArray(rows) ? rows : []);
      setLoaded(true);
    });
  }, [id]);

  const sorted = [...milestones].sort((a, b) => a.position - b.position);
  const total = milestones.length;
  const doneCount = milestones.filter((m) => m.status === 'done').length;
  const current = milestones.find((m) => m.status === 'in_progress');
  const doneMax = milestones
    .filter((m) => m.status === 'done')
    .reduce((mx, m) => Math.max(mx, m.position), 0);
  const fillPct = current ? current.position : (doneCount ? doneMax : 0);

  // ----- helpers -----
  const patchLocal = (mId, patch) =>
    setMilestones((prev) => prev.map((m) => (m.id === mId ? { ...m, ...patch } : m)));

  const persist = async (mId, body) => {
    const updated = await updateMilestone(id, mId, body);
    if (updated && updated.id) patchLocal(mId, updated);
  };

  const pctFromClientX = (clientX) => {
    const rect = trackRef.current.getBoundingClientRect();
    return clamp(((clientX - rect.left) / rect.width) * 100);
  };

  const addAt = async (pct) => {
    const created = await createMilestone(id, { title: 'New task', position: pct });
    if (created && created.id) {
      setMilestones((prev) => [...prev, created]);
      setOpenId(created.id);
      setTitleDraft(created.title);
    }
  };

  const handleTrackClick = (e) => {
    if (e.target.dataset.clicklayer !== 'true') return;
    addAt(pctFromClientX(e.clientX));
  };

  const setStatus = (m, status) => persist(m.id, { status });

  const remove = async (mId) => {
    await deleteMilestone(id, mId);
    setMilestones((prev) => prev.filter((m) => m.id !== mId));
    if (openId === mId) setOpenId(null);
  };

  const openMenu = (m) => {
    setOpenId((cur) => {
      const next = cur === m.id ? null : m.id;
      if (next) setTitleDraft(m.title);
      return next;
    });
  };

  const commitTitle = (m) => {
    const t = titleDraft.trim();
    if (t && t !== m.title) persist(m.id, { title: t });
    else setTitleDraft(m.title);
  };

  // ----- drag (pointer events) -----
  const onNodePointerDown = (e, m) => {
    if (e.button !== undefined && e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragState.current = { id: m.id, startX: e.clientX, moved: false };
  };

  const onNodePointerMove = (e, m) => {
    const st = dragState.current;
    if (!st || st.id !== m.id) return;
    if (!st.moved && Math.abs(e.clientX - st.startX) < 4) return;
    st.moved = true;
    if (draggingId !== m.id) setDraggingId(m.id);
    patchLocal(m.id, { position: pctFromClientX(e.clientX) });
  };

  const onNodePointerUp = (e, m) => {
    const st = dragState.current;
    dragState.current = null;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
    if (!st) return;
    if (st.moved) {
      setDraggingId(null);
      persist(m.id, { position: pctFromClientX(e.clientX) });
    } else {
      openMenu(m);
    }
  };

  // ----- keyboard -----
  const onNodeKeyDown = (e, m) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      const delta = e.key === 'ArrowLeft' ? -2 : 2;
      const next = clamp((nudgeRef.current?.position ?? m.position) + delta);
      nudgeRef.current = { id: m.id, position: next };
      patchLocal(m.id, { position: next });
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openMenu(m);
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      remove(m.id);
    } else if (e.key === 'Escape') {
      setOpenId(null);
    }
  };

  const onNodeKeyUp = (e, m) => {
    if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && nudgeRef.current?.id === m.id) {
      persist(m.id, { position: nudgeRef.current.position });
      nudgeRef.current = null;
    }
  };

  return (
    <section style={styles.card} aria-label="Roadmap timeline">
      <style>{keyframes}</style>

      <header style={styles.header}>
        <div>
          <h2 style={styles.heading}>Roadmap</h2>
          <p style={styles.sub}>Plan your milestones and track where you are.</p>
        </div>
        <div style={styles.headerRight}>
          {total > 0 && (
            <span style={styles.progressPill} aria-live="polite">
              <span style={styles.progressDot} />
              {doneCount} of {total} stages complete
            </span>
          )}
          <button
            type="button"
            onClick={() => addAt(current ? clamp(current.position + 10) : 50)}
            style={styles.addBtn}
            className="rt-add"
          >
            + Add task
          </button>
        </div>
      </header>

      <div
        ref={trackRef}
        style={styles.track}
        role="group"
        aria-label="Timeline track"
        onClick={handleTrackClick}
      >
        {/* clickable band on the line */}
        <div data-clicklayer="true" style={styles.clickLayer} title="Click to add a task here" />

        {/* base + progress line */}
        <div style={styles.baseLine} />
        <div style={{ ...styles.fillLine, width: `${fillPct}%`, transition: draggingId ? 'none' : 'width .45s ease' }} />

        {loaded && total === 0 && (
          <p style={styles.emptyHint}>Click anywhere on the line, or “Add task”, to create your first milestone.</p>
        )}

        {sorted.map((m, i) => {
          const meta = STATUS_META[m.status] || STATUS_META.upcoming;
          const above = i % 2 === 0;            // stagger labels
          const isCurrent = m.status === 'in_progress';
          const isOpen = openId === m.id;
          const isDragging = draggingId === m.id;

          return (
            <div
              key={m.id}
              style={{
                ...styles.nodeWrap,
                left: `${m.position}%`,
                zIndex: isOpen ? 60 : isDragging ? 40 : 10,
                transition: isDragging ? 'none' : 'left .35s cubic-bezier(.22,1,.36,1)',
              }}
            >
              {/* label */}
              <span
                style={{
                  ...styles.label,
                  ...(above ? styles.labelAbove : styles.labelBelow),
                  borderColor: isCurrent ? BLUE : BORDER,
                  color: isCurrent ? BLUE : TEXT,
                }}
              >
                {m.title}
              </span>

              {/* connector tick */}
              <span style={{ ...styles.tick, ...(above ? styles.tickAbove : styles.tickBelow) }} />

              {/* marker button */}
              <button
                type="button"
                aria-label={`${m.title} — ${meta.label}. Use arrow keys to move, Enter to edit, Delete to remove.`}
                aria-expanded={isOpen}
                className="rt-node"
                onPointerDown={(e) => onNodePointerDown(e, m)}
                onPointerMove={(e) => onNodePointerMove(e, m)}
                onPointerUp={(e) => onNodePointerUp(e, m)}
                onKeyDown={(e) => onNodeKeyDown(e, m)}
                onKeyUp={(e) => onNodeKeyUp(e, m)}
                style={{
                  ...styles.marker,
                  borderColor: meta.ring,
                  background: m.status === 'done' ? GREEN : m.status === 'in_progress' ? BLUE : '#fff',
                  cursor: isDragging ? 'grabbing' : 'grab',
                  transform: isCurrent ? 'translateX(-50%) scale(1.12)' : 'translateX(-50%)',
                }}
              >
                {isCurrent && <span style={styles.pulseRing} className="rt-pulse" aria-hidden="true" />}
                {m.status === 'done' && <CheckIcon />}
                {m.status === 'in_progress' && <span style={styles.innerDot} className="rt-dot" aria-hidden="true" />}
              </button>

              {/* popover menu */}
              {isOpen && (
                <div
                  style={{
                    ...styles.menu,
                    ...(m.position > 80 ? { left: 'auto', right: 0, transform: 'none' }
                      : m.position < 20 ? { left: 0, transform: 'none' }
                      : {}),
                  }}
                  role="dialog"
                  aria-label={`Edit ${m.title}`}
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    autoFocus
                    value={titleDraft}
                    onChange={(e) => setTitleDraft(e.target.value)}
                    onBlur={() => commitTitle(m)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { commitTitle(m); setOpenId(null); }
                      if (e.key === 'Escape') { setTitleDraft(m.title); setOpenId(null); }
                    }}
                    placeholder="Task title"
                    style={styles.menuInput}
                  />
                  <div style={styles.statusRow} role="group" aria-label="Set status">
                    {STATUS_ORDER.map((s) => {
                      const sm = STATUS_META[s];
                      const active = m.status === s;
                      return (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setStatus(m, s)}
                          aria-pressed={active}
                          style={{
                            ...styles.statusBtn,
                            color: active ? '#fff' : sm.color,
                            background: active ? sm.color : 'transparent',
                            borderColor: active ? sm.color : BORDER,
                          }}
                        >
                          {sm.label}
                        </button>
                      );
                    })}
                  </div>
                  <div style={styles.menuFooter}>
                    <button type="button" onClick={() => remove(m.id)} style={styles.deleteBtn} className="rt-delete">
                      Delete
                    </button>
                    <button type="button" onClick={() => setOpenId(null)} style={styles.doneBtn}>
                      Done
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function CheckIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

const keyframes = `
@keyframes rtPulse {
  0%   { transform: translate(-50%, -50%) scale(1);   opacity: .55; }
  70%  { transform: translate(-50%, -50%) scale(2.4); opacity: 0; }
  100% { transform: translate(-50%, -50%) scale(2.4); opacity: 0; }
}
.rt-pulse { animation: rtPulse 1.8s ease-out infinite; }
.rt-dot   { box-shadow: 0 0 0 0 rgba(37,99,235,.4); }
.rt-node  { outline: none; }
.rt-node:focus-visible { box-shadow: 0 0 0 3px rgba(37,99,235,.35); }
.rt-node:hover { filter: brightness(1.02); transform-origin: center; }
.rt-add:hover { background: #1d4ed8; }
.rt-delete:hover { background: #fef2f2; color: #dc2626; }
`;

const styles = {
  card: {
    border: `1px solid ${BORDER}`,
    borderRadius: 16,
    background: '#fff',
    boxShadow: '0 1px 3px rgba(16,24,40,0.06), 0 1px 2px rgba(16,24,40,0.04)',
    padding: '20px 22px 8px',
    marginBottom: 32,
    fontFamily: FONT,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 16,
    flexWrap: 'wrap',
    marginBottom: 8,
  },
  heading: { fontSize: '1.1rem', fontWeight: 600, color: '#111827', margin: 0 },
  sub: { margin: '3px 0 0', fontSize: '0.82rem', color: MUTED },
  headerRight: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  progressPill: {
    display: 'inline-flex', alignItems: 'center', gap: 7,
    background: '#f0f9ff', color: '#0369a1',
    border: '1px solid #e0f2fe',
    borderRadius: 999, padding: '5px 12px',
    fontSize: '0.78rem', fontWeight: 500, whiteSpace: 'nowrap',
  },
  progressDot: { width: 7, height: 7, borderRadius: '50%', background: GREEN, display: 'inline-block' },
  addBtn: {
    background: BLUE, color: '#fff', border: 'none', borderRadius: 9,
    padding: '8px 14px', fontSize: '0.83rem', fontWeight: 500,
    cursor: 'pointer', fontFamily: 'inherit', transition: 'background .15s',
  },
  track: {
    position: 'relative',
    height: 124,
    width: '100%',
    marginTop: 8,
  },
  clickLayer: {
    position: 'absolute', left: 0, right: 0, top: 42, height: 40,
    cursor: 'crosshair', zIndex: 1,
  },
  baseLine: {
    position: 'absolute', left: 0, right: 0, top: 61, height: 4,
    background: '#eef2f6', borderRadius: 999, pointerEvents: 'none', zIndex: 2,
  },
  fillLine: {
    position: 'absolute', left: 0, top: 61, height: 4,
    background: `linear-gradient(90deg, ${BLUE}, #3b82f6)`,
    borderRadius: 999, pointerEvents: 'none', zIndex: 3,
  },
  emptyHint: {
    position: 'absolute', left: '50%', top: 78, transform: 'translateX(-50%)',
    margin: 0, color: MUTED, fontSize: '0.82rem', textAlign: 'center',
    width: '90%', pointerEvents: 'none',
  },
  nodeWrap: { position: 'absolute', top: 0, height: '100%' },
  marker: {
    position: 'absolute', top: 63, left: 0, transform: 'translateX(-50%)',
    width: 22, height: 22, borderRadius: '50%',
    border: '2.5px solid', padding: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 1px 3px rgba(16,24,40,0.18)',
    transition: 'transform .2s, background .25s, border-color .25s',
  },
  pulseRing: {
    position: 'absolute', left: '50%', top: '50%',
    width: 22, height: 22, borderRadius: '50%',
    background: 'rgba(37,99,235,0.45)', pointerEvents: 'none',
  },
  innerDot: { width: 7, height: 7, borderRadius: '50%', background: '#fff' },
  tick: {
    position: 'absolute', left: 0, width: 1.5, height: 12,
    background: BORDER, transform: 'translateX(-50%)', pointerEvents: 'none',
  },
  tickAbove: { top: 50 },
  tickBelow: { top: 84 },
  label: {
    position: 'absolute', left: 0, transform: 'translateX(-50%)',
    maxWidth: 130, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
    fontSize: '0.78rem', fontWeight: 500,
    background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 7,
    padding: '4px 9px', boxShadow: '0 1px 2px rgba(16,24,40,0.04)',
    pointerEvents: 'none',
  },
  labelAbove: { top: 16 },
  labelBelow: { top: 96 },
  menu: {
    position: 'absolute', top: 92, left: 0, transform: 'translateX(-50%)',
    width: 232, background: '#fff', border: `1px solid ${BORDER}`,
    borderRadius: 12, padding: 12, zIndex: 80,
    boxShadow: '0 12px 32px rgba(16,24,40,0.16)',
  },
  menuInput: {
    width: '100%', boxSizing: 'border-box', padding: '8px 10px',
    border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: '0.85rem',
    fontFamily: 'inherit', color: TEXT, outline: 'none', marginBottom: 10,
  },
  statusRow: { display: 'flex', gap: 6, marginBottom: 10 },
  statusBtn: {
    flex: 1, padding: '6px 4px', borderRadius: 7, border: '1px solid',
    fontSize: '0.72rem', fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
    transition: 'all .15s', whiteSpace: 'nowrap',
  },
  menuFooter: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  deleteBtn: {
    background: 'none', border: 'none', color: MUTED,
    fontSize: '0.8rem', cursor: 'pointer', fontFamily: 'inherit',
    padding: '5px 8px', borderRadius: 6,
  },
  doneBtn: {
    background: '#f3f4f6', border: 'none', color: TEXT,
    fontSize: '0.8rem', fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
    padding: '6px 14px', borderRadius: 7,
  },
};
