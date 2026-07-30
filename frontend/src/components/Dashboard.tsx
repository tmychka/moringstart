import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import { useNavigate } from "react-router-dom";
import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { getMetrics, getNotes, getRoadmap, getSteps, saveSteps } from "../api";
import ManageMetrics from "./ManageMetrics";
import Sidebar, { type QuickLink } from "./Sidebar";
import { fmt, toKey } from "../stepsUtil";
import { summarize, timeAgo, type DaySummary } from "../dashboardStats";
import { cardClass, labelClass, numeralClass, useTheme } from "../theme";
import { readWords } from "../englishWords";
import type { MetricId, Milestone, Note, StepsPayload, Theme } from "../types";

// Mirrors MetricPage: "Learn English" is a generic metric routed by id.
const ENGLISH_METRIC_ID = "2";

const CHART_DAYS = 7;
const WINDOW_DAYS = 30;
// Segments per day column — each one is an eighth of the daily goal.
const SEGMENTS = 8;

// Goal-reached wave: wide enough to leave the card from any corner, and three
// rings launched a beat apart so it reads as a swell rather than one circle.
const WAVE_SIZE = 1800;
const WAVE_DELAYS = [0, 130, 260];

interface Wave {
  id: number;
  x: number;
  y: number;
}

// Today's total renders as a button or as an input depending on the mode; the
// shared class list is what keeps the two indistinguishable.
const bigNumberClass =
  "m-0 block h-full w-auto border-0 bg-transparent p-0 font-sans text-[2.1rem] font-extralight leading-[2.3rem] tracking-[-0.02em] tabular-nums text-current outline-none";

const RING_RADIUS = 54;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

const greetingFor = (hour: number): string => {
  if (hour < 5) return "Good night";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
};

