import { useEffect, useRef, useState } from 'react';
import { getRoadmap, createMilestone, updateMilestone, deleteMilestone } from '../api';

const BLUE = '#2563eb';
const TEXT = '#374151';
const MUTED = '#9ca3af';
const BORDER = '#e5e7eb';
const GREEN = '#16a34a';

const STATUS_META = {
  upcoming: { label: 'Upcoming', color: MUTED, ring: '#cbd5e1' },
  in_progress: { label: 'In progress', color: BLUE, ring: BLUE },
  done: { label: 'Done', color: GREEN, ring: GREEN },
};
const STATUS_ORDER = ['upcoming', 'in_progress', 'done'];

const clamp = (n, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, n));
// Evenly distribute n nodes across the line, with insets so end labels don't clip.
const slotLeft = (index, n) => (n <= 1 ? 50 : 6 + (index / (n - 1)) * 88);

export default function RoadmapTimeline({ id }) {
  const [milestones, setMilestones] = useState([]);
  const [order, setOrder] = useState([]); // milestone ids, in sequence
  const [loaded, setLoaded] = useState(false);
  const [openId, setOpenId] = useState(null); // milestone whose menu is open
  const [titleDraft, setTitleDraft] = useState('');
  const [draggingId, setDraggingId] = useState(null);
  const [dragPct, setDragPct] = useState(null); // live pointer % for dragged node

  const trackRef = useRef(null);
  const dragState = useRef(null); // { id, startX, moved }

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
      }),
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
      if (next) {
        const m = byId(mid);
        setTitleDraft(m ? m.title : '');
      }
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
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
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
    <section
      className="mb-8 rounded-2xl border border-gray-200 bg-white px-[22px] pb-2 pt-5 font-system shadow-[0_1px_3px_rgba(16,24,40,0.06),0_1px_2px_rgba(16,24,40,0.04)]"
      aria-label="Roadmap timeline"
    >
      <header className="mb-2 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="m-0 text-[1.1rem] font-semibold text-gray-900">Roadmap</h2>
          <p className="mb-0 mt-[3px] text-[0.82rem] text-gray-400">
            Arrange your sequence of events and track where you are.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          {total > 0 && (
            <span
              className="inline-flex items-center gap-[7px] whitespace-nowrap rounded-full border border-sky-100 bg-sky-50 px-3 py-[5px] text-[0.78rem] font-medium text-sky-700"
              aria-live="polite"
            >
              <span className="inline-block h-[7px] w-[7px] rounded-full bg-green-600" />
              {doneCount} of {total} stages complete
            </span>
          )}
          <button
            type="button"
            onClick={add}
            className="cursor-pointer rounded-[9px] border-none bg-blue-600 px-3.5 py-2 text-[0.83rem] font-medium text-white transition-colors hover:bg-blue-700"
          >
            + Add task
          </button>
        </div>
      </header>

      <div ref={trackRef} className="relative mt-2 h-[124px] w-full" role="group" aria-label="Timeline track">
        {/* base + progress line */}
        <div className="pointer-events-none absolute left-0 right-0 top-[61px] z-[2] h-1 rounded-full bg-[#eef2f6]" />
        <div
          className="pointer-events-none absolute left-0 top-[61px] z-[3] h-1 rounded-full bg-gradient-to-r from-blue-600 to-blue-500"
          style={{
            width: `${fillPct}%`,
            transition: draggingId ? 'none' : 'width .45s ease',
          }}
        />

        {loaded && n === 0 && (
          <p className="pointer-events-none absolute left-1/2 top-[78px] m-0 w-[90%] -translate-x-1/2 text-center text-[0.82rem] text-gray-400">
            No events yet — add your first one with “Add task”.
          </p>
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
              className="absolute top-0 h-full"
              style={{
                left: `${left}%`,
                zIndex: isOpen ? 60 : isDragging ? 40 : 10,
                transition: isDragging ? 'none' : 'left .3s cubic-bezier(.22,1,.36,1)',
              }}
            >
              {/* label (always above the line) */}
              <span
                className="pointer-events-none absolute left-0 top-4 max-w-[130px] -translate-x-1/2 overflow-hidden text-ellipsis whitespace-nowrap rounded-[7px] border bg-white px-[9px] py-1 text-[0.78rem] font-medium shadow-[0_1px_2px_rgba(16,24,40,0.04)]"
                style={{
                  borderColor: isCurrent ? BLUE : BORDER,
                  color: isCurrent ? BLUE : TEXT,
                }}
              >
                {m.title}
              </span>
              <span className="pointer-events-none absolute left-0 top-[50px] h-3 w-[1.5px] -translate-x-1/2 bg-gray-200" />

              {/* marker button */}
              <button
                type="button"
                aria-label={`${m.title} — ${meta.label}. Use arrow keys to reorder, Enter to edit, Delete to remove.`}
                aria-expanded={isOpen}
                className={`absolute left-0 top-[63px] flex h-[22px] w-[22px] items-center justify-center rounded-full border-[2.5px] p-0 shadow-[0_1px_3px_rgba(16,24,40,0.18)] outline-none transition-[transform,background,border-color] duration-200 hover:brightness-[1.02] focus-visible:shadow-[0_0_0_3px_rgba(37,99,235,.35)] ${
                  isCurrent ? 'animate-rtBlink' : ''
                }`}
                onPointerDown={(e) => onNodePointerDown(e, m.id)}
                onPointerMove={(e) => onNodePointerMove(e, m.id)}
                onPointerUp={(e) => onNodePointerUp(e, m.id)}
                onKeyDown={(e) => onNodeKeyDown(e, m.id)}
                style={{
                  borderColor: meta.ring,
                  background:
                    m.status === 'done' ? GREEN : m.status === 'in_progress' ? BLUE : '#fff',
                  cursor: isDragging ? 'grabbing' : 'grab',
                  transform: isCurrent ? 'translateX(-50%) scale(1.12)' : 'translateX(-50%)',
                }}
              >
                {m.status === 'done' && <CheckIcon />}
                {m.status === 'in_progress' && (
                  <span className="h-[7px] w-[7px] rounded-full bg-white" aria-hidden="true" />
                )}
              </button>

              {/* popover menu */}
              {isOpen && (
                <div
                  className="absolute left-0 top-[92px] z-[80] w-[232px] -translate-x-1/2 rounded-xl border border-gray-200 bg-white p-3 shadow-[0_12px_32px_rgba(16,24,40,0.16)]"
                  style={
                    left > 80
                      ? { left: 'auto', right: 0, transform: 'none' }
                      : left < 20
                        ? { left: 0, transform: 'none' }
                        : {}
                  }
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
                      if (e.key === 'Enter') {
                        commitTitle(m);
                        setOpenId(null);
                      }
                      if (e.key === 'Escape') {
                        setTitleDraft(m.title);
                        setOpenId(null);
                      }
                    }}
                    placeholder="Task title"
                    className="mb-2.5 w-full rounded-lg border border-gray-200 px-2.5 py-2 text-[0.85rem] text-gray-700 outline-none"
                  />
                  <div className="mb-2.5 flex gap-1.5" role="group" aria-label="Set status">
                    {STATUS_ORDER.map((s) => {
                      const sm = STATUS_META[s];
                      const active = m.status === s;
                      return (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setStatus(m, s)}
                          aria-pressed={active}
                          className="flex-1 cursor-pointer whitespace-nowrap rounded-[7px] border px-1 py-1.5 text-[0.72rem] font-medium transition-all"
                          style={{
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
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => remove(m.id)}
                      className="cursor-pointer rounded-md border-none bg-transparent px-2 py-[5px] text-[0.8rem] text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600"
                    >
                      Delete
                    </button>
                    <button
                      type="button"
                      onClick={() => setOpenId(null)}
                      className="cursor-pointer rounded-[7px] border-none bg-gray-100 px-3.5 py-1.5 text-[0.8rem] font-medium text-gray-700"
                    >
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
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#fff"
      strokeWidth="3.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
