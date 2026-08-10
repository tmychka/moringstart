import { useRef, useState, type PointerEvent, type KeyboardEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import {
  getRoadmap,
  createMilestone,
  updateMilestone,
  deleteMilestone,
} from "../api";
import { useTheme } from "../theme";
import type {
  MetricId,
  Milestone,
  MilestoneUpdate,
  RoadmapStatus,
  Theme,
} from "../types";

interface StatusMeta {
  label: string;
  ringClass: string;
  markerClass: string;
  activeClass: string;
  inactiveClass: string;
}

// Blue and green carry the meaning, so they stay fixed across themes — and stay
// saturated where the palettes are muted, which is what marks them as status
// rather than decoration. Only the neutrals come from the palette.
const statusMeta = (t: Theme): Record<RoadmapStatus, StatusMeta> => ({
  upcoming: {
    label: "Upcoming",
    ringClass: "border-slate-400",
    markerClass: t.surface,
    activeClass: "border-slate-400 bg-slate-400 text-white",
    inactiveClass: `bg-transparent ${t.rule} ${t.muted}`,
  },
  in_progress: {
    label: "In progress",
    ringClass: "border-blue-600",
    markerClass: "bg-blue-600",
    activeClass: "border-blue-600 bg-blue-600 text-white",
    inactiveClass: `bg-transparent text-blue-500 ${t.rule}`,
  },
  done: {
    label: "Done",
    ringClass: "border-green-600",
    markerClass: "bg-green-600",
    activeClass: "border-green-600 bg-green-600 text-white",
    inactiveClass: `bg-transparent text-green-500 ${t.rule}`,
  },
});
const STATUS_ORDER: RoadmapStatus[] = ["upcoming", "in_progress", "done"];

const clamp = (n: number, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, n));
// Evenly distribute n nodes across the line, with insets so end labels don't clip.
const slotLeft = (index: number, n: number) =>
  n <= 1 ? 50 : 6 + (index / (n - 1)) * 88;

interface DragState {
  id: number;
  startX: number;
  moved: boolean;
}

interface RoadmapTimelineProps {
  id: MetricId;
}

