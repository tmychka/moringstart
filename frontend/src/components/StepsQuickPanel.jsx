import { useEffect, useRef, useState } from 'react';
import { getSteps, saveSteps } from '../api';
import { fmt, toKey } from '../stepsUtil';

const ACCENT = '#2dd4bf'; // teal — goal reached
const AMBER = '#f59e0b'; // almost there

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
      className={`absolute top-full mt-2 z-30 flex w-[190px] cursor-default flex-col gap-2.5 rounded-[14px] bg-white p-3.5 ${
        isLeft ? '-left-[13px]' : 'right-0'
      }`}
      onClick={stop}
      onMouseDown={stop}
    >
      <div className="text-[0.55rem] font-semibold uppercase tracking-[0.18em] text-black/40">
        Today
      </div>

      <div className="text-[1.05rem] font-normal leading-none tracking-[0.02em] text-slate-900">
        <span style={{ color: reached ? ACCENT : AMBER }}>{fmt(Number(draft) || 0)}</span>
        <span className="text-black/35"> / {fmt(goal)}</span>
      </div>

      <div className="h-1 overflow-hidden bg-black/[0.08]">
        <div
          className="h-full rounded transition-[width,background] duration-200 ease-out"
          style={{ width: `${pct}%`, background: reached ? ACCENT : AMBER }}
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
          {saved ? 'Saved ✓' : 'Save'}
        </button>
      </div>
    </div>
  );
}
