import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getSteps, saveGoal, saveSteps } from "../api";
import { fmt, toKey } from "../stepsUtil";

const CHIPS = [5, 6, 7, 8, 9, 10, 12, 15];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const sliderClass =
  "flex-1 h-1 appearance-none rounded bg-black/10 outline-none " +
  "[&::-webkit-slider-thumb]:h-[18px] [&::-webkit-slider-thumb]:w-[18px] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-teal [&::-webkit-slider-thumb]:shadow-[0_0_0_4px_rgba(45,212,191,0.18)] " +
  "[&::-moz-range-thumb]:h-[18px] [&::-moz-range-thumb]:w-[18px] [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-none [&::-moz-range-thumb]:bg-teal";

const numberClass =
  "[&::-webkit-outer-spin-button]:m-0 [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:m-0 [&::-webkit-inner-spin-button]:appearance-none";

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
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ["steps", id],
    queryFn: () => getSteps(id),
  });
  const serverGoal = typeof data?.goal === "number" ? data.goal : 10000;
  const entries = data?.entries ?? {};

  const [goalDraft, setGoalDraft] = useState(null); // non-null only while dragging the slider
  const goal = goalDraft ?? serverGoal;
  const [weekOffset, setWeekOffset] = useState(0);
  const [editing, setEditing] = useState(null); // { key, label }
  const [draft, setDraft] = useState(0);

  const setStepsCache = (updater) =>
    queryClient.setQueryData(["steps", id], (prev) =>
      updater(prev ?? { goal: 10000, entries: {} })
    );

  const goalMut = useMutation({
    mutationFn: (g) => saveGoal(id, g),
    onError: () => queryClient.invalidateQueries({ queryKey: ["steps", id] }),
  });
  const stepsMut = useMutation({
    mutationFn: ({ date, steps }) => saveSteps(id, date, steps),
    onError: () => queryClient.invalidateQueries({ queryKey: ["steps", id] }),
  });

  const commitGoal = (g) => {
    const clamped = Math.max(1000, Math.min(20000, g));
    setGoalDraft(null);
    setStepsCache((prev) => ({ ...prev, goal: clamped }));
    goalMut.mutate(clamped);
  };

  const today = new Date();
  const todayKey = toKey(today);
  const weekStart = addDays(startOfWeek(today), weekOffset * 7);
  const weekEnd = addDays(weekStart, 6);
  const days = WEEKDAYS.map((_, i) => addDays(weekStart, i));

  const rangeLabel = `${weekStart.getDate()} ${MONTHS[weekStart.getMonth()]} — ${weekEnd.getDate()} ${MONTHS[weekEnd.getMonth()]}`;
  const stateLabel =
    weekOffset === 0
      ? "Current week"
      : weekOffset > 0
        ? "Upcoming week"
        : "Finished week";
  const finished = weekOffset < 0;

  const dayStatus = (key) => {
    const steps = entries[key];
    if (steps == null || steps <= 0) return "none";
    return steps >= goal ? "done" : "almost";
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
    const date = editing.key;
    setStepsCache((prev) => {
      const nextEntries = { ...prev.entries };
      if (steps > 0) nextEntries[date] = steps;
      else delete nextEntries[date];
      return { ...prev, entries: nextEntries };
    });
    stepsMut.mutate({ date, steps });
    setEditing(null);
  };

  return (
    <div className="relative h-screen min-h-screen w-screen overflow-y-auto bg-white font-sans text-black">
      <button
        onClick={() => navigate("/")}
        className="absolute left-7 top-7 z-20 cursor-pointer border-none bg-transparent p-0 text-[0.65rem] uppercase tracking-[0.18em] text-black/25 transition-colors hover:text-black/60"
      >
        ← Back
      </button>

      <div className="mx-auto flex max-w-[720px] flex-col gap-14 px-6 pb-16 pt-24">
        <section className="flex flex-col items-center gap-[22px]">
          <div className="text-[0.65rem] font-light uppercase tracking-[0.3em] text-black/40">
            Daily goal
          </div>
          <div className="flex items-end gap-3.5 text-[4rem] font-extralight leading-none tracking-[0.02em] text-slate-900">
            {fmt(goal)}
            <span className="pb-2 text-[0.8rem] font-normal tracking-[0.06em] text-black/35">
              steps / day
            </span>
          </div>

          <div className="flex flex-wrap justify-center gap-2">
            {CHIPS.map((k) => {
              const active = goal === k * 1000;
              return (
                <button
                  key={k}
                  onClick={() => commitGoal(k * 1000)}
                  className={`cursor-pointer rounded-full border px-4 py-[7px] text-[0.8rem] tracking-[0.04em] transition-all ${
                    active
                      ? "border-teal bg-teal font-semibold text-slate-900"
                      : "border-black/15 bg-transparent text-black/55"
                  }`}
                >
                  {k}k
                </button>
              );
            })}
          </div>

          <div className="flex w-full max-w-[440px] items-center gap-3.5">
            <span className="text-[0.65rem] tracking-[0.1em] text-black/30">
              1k
            </span>
            <input
              type="range"
              min={1}
              max={20}
              step={1}
              value={Math.round(goal / 1000)}
              onChange={(e) => setGoalDraft(Number(e.target.value) * 1000)}
              onMouseUp={(e) => commitGoal(Number(e.target.value) * 1000)}
              onTouchEnd={(e) => commitGoal(Number(e.target.value) * 1000)}
              className={sliderClass}
            />
            <span className="text-[0.65rem] tracking-[0.1em] text-black/30">
              20k
            </span>
          </div>
        </section>

        {/* ---- Week ---- */}
        <section className="flex flex-col gap-[18px]">
          <div className="flex items-center justify-between">
            <button
              className="h-[38px] w-[38px] cursor-pointer rounded-xl border border-teal-dim bg-transparent text-[1.2rem] text-teal-dim"
              onClick={() => setWeekOffset((o) => o - 1)}
            >
              ‹
            </button>
            <div className="flex flex-col gap-1 text-center">
              <div className="text-[1rem] font-light tracking-[0.04em] text-slate-900">
                {rangeLabel}
              </div>
              <div
                className={`text-[0.6rem] uppercase tracking-[0.2em] ${
                  finished ? "text-black/40" : "text-black/55"
                }`}
              >
                {stateLabel}
              </div>
            </div>
            <button
              className="h-[38px] w-[38px] cursor-pointer rounded-xl border border-teal-dim bg-transparent text-[1.2rem] text-teal-dim"
              onClick={() => setWeekOffset((o) => o + 1)}
            >
              ›
            </button>
          </div>

          <div
            className={`grid grid-cols-7 gap-2 transition-[opacity,filter] duration-300 ${
              finished ? "opacity-[0.42] [filter:saturate(0.6)]" : ""
            }`}
          >
            {days.map((d, i) => {
              const key = toKey(d);
              const isToday = key === todayKey;
              const isFuture = key > todayKey;
              const status = dayStatus(key);
              const markClass =
                status === "done"
                  ? "bg-teal text-slate-900"
                  : status === "almost"
                    ? "bg-amber-500 text-slate-900"
                    : "bg-black/5 text-black/30";
              const mark =
                status === "done" ? "✓" : status === "almost" ? "◔" : "–";
              return (
                <button
                  key={key}
                  disabled={isFuture}
                  onClick={() => !isFuture && openEditor(d, key)}
                  className={`flex flex-col items-center gap-2 rounded-[14px] bg-black/[0.02] px-1 py-3 transition-all ${
                    isFuture
                      ? "cursor-default opacity-35"
                      : "cursor-pointer opacity-100"
                  } ${isToday ? "border border-black/45" : "border border-black/[0.08]"}`}
                >
                  <span className="text-[0.58rem] uppercase tracking-[0.12em] text-black/40">
                    {WEEKDAYS[i]}
                  </span>
                  <span className="text-[0.95rem] font-light text-slate-900">
                    {d.getDate()}
                  </span>
                  <span
                    className={`flex h-[26px] w-[26px] items-center justify-center rounded-full text-[0.8rem] font-bold ${markClass}`}
                  >
                    {mark}
                  </span>
                  <span className="min-h-[0.7rem] text-[0.55rem] tracking-[0.02em] text-black/40">
                    {entries[key] ? fmt(entries[key]) : ""}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* ---- Legend ---- */}
        <section className="flex flex-wrap justify-center gap-6 text-[0.65rem] uppercase tracking-[0.1em] text-black/45">
          <span className="flex items-center gap-2">
            <i className="inline-block h-2.5 w-2.5 rounded-full bg-teal" /> goal
            reached
          </span>
          <span className="flex items-center gap-2">
            <i className="inline-block h-2.5 w-2.5 rounded-full bg-amber-500" />{" "}
            almost
          </span>
          <span className="flex items-center gap-2">
            <i className="inline-block h-2.5 w-2.5 rounded-full bg-black/[0.18]" />{" "}
            no data
          </span>
        </section>
      </div>

      {/* ---- Editor ---- */}
      {editing && (
        <div
          className="fixed inset-0 z-30 flex items-center justify-center bg-black/65 [backdrop-filter:blur(6px)]"
          onClick={() => setEditing(null)}
        >
          <div
            className="flex w-80 max-w-[90vw] flex-col gap-[18px] rounded-2xl border border-teal-dim bg-[#0d1526] p-7 shadow-[0_0_40px_rgba(45,212,191,0.08)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-[0.7rem] font-semibold uppercase tracking-[0.15em] text-teal">
              {editing.label}
            </div>

            <input
              type="number"
              min={0}
              value={draft}
              onChange={(e) => setDraft(Number(e.target.value))}
              autoFocus
              className={`w-full rounded-xl border border-white/15 bg-white/[0.06] px-4 py-3 text-center text-[1.6rem] font-extralight text-white outline-none ${numberClass}`}
            />

            <div className="text-center text-[0.8rem] tracking-[0.03em]">
              {draft >= goal ? (
                <span className="text-teal">✓ Goal reached</span>
              ) : (
                <span className="text-amber-400">
                  ◔ {fmt(Math.max(0, goal - Math.round(draft || 0)))} steps to
                  goal
                </span>
              )}
            </div>

            <div className="flex gap-2">
              <button
                className="flex-1 cursor-pointer rounded-[10px] border border-white/10 bg-white/5 py-[9px] text-[0.72rem] tracking-[0.03em] text-white/80"
                onClick={() => setDraft(goal)}
              >
                Set goal
              </button>
              <button
                className="flex-1 cursor-pointer rounded-[10px] border border-white/10 bg-white/5 py-[9px] text-[0.72rem] tracking-[0.03em] text-white/80"
                onClick={() => setDraft((v) => (Number(v) || 0) + 1000)}
              >
                +1000
              </button>
              <button
                className="flex-1 cursor-pointer rounded-[10px] border border-white/10 bg-white/5 py-[9px] text-[0.72rem] tracking-[0.03em] text-white/80"
                onClick={() =>
                  setDraft((v) => Math.max(0, (Number(v) || 0) - 1000))
                }
              >
                −1000
              </button>
            </div>

            <div className="mt-1 flex gap-2">
              <button
                className="flex-1 cursor-pointer rounded-[10px] border border-white/[0.12] bg-transparent py-[11px] text-[0.8rem] tracking-[0.04em] text-white/50"
                onClick={() => setDraft(0)}
              >
                Clear
              </button>
              <button
                className="flex-[2] cursor-pointer rounded-[10px] border-none bg-teal-dim py-[11px] text-[0.8rem] font-semibold tracking-[0.04em] text-white transition-colors hover:bg-teal"
                onClick={saveDraft}
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
