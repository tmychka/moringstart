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
// Evenly distribute n nodes across the line, with insets so end labels don't clip.
const slotLeft = (index, n) => (n <= 1 ? 50 : 6 + (index / (n - 1)) * 88);

export default function RoadmapTimeline({ id }) {
  const [milestones, setMilestones] = useState([]);
  const [order, setOrder] = useState([]);          // milestone ids, in sequence
  const [loaded, setLoaded] = useState(false);
  const [openId, setOpenId] = useState(null);       // milestone whose menu is open
  const [titleDraft, setTitleDraft] = useState('');
  const [draggingId, setDraggingId] = useState(null);
  const [dragPct, setDragPct] = useState(null);     // live pointer % for dragged node

  const trackRef = useRef(null);
  const dragState = useRef(null);                   // { id, startX, moved }

  useEffect(() => {
    getRoadmap(id).then((rows) => {
      const list = Array.isArray(rows) ? rows : [];
      setMilestones(list);
      setOrder(list.map((r) => r.id));
      setLoaded(true);
    });
  }, [id]);

  const byId = (mid) => milestones.find((m) => m.id === mid);
  const ordered = order.map(byId).filter(Boolean);
  const n = ordered.length;
  const total = milestones.length;
  const doneCount = milestones.filter((m) => m.status === 'done').length;
  const current = milestones.find((m) => m.status === 'in_progress');

  // Progress fill reaches the current node's slot, else the furthest done node, else 0.
  let fillIndex = -1;
  if (current) {
    fillIndex = order.indexOf(current.id);
  } else {
    order.forEach((mid, i) => {
      if (byId(mid)?.status === 'done') fillIndex = i;
    });
  }
  const fillPct = fillIndex >= 0 ? slotLeft(fillIndex, n) : 0;

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

  // Renumber positions to match a sequence order; persist only the ones that moved.
  const persistOrder = (seq) => {
    seq.forEach((mid, i) => {
      if (byId(mid)?.position !== i) updateMilestone(id, mid, { position: i });
    });
    setMilestones((prev) =>
      prev.map((m) => {
        const i = seq.indexOf(m.id);
        return i >= 0 && m.position !== i ? { ...m, position: i } : m;
      })
    );
  };

  const add = async () => {
    const created = await createMilestone(id, { title: 'New task', position: order.length });
    if (created && created.id) {
      setMilestones((prev) => [...prev, created]);
      setOrder((prev) => [...prev, created.id]);
      setOpenId(created.id);
      setTitleDraft(created.title);
    }
  };

  const setStatus = (m, status) => persist(m.id, { status });

  const remove = async (mid) => {
    await deleteMilestone(id, mid);
    setMilestones((prev) => prev.filter((m) => m.id !== mid));
    setOrder((prev) => prev.filter((x) => x !== mid));
    if (openId === mid) setOpenId(null);
  };

  const openMenu = (mid) => {
    setOpenId((cur) => {
      const next = cur === mid ? null : mid;
      if (next) { const m = byId(mid); setTitleDraft(m ? m.title : ''); }
      return next;
    });
  };

  const commitTitle = (m) => {
    const t = titleDraft.trim();
    if (t && t !== m.title) persist(m.id, { title: t });
    else setTitleDraft(m.title);
  };

  const moveInOrder = (mid, dir) => {
    const ci = order.indexOf(mid);
    const ni = clamp(ci + dir, 0, order.length - 1);
    if (ni === ci) return;
    const next = [...order];
    next.splice(ci, 1);
    next.splice(ni, 0, mid);
    setOrder(next);
    persistOrder(next);
  };

  // ----- drag to reorder (pointer events) -----
  const onNodePointerDown = (e, mid) => {
    if (e.button !== undefined && e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragState.current = { id: mid, startX: e.clientX, moved: false };
  };

  const onNodePointerMove = (e, mid) => {
    const st = dragState.current;
    if (!st || st.id !== mid) return;
    if (!st.moved && Math.abs(e.clientX - st.startX) < 4) return;
    st.moved = true;
    const pct = pctFromClientX(e.clientX);
    if (draggingId !== mid) setDraggingId(mid);
    setDragPct(pct);
    setOrder((prev) => {
      const ci = prev.indexOf(mid);
      const ti = clamp(Math.round((pct / 100) * (prev.length - 1)), 0, prev.length - 1);
      if (ti === ci) return prev;
      const next = [...prev];
      next.splice(ci, 1);
      next.splice(ti, 0, mid);
      return next;
    });
  };

  const onNodePointerUp = (e, mid) => {
    const st = dragState.current;
    dragState.current = null;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
    if (!st) return;
    if (st.moved) {
      setDraggingId(null);
      setDragPct(null);
      persistOrder(order);
    } else {
      openMenu(mid);
    }
  };

  // ----- keyboard -----
  const onNodeKeyDown = (e, mid) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      moveInOrder(mid, e.key === 'ArrowLeft' ? -1 : 1);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openMenu(mid);
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      remove(mid);
    } else if (e.key === 'Escape') {
      setOpenId(null);
    }
  };

  return (
    <section style={styles.card} aria-label="Roadmap timeline">
      <style>{keyframes}</style>

      <header style={styles.header}>
        <div>
          <h2 style={styles.heading}>Roadmap</h2>
          <p style={styles.sub}>Arrange your sequence of events and track where you are.</p>
        </div>
        <div style={styles.headerRight}>
          {total > 0 && (
            <span style={styles.progressPill} aria-live="polite">
              <span style={styles.progressDot} />
              {doneCount} of {total} stages complete
            </span>
          )}
          <button type="button" onClick={add} style={styles.addBtn} className="rt-add">
            + Add task
          </button>
        </div>
      </header>

      <div ref={trackRef} style={styles.track} role="group" aria-label="Timeline track">
        {/* base + progress line */}
        <div style={styles.baseLine} />
        <div style={{ ...styles.fillLine, width: `${fillPct}%`, transition: draggingId ? 'none' : 'width .45s ease' }} />

        {loaded && n === 0 && (
          <p style={styles.emptyHint}>No events yet — add your first one with “Add task”.</p>
        )}

        {ordered.map((m, i) => {
          const meta = STATUS_META[m.status] || STATUS_META.upcoming;
          const isCurrent = m.status === 'in_progress';
          const isOpen = openId === m.id;
          const isDragging = draggingId === m.id;
          const left = isDragging && dragPct != null ? dragPct : slotLeft(i, n);

          return (
            <div
              key={m.id}
              style={{
                ...styles.nodeWrap,
                left: `${left}%`,
                zIndex: isOpen ? 60 : isDragging ? 40 : 10,
                transition: isDragging ? 'none' : 'left .3s cubic-bezier(.22,1,.36,1)',
              }}
            >
              {/* label (always above the line) */}
              <span
                style={{
                  ...styles.label,
                  borderColor: isCurrent ? BLUE : BORDER,
                  color: isCurrent ? BLUE : TEXT,
                }}
              >
                {m.title}
              </span>
              <span style={styles.tick} />

              {/* marker button */}
              <button
                type="button"
                aria-label={`${m.title} — ${meta.label}. Use arrow keys to reorder, Enter to edit, Delete to remove.`}
                aria-expanded={isOpen}
                className={`rt-node${isCurrent ? ' rt-current' : ''}`}
                onPointerDown={(e) => onNodePointerDown(e, m.id)}
                onPointerMove={(e) => onNodePointerMove(e, m.id)}
                onPointerUp={(e) => onNodePointerUp(e, m.id)}
                onKeyDown={(e) => onNodeKeyDown(e, m.id)}
                style={{
                  ...styles.marker,
                  borderColor: meta.ring,
                  background: m.status === 'done' ? GREEN : m.status === 'in_progress' ? BLUE : '#fff',
                  cursor: isDragging ? 'grabbing' : 'grab',
                  transform: isCurrent ? 'translateX(-50%) scale(1.12)' : 'translateX(-50%)',
                }}
              >
                {m.status === 'done' && <CheckIcon />}
                {m.status === 'in_progress' && <span style={styles.innerDot} aria-hidden="true" />}
              </button>

              {/* popover menu */}
              {isOpen && (
                <div
                  style={{
                    ...styles.menu,
                    ...(left > 80 ? { left: 'auto', right: 0, transform: 'none' }
                      : left < 20 ? { left: 0, transform: 'none' }
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
@keyframes rtBlink {
  0%, 100% { opacity: 1;   box-shadow: 0 0 0 0 rgba(37,99,235,.55); }
  50%      { opacity: .4;  box-shadow: 0 0 0 7px rgba(37,99,235,0); }
}
.rt-current { animation: rtBlink 1.15s ease-in-out infinite; }
.rt-node  { outline: none; }
.rt-node:focus-visible { box-shadow: 0 0 0 3px rgba(37,99,235,.35); }
.rt-node:hover { filter: brightness(1.02); }
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
  innerDot: { width: 7, height: 7, borderRadius: '50%', background: '#fff' },
  tick: {
    position: 'absolute', left: 0, top: 50, width: 1.5, height: 12,
    background: BORDER, transform: 'translateX(-50%)', pointerEvents: 'none',
  },
  label: {
    position: 'absolute', left: 0, top: 16, transform: 'translateX(-50%)',
    maxWidth: 130, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
    fontSize: '0.78rem', fontWeight: 500,
    background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 7,
    padding: '4px 9px', boxShadow: '0 1px 2px rgba(16,24,40,0.04)',
    pointerEvents: 'none',
  },
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