// Re-reads on cross-tab writes; same-tab edits happen on a route that unmounts
// this component, so remounting already picks them up.
function useEnglishWords() {
  const [words, setWords] = useState(readWords);

  useEffect(() => {
    const sync = () => setWords(readWords());
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  return words;
}

function useNow(intervalMs = 30000): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);

  return now;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const now = useNow();
  const words = useEnglishWords();
  const { t, theme, setTheme } = useTheme();
  const queryClient = useQueryClient();
  const [showManage, setShowManage] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [waves, setWaves] = useState<Wave[]>([]);
  const waveId = useRef(0);

  const { data: metrics = [] } = useQuery({
    queryKey: ["metrics"],
    queryFn: getMetrics,
  });

  const stepsMetrics = metrics.filter((m) => m.type === "steps");
  const notebookMetrics = metrics.filter((m) => m.type === "notebook");

  // Query keys match the per-metric pages, so the cache is shared both ways.
  const stepsQueries = useQueries({
    queries: stepsMetrics.map((m) => ({
      queryKey: ["steps", String(m.id)],
      queryFn: () => getSteps(m.id),
    })),
  });
  const notesQueries = useQueries({
    queries: notebookMetrics.map((m) => ({
      queryKey: ["notes", String(m.id)],
      queryFn: () => getNotes(m.id),
    })),
  });
  const roadmapQueries = useQueries({
    queries: notebookMetrics.map((m) => ({
      queryKey: ["roadmap", String(m.id)],
      queryFn: () => getRoadmap(m.id),
    })),
  });

  const stepsByMetric = new Map<string, StepsPayload | undefined>(
    stepsMetrics.map((m, i) => [String(m.id), stepsQueries[i]?.data])
  );
  const notesByMetric = new Map<string, Note[]>(
    notebookMetrics.map((m, i) => [String(m.id), notesQueries[i]?.data ?? []])
  );
  const roadmapByMetric = new Map<string, Milestone[]>(
    notebookMetrics.map((m, i) => [String(m.id), roadmapQueries[i]?.data ?? []])
  );

  // The dashboard headlines a single steps tracker — the first one defined.
  const primary = stepsMetrics[0];
  const primarySteps = primary ? stepsByMetric.get(String(primary.id)) : null;
  const goal = typeof primarySteps?.goal === "number" ? primarySteps.goal : 0;
  const entries = useMemo(() => primarySteps?.entries ?? {}, [primarySteps]);

  const todayKey = toKey(now);
  const todaySteps = entries[todayKey] ?? 0;
  const progress = goal > 0 ? Math.min(todaySteps / goal, 1) : 0;

  const stats = useMemo(
    () => summarize(entries, goal, WINDOW_DAYS, now),
    // `now` ticks every 30s; the window only needs to change when the day does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entries, goal, todayKey]
  );
  const week = stats.window.slice(-CHART_DAYS);

  const notebook = notebookMetrics[0];
  const milestones = notebook
    ? roadmapByMetric.get(String(notebook.id))
    : undefined;
  const notes = notebook ? notesByMetric.get(String(notebook.id)) : undefined;

  // Today's number doubles as the input: click to edit, Enter to save. Writes go
  // to the same cache entry the metric page reads, painted optimistically so the
  // ring and the week below react on the keystroke rather than on the response.
  const saveMut = useMutation({
    mutationFn: (vars: { id: MetricId; date: string; steps: number }) =>
      saveSteps(vars.id, vars.date, vars.steps),
    onError: (_error, vars) =>
      queryClient.invalidateQueries({ queryKey: ["steps", String(vars.id)] }),
  });

  const commitSteps = (next: number) => {
    if (!primary) return;
    const value = Math.max(0, Math.round(next) || 0);

    queryClient.setQueryData<StepsPayload>(
      ["steps", String(primary.id)],
      (prev) => {
        const base = prev ?? { goal, entries: {} };
        const nextEntries = { ...base.entries };
        if (value > 0) nextEntries[todayKey] = value;
        else delete nextEntries[todayKey];
        return { ...base, entries: nextEntries };
      }
    );
    saveMut.mutate({ id: primary.id, date: todayKey, steps: value });
  };

  const startEditing = () => {
    if (!primary) return;
    setDraft(todaySteps ? String(todaySteps) : "");
    setEditing(true);
  };

  const commitDraft = () => {
    setEditing(false);
    const value = draft === "" ? 0 : Number(draft);
    if (!Number.isFinite(value) || value === todaySteps) return;
    commitSteps(value);
  };

  const dropWave = (id: number) =>
    setWaves((prev) => prev.filter((wave) => wave.id !== id));

  // Double-clicking the card is the "done for today" gesture: the goal lands in
  // one go and a wave rolls out from wherever the pointer was.
  const completeGoal = (event: MouseEvent<HTMLElement>) => {
    if (!primary || goal <= 0 || editing) return;
    const box = event.currentTarget.getBoundingClientRect();
    setWaves((prev) => [
      ...prev,
      {
        id: waveId.current++,
        x: event.clientX - box.left,
        y: event.clientY - box.top,
      },
    ]);
    if (todaySteps !== goal) commitSteps(goal);
  };

  const hasSteps = Boolean(primary);
  const todayHint = !hasSteps
    ? "No steps tracker yet"
    : todaySteps === 0
      ? "Nothing logged yet today"
      : todaySteps >= goal
        ? "Goal reached"
        : `${fmt(goal - todaySteps)} steps to go`;

  // Shortcuts to the pages the dashboard already summarises; each one is only
  // offered when the metric behind it exists.
  const quickLinks: QuickLink[] = [
    ...(primary
      ? [
          {
            icon: "activity" as const,
            label: "Steps",
            to: `/metric/${primary.id}`,
          },
        ]
      : []),
    ...(notebook
      ? [
          {
            icon: "notes" as const,
            label: "Notes",
            to: `/metric/${notebook.id}`,
          },
        ]
      : []),
    ...(metrics.some((m) => String(m.id) === ENGLISH_METRIC_ID)
      ? [
          {
            icon: "book" as const,
            label: "Vocabulary",
            to: `/metric/${ENGLISH_METRIC_ID}`,
          },
        ]
      : []),
  ];

  return (
    <div
      className={`relative flex h-full w-full overflow-hidden transition-colors duration-300 ${t.page}`}
    >
      <Sidebar
        t={t}
        theme={theme}
        onTheme={setTheme}
        metrics={metrics}
        onOpenMetric={(id) => navigate(`/metric/${id}`)}
        onManageMetrics={() => setShowManage(true)}
        onNavigate={navigate}
        quickLinks={quickLinks}
      />

      <div className="h-full flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-3 px-6 pb-16 pt-8 sm:px-8">
          <Header now={now} t={t} />

          <div className="grid grid-cols-12 gap-3">
            <section
              className={`${cardClass(t)} relative col-span-12 select-none overflow-hidden transition-shadow duration-300`}
              onDoubleClick={completeGoal}
              style={
                waves.length > 0
                  ? { boxShadow: `0 0 0 1px ${t.accent}` }
                  : undefined
              }
            >
              {waves.map((wave) => (
                <span
                  key={wave.id}
                  aria-hidden
                  className="pointer-events-none absolute inset-0 overflow-hidden"
                >
                  {WAVE_DELAYS.map((delay, i) => (
                    <span
                      key={delay}
                      className="goal-wave absolute rounded-full"
                      style={{
                        left: wave.x - WAVE_SIZE / 2,
                        top: wave.y - WAVE_SIZE / 2,
                        width: WAVE_SIZE,
                        height: WAVE_SIZE,
                        border: `1px solid ${t.accent}`,
                        animationDelay: `${delay}ms`,
                      }}
                      onAnimationEnd={
                        i === WAVE_DELAYS.length - 1
                          ? () => dropWave(wave.id)
                          : undefined
                      }
                    />
                  ))}
                </span>
              ))}

              <div className="flex flex-wrap items-center gap-5">
                <ProgressRing progress={progress} muted={!hasSteps} t={t} />
                <div className="min-w-0">
                  <p className={labelClass(t)}>Today</p>
                  {/* Both states share one fixed-height slot and identical type
                      metrics, so switching into edit mode doesn't nudge the card. */}
                  <div className="mt-2 h-[2.3rem]">
                    {editing ? (
                      <input
                        autoFocus
                        type="text"
                        inputMode="numeric"
                        value={draft}
                        aria-label="Steps logged today"
                        onChange={(event) =>
                          setDraft(event.target.value.replace(/\D/g, ""))
                        }
                        onKeyDown={(event) => {
                          if (event.key === "Enter") commitDraft();
                          if (event.key === "Escape") setEditing(false);
                        }}
                        onBlur={commitDraft}
                        style={{
                          width: `${Math.max(draft.length, 1) + 0.6}ch`,
                        }}
                        className={`${bigNumberClass} select-text caret-current`}
                      />
                    ) : (
                      <button
                        type="button"
                        disabled={!hasSteps}
                        onClick={startEditing}
                        title="Click to edit · double-click the card to hit the goal"
                        className={`${bigNumberClass} text-left transition-opacity ${
                          hasSteps ? "cursor-text hover:opacity-60" : ""
                        }`}
                      >
                        {hasSteps ? fmt(todaySteps) : "—"}
                      </button>
                    )}
                  </div>
                  <p className={`m-0 mt-2 truncate text-[0.78rem] ${t.body}`}>
                    {editing ? "Enter to save · Esc to cancel" : todayHint}
                  </p>
                  {hasSteps && (
                    <p className={`m-0 mt-1 text-[0.7rem] ${t.muted}`}>
                      Goal {fmt(goal)}
                    </p>
                  )}
                </div>

                {/* Sits beside the ring on wide cards, drops to its own line
                    once the phone layout runs out of room. */}
                <div
                  className={`w-full shrink-0 sm:ml-auto sm:w-auto sm:border-l sm:pl-5 sm:text-right ${t.rule}`}
                >
                  <p className={labelClass(t)}>Daily avg</p>
                  <p
                    className={`m-0 mt-2 text-[1.8rem] leading-none ${numeralClass}`}
                  >
                    {stats.average ? fmt(stats.average) : "—"}
                  </p>
                  <p className={`m-0 mt-2 text-[0.7rem] ${t.muted}`}>
                    {WINDOW_DAYS}-day window
                  </p>
                </div>
              </div>

              <div className={`mt-5 border-t pt-4 ${t.rule}`}>
                <div className="flex items-baseline justify-between gap-3">
                  <p className={labelClass(t)}>Last {CHART_DAYS} days</p>
                  <p className={`m-0 text-[0.7rem] ${t.muted}`}>
                    {stats.best
                      ? `Best ${fmt(stats.best.steps)} · ${WINDOW_DAYS}-day total ${fmt(stats.total)}`
                      : "No entries yet"}
                  </p>
                </div>
                <WeekBreakdown days={week} goal={goal} today={todayKey} t={t} />
              </div>
            </section>

            <Roadmap
              t={t}
              className="col-span-12 md:col-span-4"
              milestones={milestones}
              onOpen={
                notebook ? () => navigate(`/metric/${notebook.id}`) : undefined
              }
            />
            <Stat
              t={t}
              className="col-span-6 md:col-span-4"
              label="Vocabulary"
              value={words.length}
              hint={
                words.length
                  ? words
                      .slice(0, 2)
                      .map((w) => w.term)
                      .join(" · ")
                  : "No words saved"
              }
              onClick={() => navigate(`/metric/${ENGLISH_METRIC_ID}`)}
            />
            <Stat
              t={t}
              className="col-span-6 md:col-span-4"
              label="Notes"
              value={notes?.length ?? 0}
              hint={
                notes?.length
                  ? `Updated ${timeAgo(notes[0].updated_at, now)}`
                  : "Nothing written yet"
              }
              onClick={
                notebook ? () => navigate(`/metric/${notebook.id}`) : undefined
              }
            />
          </div>
        </div>
      </div>

      {showManage && <ManageMetrics onClose={() => setShowManage(false)} />}
    </div>
  );
}

