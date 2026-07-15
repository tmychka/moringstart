import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getSteps, saveSteps } from "../api";
import { fmt, toKey } from "../stepsUtil";

// Compact "log today's steps" card shown under the steps metric label on hover.
export default function StepsQuickPanel({ id, isLeft }) {
  const queryClient = useQueryClient();
  const todayKey = toKey(new Date());
  const { data } = useQuery({
    queryKey: ["steps", id],
    queryFn: () => getSteps(id),
  });
  const goal = typeof data?.goal === "number" ? data.goal : 10000;

  const [draft, setDraft] = useState(0);
  const [saved, setSaved] = useState(false);
  const initialized = useRef(false);

  // Seed the input from today's saved value the first time data is available.
  useEffect(() => {
    if (data && !initialized.current) {
      setDraft(data.entries?.[todayKey] ?? 0);
      initialized.current = true;
    }
  }, [data, todayKey]);

  const value = Number(draft) || 0;
  const reached = value >= goal && value > 0;
  const pct = goal > 0 ? Math.min(100, Math.round((value / goal) * 100)) : 0;

  const saveMut = useMutation({
    mutationFn: (steps) => saveSteps(id, todayKey, steps),
    onSuccess: (res) => {
      queryClient.setQueryData(["steps", id], (prev) => {
        const base = prev ?? { goal, entries: {} };
        const entries = { ...base.entries };
        if (res.steps > 0) entries[todayKey] = res.steps;
        else delete entries[todayKey];
        return { ...base, entries };
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    },
  });

  const save = () => saveMut.mutate(Math.max(0, Math.round(value)));

  const stop = (e) => e.stopPropagation();

  return (
    <div
      className={`absolute top-full mt-2 z-30 flex w-[190px] cursor-default flex-col gap-2.5 rounded-[14px] bg-white p-3.5 ${
        isLeft ? "-left-[13px]" : "right-0"
      }`}
      onClick={stop}
      onMouseDown={stop}
    >
      <div className="text-[0.55rem] font-semibold uppercase tracking-[0.18em] text-black/40">
        Today
      </div>

      <div className="text-[1.05rem] font-normal leading-none tracking-[0.02em] text-slate-900">
        <span className={reached ? "text-teal" : "text-amber-500"}>
          {fmt(value)}
        </span>
        <span className="text-black/35"> / {fmt(goal)}</span>
      </div>

      <div className="h-1 overflow-hidden bg-black/[0.08]">
        <div
          className={`h-full rounded transition-[width,background] duration-200 ease-out ${
            reached ? "bg-teal" : "bg-amber-500"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>

      <input
        type="number"
        min={0}
        value={draft}
        onChange={(e) => setDraft(Number(e.target.value))}
        className="w-full rounded-[10px] border border-black/10 bg-black/[0.03] px-2.5 py-2 text-center text-base font-normal text-slate-900 outline-none"
      />

      <div className="flex gap-2">
        <button
          className="flex-1 rounded-[9px] border border-black/5 bg-transparent py-2 text-[0.65rem] tracking-[0.03em] text-black/60"
          onClick={() => setDraft(goal)}
        >
          Set goal
        </button>
        <button
          className="flex-1 rounded-[9px] border border-black/5 py-2 text-[0.65rem] font-bold tracking-[0.03em] text-navy transition-colors"
          onClick={save}
        >
          {saved ? "Saved ✓" : "Save"}
        </button>
      </div>
    </div>
  );
}