export default function RoadmapTimeline({ id }: RoadmapTimelineProps) {
  const { t } = useTheme();
  const STATUS_META = statusMeta(t);
  const queryClient = useQueryClient();
  const { data: milestones = [], isSuccess: loaded } = useQuery({
    queryKey: ["roadmap", id],
    queryFn: () => getRoadmap(id),
  });

  // milestone ids, in sequence
  const [order, setOrder] = useState<number[]>([]);
  // milestone whose menu is open
  const [openId, setOpenId] = useState<number | null>(null);
  const [titleDraft, setTitleDraft] = useState("");
  const [draggingId, setDraggingId] = useState<number | null>(null);
  // live pointer % for dragged node
  const [dragPct, setDragPct] = useState<number | null>(null);

  const trackRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<DragState | null>(null);

  // Keep the local sequence in sync with server data without an effect: when the SET of
  // milestone ids changes, preserve the current order for surviving ids and append new
  // ones (by position). Position-only changes (e.g. a reorder we just saved) don't
  // re-sync, so the user's drag order isn't clobbered.
  const [syncedIds, setSyncedIds] = useState<string | null>(null);
  const idsKey = milestones.map((m) => m.id).join(",");
  if (idsKey !== syncedIds) {
    setSyncedIds(idsKey);
    setOrder((prev) => {
      const ids = milestones.map((m) => m.id);
      const kept = prev.filter((mid) => ids.includes(mid));
      const added = milestones
        .filter((m) => !prev.includes(m.id))
        .sort((a, b) => a.position - b.position)
        .map((m) => m.id);
      return [...kept, ...added];
    });
  }

  const byId = (mid: number) => milestones.find((m) => m.id === mid);
  const ordered = order
    .map(byId)
    .filter((m): m is Milestone => m !== undefined);
  const n = ordered.length;
  const total = milestones.length;
  const doneCount = milestones.filter((m) => m.status === "done").length;
  const current = milestones.find((m) => m.status === "in_progress");

  // Progress fill reaches the current node's slot, else the furthest done node, else 0.
  let fillIndex = -1;
  if (current) {
    fillIndex = order.indexOf(current.id);
  } else {
    order.forEach((mid, i) => {
      if (byId(mid)?.status === "done") fillIndex = i;
    });
  }
  const fillPct = fillIndex >= 0 ? slotLeft(fillIndex, n) : 0;

  // ----- helpers -----
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["roadmap", id] });
  const setCache = (updater: (prev: Milestone[]) => Milestone[]) =>
    queryClient.setQueryData<Milestone[]>(["roadmap", id], (prev) =>
      updater(prev ?? [])
    );
  const patchLocal = (mId: number, patch: MilestoneUpdate) =>
    setCache((prev) =>
      prev.map((m) => (m.id === mId ? { ...m, ...patch } : m))
    );

  const updateMut = useMutation({
    mutationFn: ({ mId, body }: { mId: number; body: MilestoneUpdate }) =>
      updateMilestone(id, mId, body),
    onSettled: invalidate,
  });
  const removeMut = useMutation({
    mutationFn: (mid: number) => deleteMilestone(id, mid),
    onSuccess: (_res, mid) =>
      setCache((prev) => prev.filter((m) => m.id !== mid)),
    onSettled: invalidate,
  });
  const addMut = useMutation({
    mutationFn: () =>
      createMilestone(id, { title: "New task", position: order.length }),
    onSuccess: (created) => {
      if (!created?.id) return;
      setCache((prev) => [...prev, created]);
      setOrder((prev) =>
        prev.includes(created.id) ? prev : [...prev, created.id]
      );
      setOpenId(created.id);
      setTitleDraft(created.title);
    },
  });

  // Optimistically patch, then persist; the onSettled refetch reconciles server-side
  // normalization (e.g. only one in-progress node per metric).
  const persist = (mId: number, body: MilestoneUpdate) => {
    patchLocal(mId, body);
    updateMut.mutate({ mId, body });
  };

  const pctFromClientX = (clientX: number): number => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    return clamp(((clientX - rect.left) / rect.width) * 100);
  };

  // Renumber positions to match a sequence order; persist only the ones that moved.
  const persistOrder = (seq: number[]) => {
    const changed = seq.filter((mid, i) => byId(mid)?.position !== i);
    if (changed.length === 0) return;
    setCache((prev) =>
      prev.map((m) => {
        const i = seq.indexOf(m.id);
        return i >= 0 ? { ...m, position: i } : m;
      })
    );
    Promise.all(
      changed.map((mid) =>
        updateMilestone(id, mid, { position: seq.indexOf(mid) })
      )
    ).catch((err: unknown) => {
      toast.error(
        err instanceof Error ? err.message : "Could not save the new order"
      );
      invalidate();
    });
  };

  const add = () => addMut.mutate();

  const setStatus = (m: Milestone, status: RoadmapStatus) =>
    persist(m.id, { status });

  const remove = (mid: number) => {
    removeMut.mutate(mid);
    setOrder((prev) => prev.filter((x) => x !== mid));
    if (openId === mid) setOpenId(null);
  };

  const openMenu = (mid: number) => {
    setOpenId((cur) => {
      const next = cur === mid ? null : mid;
      if (next) {
        const m = byId(mid);
        setTitleDraft(m ? m.title : "");
      }
      return next;
    });
  };

  const commitTitle = (m: Milestone) => {
    const t = titleDraft.trim();
    if (t && t !== m.title) persist(m.id, { title: t });
    else setTitleDraft(m.title);
  };

  const moveInOrder = (mid: number, dir: number) => {
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
  const onNodePointerDown = (
    e: PointerEvent<HTMLButtonElement>,
    mid: number
  ) => {
    if (e.button !== undefined && e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragState.current = { id: mid, startX: e.clientX, moved: false };
  };

  const onNodePointerMove = (
    e: PointerEvent<HTMLButtonElement>,
    mid: number
  ) => {
    const st = dragState.current;
    if (!st || st.id !== mid) return;
    if (!st.moved && Math.abs(e.clientX - st.startX) < 4) return;
    st.moved = true;
    const pct = pctFromClientX(e.clientX);
    if (draggingId !== mid) setDraggingId(mid);
    setDragPct(pct);
    setOrder((prev) => {
      const ci = prev.indexOf(mid);
      const ti = clamp(
        Math.round((pct / 100) * (prev.length - 1)),
        0,
        prev.length - 1
      );
      if (ti === ci) return prev;
      const next = [...prev];
      next.splice(ci, 1);
      next.splice(ti, 0, mid);
      return next;
    });
  };

  const onNodePointerUp = (e: PointerEvent<HTMLButtonElement>, mid: number) => {
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
  const onNodeKeyDown = (e: KeyboardEvent<HTMLButtonElement>, mid: number) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      moveInOrder(mid, e.key === "ArrowLeft" ? -1 : 1);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openMenu(mid);
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      remove(mid);
    } else if (e.key === "Escape") {
      setOpenId(null);
    }
  };

  return (
    <section
      className={`mb-8 rounded-3xl border px-[22px] pb-2 pt-5 font-system ${t.card}`}
      aria-label="Roadmap timeline"
    >
      <header className="mb-2 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="m-0 text-[1.1rem] font-semibold">Roadmap</h2>
          <p className={`mb-0 mt-[3px] text-[0.82rem] ${t.muted}`}>
            Arrange your sequence of events and track where you are.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          {total > 0 && (
            <span
              className={`inline-flex items-center gap-[7px] whitespace-nowrap rounded-full px-3 py-[5px] text-[0.78rem] font-medium ${t.sidebarCard} ${t.body}`}
              aria-live="polite"
            >
              <span className="inline-block h-[7px] w-[7px] rounded-full bg-green-600" />
              {doneCount} of {total} stages complete
            </span>
          )}
          <button
            type="button"
            onClick={add}
            className={`cursor-pointer rounded-xl border-none px-3.5 py-2 text-[0.83rem] font-medium transition-colors ${t.toggleOn}`}
          >
            + Add task
          </button>
        </div>
      </header>

      <div
        ref={trackRef}
        className="relative mt-2 h-[124px] w-full"
        role="group"
        aria-label="Timeline track"
      >
        {/* base + progress line */}
        <div
          className="pointer-events-none absolute left-0 right-0 top-[61px] z-[2] h-1 rounded-full"
          style={{ backgroundColor: t.track }}
        />
        <div
          className="pointer-events-none absolute left-0 top-[61px] z-[3] h-1 rounded-full"
          style={{
            width: `${fillPct}%`,
            backgroundColor: t.accent,
            transition: draggingId ? "none" : "width .45s ease",
          }}
        />

        {loaded && n === 0 && (
          <p
            className={`pointer-events-none absolute left-1/2 top-[78px] m-0 w-[90%] -translate-x-1/2 text-center text-[0.82rem] ${t.muted}`}
          >
            No events yet — add your first one with “Add task”.
          </p>
        )}

        {ordered.map((m, i) => {
          const meta = STATUS_META[m.status] || STATUS_META.upcoming;
          const isCurrent = m.status === "in_progress";
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
                transition: isDragging
                  ? "none"
                  : "left .3s cubic-bezier(.22,1,.36,1)",
              }}
            >
              {/* label (always above the line) */}
              <span
                className={`pointer-events-none absolute left-0 top-4 max-w-[130px] -translate-x-1/2 overflow-hidden text-ellipsis whitespace-nowrap rounded-[7px] border px-[9px] py-1 text-[0.78rem] font-medium ${t.surface} ${
                  isCurrent ? "" : `${t.rule} ${t.body}`
                }`}
                style={
                  isCurrent
                    ? { borderColor: t.accent, color: t.accent }
                    : undefined
                }
              >
                {m.title}
              </span>
              <span
                className="pointer-events-none absolute left-0 top-[50px] h-3 w-[1.5px] -translate-x-1/2"
                style={{ backgroundColor: t.track }}
              />

              {/* marker button */}
              <button
                type="button"
                aria-label={`${m.title} — ${meta.label}. Use arrow keys to reorder, Enter to edit, Delete to remove.`}
                aria-expanded={isOpen}
                className={`absolute left-0 top-[63px] flex h-[22px] w-[22px] -translate-x-1/2 items-center justify-center rounded-full border-[2.5px] p-0 shadow-[0_1px_3px_rgba(16,24,40,0.18)] outline-none transition-[transform,background,border-color] duration-200 hover:brightness-[1.02] focus-visible:shadow-[0_0_0_3px_rgba(37,99,235,.35)] ${meta.ringClass} ${meta.markerClass} ${
                  isCurrent ? "animate-rtBlink scale-[1.12]" : ""
                } ${isDragging ? "cursor-grabbing" : "cursor-grab"}`}
                onPointerDown={(e) => onNodePointerDown(e, m.id)}
                onPointerMove={(e) => onNodePointerMove(e, m.id)}
                onPointerUp={(e) => onNodePointerUp(e, m.id)}
                onKeyDown={(e) => onNodeKeyDown(e, m.id)}
              >
                {m.status === "done" && <CheckIcon />}
                {m.status === "in_progress" && (
                  <span
                    className="h-[7px] w-[7px] rounded-full bg-white"
                    aria-hidden="true"
                  />
                )}
              </button>

              {/* popover menu */}
              {isOpen && (
                <div
                  className={`absolute left-0 top-[92px] z-[80] w-[232px] -translate-x-1/2 rounded-xl border p-3 ${t.popover}`}
                  style={
                    left > 80
                      ? { left: "auto", right: 0, transform: "none" }
                      : left < 20
                        ? { left: 0, transform: "none" }
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
                      if (e.key === "Enter") {
                        commitTitle(m);
                        setOpenId(null);
                      }
                      if (e.key === "Escape") {
                        setTitleDraft(m.title);
                        setOpenId(null);
                      }
                    }}
                    placeholder="Task title"
                    className={`mb-2.5 w-full rounded-lg border px-2.5 py-2 text-[0.85rem] outline-none transition-all ${t.input}`}
                  />
                  <div
                    className="mb-2.5 flex gap-1.5"
                    role="group"
                    aria-label="Set status"
                  >
                    {STATUS_ORDER.map((s) => {
                      const sm = STATUS_META[s];
                      const active = m.status === s;
                      return (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setStatus(m, s)}
                          aria-pressed={active}
                          className={`flex-1 cursor-pointer whitespace-nowrap rounded-[7px] border px-1 py-1.5 text-[0.72rem] font-medium transition-all ${
                            active ? sm.activeClass : sm.inactiveClass
                          }`}
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
                      className={`cursor-pointer rounded-md border-none bg-transparent px-2 py-[5px] text-[0.8rem] transition-colors hover:text-red-500 ${t.muted}`}
                    >
                      Delete
                    </button>
                    <button
                      type="button"
                      onClick={() => setOpenId(null)}
                      className={`cursor-pointer rounded-[7px] border-none px-3.5 py-1.5 text-[0.8rem] font-medium ${t.sidebarCard} ${t.body}`}
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