function Header({ now, t }: { now: Date; t: Theme }) {
  const date = now.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const time = now.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <header
      className={`flex items-end justify-between gap-4 border-b pb-4 ${t.rule}`}
    >
      <div className="min-w-0">
        <p className={labelClass(t)}>{date}</p>
        <h1 className={`m-0 mt-2 text-[1.7rem] leading-none ${numeralClass}`}>
          {greetingFor(now.getHours())}
        </h1>
      </div>
      <div className="flex shrink-0 items-center gap-4">
        <p
          className={`m-0 text-[1.7rem] leading-none ${t.faint} ${numeralClass}`}
        >
          {time}
        </p>
      </div>
    </header>
  );
}

function Meter({ ratio, t }: { ratio: number; t: Theme }) {
  return (
    <div
      className="mt-3 h-1 w-full overflow-hidden rounded-full"
      style={{ backgroundColor: t.track }}
    >
      <div
        className="h-full rounded-full transition-[width] duration-700 ease-out"
        style={{ width: `${ratio * 100}%`, backgroundColor: t.accent }}
      />
    </div>
  );
}

interface StatProps {
  label: string;
  value: ReactNode;
  hint: ReactNode;
  className?: string;
  onClick?: () => void;
  t: Theme;
}

function Stat({ label, value, hint, className = "", onClick, t }: StatProps) {
  const body = (
    <>
      <p className={labelClass(t)}>{label}</p>
      <p className={`m-0 mt-2 text-[1.8rem] leading-none ${numeralClass}`}>
        {value}
      </p>
      <p className={`m-0 mt-2 truncate text-[0.7rem] ${t.muted}`}>{hint}</p>
    </>
  );

  // Stats sit next to much taller cards in the bento grid, so the body is
  // centred rather than pinned to the top of a stretched cell.
  const layout = "flex flex-col justify-center";

  if (!onClick) {
    return (
      <section className={`${cardClass(t)} ${className} ${layout}`}>
        {body}
      </section>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`${cardClass(t)} ${className} ${layout} w-full cursor-pointer text-left transition-colors ${t.cardHover}`}
    >
      {body}
    </button>
  );
}

function ProgressRing({
  progress,
  muted,
  t,
}: {
  progress: number;
  muted: boolean;
  t: Theme;
}) {
  return (
    <div className="relative shrink-0">
      <svg viewBox="0 0 120 120" className="h-[98px] w-[98px] -rotate-90">
        <circle
          cx="60"
          cy="60"
          r={RING_RADIUS}
          fill="none"
          stroke={t.track}
          strokeWidth="6"
        />
        {!muted && (
          <circle
            cx="60"
            cy="60"
            r={RING_RADIUS}
            fill="none"
            stroke={t.accent}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={RING_LENGTH}
            strokeDashoffset={RING_LENGTH * (1 - progress)}
            style={{
              transition: "stroke-dashoffset 700ms cubic-bezier(.22,.61,.36,1)",
            }}
          />
        )}
      </svg>
      <span
        className={`absolute inset-0 grid place-items-center text-[1.05rem] ${numeralClass}`}
      >
        {muted ? "—" : `${Math.round(progress * 100)}%`}
      </span>
    </div>
  );
}

interface WeekBreakdownProps {
  days: DaySummary[];
  goal: number;
  today: string;
  t: Theme;
}

// Each day is a stack of segments rather than one solid bar: a segment is a
// fixed slice of the goal, so a column can be read as "six of eight" without
// looking at the axis, and one runaway day can't squash the rest of the week.
// Filled segments brighten towards the top, which gives the week its silhouette
// even before the numbers are read.
function WeekBreakdown({ days, goal, today, t }: WeekBreakdownProps) {
  const scale = goal > 0 ? goal : Math.max(...days.map((d) => d.steps), 1);

  return (
    <div className="mt-4 flex items-end justify-between gap-2 sm:gap-3">
      {days.map((day) => {
        const ratio = Math.min(day.steps / scale, 1);
        // Anything logged earns a segment, so a light day never reads as empty.
        const filled = day.steps
          ? Math.max(1, Math.round(ratio * SEGMENTS))
          : 0;
        const hit = goal > 0 && day.steps >= goal;
        const isToday = day.key === today;

        return (
          <div
            key={day.key}
            title={`${day.key} — ${day.steps ? `${fmt(day.steps)} steps` : "no entry"}`}
            className="flex max-w-[80px] flex-1 flex-col items-center gap-2 rounded-[10px] px-1 py-2"
            style={isToday ? { backgroundColor: t.track } : undefined}
          >
            <span
              className={`whitespace-nowrap text-[0.62rem] ${numeralClass} ${
                day.steps ? t.body : t.faint
              }`}
            >
              {day.steps ? fmt(day.steps) : "—"}
            </span>

            <div className="flex w-full max-w-[46px] flex-col-reverse gap-[3px]">
              {Array.from({ length: SEGMENTS }, (_, i) => {
                const lit = i < filled;
                return (
                  <span
                    key={i}
                    className="h-[6px] rounded-[2px] transition-colors duration-500"
                    style={{
                      backgroundColor: lit
                        ? hit
                          ? t.accent
                          : t.accentSoft
                        : t.track,
                      opacity: lit ? 0.55 + (0.45 * (i + 1)) / SEGMENTS : 0.28,
                    }}
                  />
                );
              })}
            </div>

            <span
              className={`text-[0.62rem] ${isToday ? "" : t.faint}`}
              style={isToday ? { color: t.accent } : undefined}
            >
              {day.date.toLocaleDateString("en-GB", { weekday: "short" })}
            </span>
          </div>
        );
      })}
    </div>
  );
}

interface RoadmapProps {
  milestones: Milestone[] | undefined;
  onOpen?: () => void;
  className?: string;
  t: Theme;
}

function Roadmap({ milestones, onOpen, className = "", t }: RoadmapProps) {
  const total = milestones?.length ?? 0;
  const done = milestones?.filter((m) => m.status === "done").length ?? 0;
  const current = milestones?.find((m) => m.status === "in_progress");

  const body = (
    <>
      <div className="flex items-baseline justify-between gap-3">
        <p className={labelClass(t)}>Roadmap</p>
        {total > 0 && (
          <p className={`m-0 text-[0.7rem] ${t.muted}`}>
            {Math.round((done / total) * 100)}%
          </p>
        )}
      </div>
      {total === 0 || !milestones ? (
        <p className={`m-0 mt-2 text-[0.78rem] ${t.muted}`}>
          No milestones yet
        </p>
      ) : (
        <>
          <p className={`m-0 mt-2 text-[1.8rem] leading-none ${numeralClass}`}>
            {done}
            <span className={`ml-2 text-[0.8rem] ${t.muted}`}>of {total}</span>
          </p>
          <MilestoneTrack milestones={milestones} t={t} />
          <p
            className={`m-0 mt-2 flex items-center gap-2 truncate text-[0.7rem] ${t.muted}`}
          >
            {current ? (
              <>
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: t.progressDot }}
                />
                <span className="truncate">{current.title}</span>
              </>
            ) : (
              "Nothing in progress"
            )}
          </p>
        </>
      )}
    </>
  );

  const layout = "flex flex-col justify-center";

  if (!onOpen) {
    return (
      <section className={`${cardClass(t)} ${className} ${layout}`}>
        {body}
      </section>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`${cardClass(t)} ${className} ${layout} w-full cursor-pointer text-left transition-colors ${t.cardHover}`}
    >
      {body}
    </button>
  );
}

// One pill per milestone reads the roadmap at a glance; long roadmaps would
// shear into slivers, so those fall back to a plain progress bar.
function MilestoneTrack({
  milestones,
  t,
}: {
  milestones: Milestone[];
  t: Theme;
}) {
  const done = milestones.filter((m) => m.status === "done").length;

  if (milestones.length > 14) {
    return <Meter ratio={done / milestones.length} t={t} />;
  }

  return (
    <div className="mt-3 flex gap-1">
      {milestones.map((m, i) => (
        <span
          key={m.id ?? i}
          className="h-1.5 flex-1 rounded-full transition-colors duration-500"
          style={{
            backgroundColor:
              m.status === "done"
                ? t.accent
                : m.status === "in_progress"
                  ? t.accentSoft
                  : t.track,
          }}
        />
      ))}
    </div>
  );
}
