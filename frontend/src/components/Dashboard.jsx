import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueries, useQuery } from "@tanstack/react-query";
import { getMetrics, getNotes, getRoadmap, getSteps } from "../api";
import { fmt, toKey } from "../stepsUtil";
import {
  bestStreak,
  currentStreak,
  summarize,
  timeAgo,
} from "../dashboardStats";

// Mirrors MetricPage: "Learn English" is a generic metric routed by id.
const ENGLISH_METRIC_ID = "2";
const ENGLISH_STORAGE_KEY = "english-words";
const THEME_STORAGE_KEY = "dashboard-theme";

const CHART_DAYS = 14;
const WINDOW_DAYS = 30;
const DAY_INITIALS = ["M", "T", "W", "T", "F", "S", "S"];

const RING_RADIUS = 54;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

// Every colour the dashboard uses lives here, so a new theme is one more entry
// rather than a sweep through the markup. Class strings style elements; plain
// hex/rgba values feed SVG attributes and inline styles.
const THEMES = {
  light: {
    page: "bg-white bg-[radial-gradient(120%_90%_at_50%_0%,#f4f7f6_0%,#ffffff_58%)] text-[#16171a]",
    card: "border-[#eceef1] bg-white/80",
    cardHover: "hover:border-[#d7dae0]",
    rule: "border-[#eceef1]",
    label: "text-[#a6abb2]",
    muted: "text-[#a6abb2]",
    body: "text-[#6b7076]",
    faint: "text-[#c3c7cd]",
    rowHover: "hover:bg-[#f4f6f6]",
    outlineBtn:
      "border-[#134e4a] text-[#134e4a] hover:border-[#0736ab] hover:text-[#0736ab]",
    toggleOn: "bg-[#134e4a] text-white",
    toggleOff: "bg-transparent text-[#a6abb2] hover:text-[#16171a]",
    accent: "#134e4a",
    accentSoft: "rgba(19,78,74,0.28)",
    track: "#eceef1",
    goalLine: "rgba(19,78,74,0.25)",
    progressDot: "#2563eb",
  },
  dark: {
    page: "bg-navy bg-[radial-gradient(120%_90%_at_50%_0%,#13203a_0%,#0a0f1e_58%)] text-white",
    card: "border-white/[0.08] bg-white/[0.03]",
    cardHover: "hover:border-white/25",
    rule: "border-white/10",
    label: "text-white/35",
    muted: "text-white/40",
    body: "text-white/60",
    faint: "text-white/25",
    rowHover: "hover:bg-white/[0.05]",
    outlineBtn:
      "border-[#2dd4bf] text-[#2dd4bf] hover:border-white hover:text-white",
    toggleOn: "bg-[#2dd4bf] text-[#0a0f1e]",
    toggleOff: "bg-transparent text-white/40 hover:text-white",
    accent: "#2dd4bf",
    accentSoft: "rgba(45,212,191,0.3)",
    track: "rgba(255,255,255,0.09)",
    goalLine: "rgba(45,212,191,0.3)",
    progressDot: "#60a5fa",
  },
};

const numeralClass = "font-extralight tracking-[-0.02em] tabular-nums";
const labelClass = (t) =>
  `m-0 text-[0.6rem] uppercase tracking-[0.2em] ${t.label}`;
const cardClass = (t) => `rounded-3xl border p-4 ${t.card}`;

const greetingFor = (hour) => {
  if (hour < 5) return "Good night";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
};

const readEnglishWords = () => {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(ENGLISH_STORAGE_KEY) ?? "[]"
    );
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((w) => typeof w?.term === "string");
  } catch {
    return [];
  }
};

const readTheme = () => {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    // Storage can be blocked; fall through to the OS preference.
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
};

// Re-reads on cross-tab writes; same-tab edits happen on a route that unmounts
// this component, so remounting already picks them up.
function useEnglishWords() {
  const [words, setWords] = useState(readEnglishWords);

  useEffect(() => {
    const sync = () => setWords(readEnglishWords());
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  return words;
}

function useTheme() {
  const [theme, setTheme] = useState(readTheme);

  useEffect(() => {
    // The carousel dots are painted over this page but rendered outside it, so
    // they read the active theme from a custom property on the root element.
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Persisting is best-effort; the choice still applies for this session.
    }
  }, [theme]);

  return [theme, setTheme];
}

function useNow(intervalMs = 30000) {
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
  const [theme, setTheme] = useTheme();
  const t = THEMES[theme];

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

  const stepsByMetric = new Map(
    stepsMetrics.map((m, i) => [String(m.id), stepsQueries[i]?.data])
  );
  const notesByMetric = new Map(
    notebookMetrics.map((m, i) => [String(m.id), notesQueries[i]?.data ?? []])
  );
  const roadmapByMetric = new Map(
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
  const streak = currentStreak(entries, goal, now);
  const record = bestStreak(entries, goal);

  const chart = stats.window.slice(-CHART_DAYS);
  const chartMax = Math.max(goal, ...chart.map((d) => d.steps), 1);

  const notebook = notebookMetrics[0];
  const milestones = notebook
    ? roadmapByMetric.get(String(notebook.id))
    : undefined;
  const notes = notebook ? notesByMetric.get(String(notebook.id)) : undefined;

  const hasSteps = Boolean(primary);
  const todayHint = !hasSteps
    ? "No steps tracker yet"
    : todaySteps === 0
      ? "Nothing logged yet today"
      : todaySteps >= goal
        ? "Goal reached"
        : `${fmt(goal - todaySteps)} steps to go`;

  const metricSubtitle = (metric) => {
    const id = String(metric.id);
    if (id === ENGLISH_METRIC_ID)
      return `${words.length} ${words.length === 1 ? "word" : "words"}`;
    if (metric.type === "steps") {
      const days = Object.keys(stepsByMetric.get(id)?.entries ?? {}).length;
      return `${days} ${days === 1 ? "day" : "days"} logged`;
    }
    if (metric.type === "notebook") {
      const count = notesByMetric.get(id)?.length ?? 0;
      const done =
        roadmapByMetric.get(id)?.filter((m) => m.status === "done").length ?? 0;
      return `${count} ${count === 1 ? "note" : "notes"} · ${done} done`;
    }
    return "Not tracked yet";
  };

  return (
    <div
      className={`h-full w-full overflow-y-auto transition-colors duration-300 ${t.page}`}
    >
      <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-3 px-6 pb-16 pt-8 sm:px-8">
        <Header now={now} t={t} theme={theme} onTheme={setTheme} />

        <div className="grid grid-cols-12 gap-3">
          <section
            className={`${cardClass(t)} col-span-12 flex items-center gap-5 md:col-span-5`}
          >
            <ProgressRing progress={progress} muted={!hasSteps} t={t} />
            <div className="min-w-0">
              <p className={labelClass(t)}>Today</p>
              <p
                className={`m-0 mt-2 text-[2.1rem] leading-none ${numeralClass}`}
              >
                {hasSteps ? fmt(todaySteps) : "—"}
              </p>
              <p className={`m-0 mt-2 truncate text-[0.78rem] ${t.body}`}>
                {todayHint}
              </p>
              {hasSteps && (
                <p className={`m-0 mt-1 text-[0.7rem] ${t.muted}`}>
                  Goal {fmt(goal)}
                </p>
              )}
            </div>
          </section>

          <Stat
            t={t}
            className="col-span-6 md:col-span-2"
            label="Streak"
            value={hasSteps ? streak : "—"}
            hint={hasSteps ? `Best ${record}` : "No data"}
          />
          <Stat
            t={t}
            className="col-span-6 md:col-span-2"
            label="Daily avg"
            value={stats.average ? fmt(stats.average) : "—"}
            hint={`${WINDOW_DAYS}-day window`}
          />
          <section className={`${cardClass(t)} col-span-12 md:col-span-3`}>
            <p className={labelClass(t)}>Goal hit rate</p>
            <p
              className={`m-0 mt-2 text-[1.8rem] leading-none ${numeralClass}`}
            >
              {stats.loggedDays ? `${Math.round(stats.hitRate * 100)}%` : "—"}
            </p>
            <Meter ratio={stats.hitRate} t={t} />
            <p className={`m-0 mt-2 text-[0.7rem] ${t.muted}`}>
              {stats.hitDays} of {stats.loggedDays} logged days
            </p>
          </section>

          <section className={`${cardClass(t)} col-span-12 md:col-span-8`}>
            <div className="flex items-baseline justify-between gap-3">
              <p className={labelClass(t)}>Last {CHART_DAYS} days</p>
              <p className={`m-0 text-[0.7rem] ${t.muted}`}>
                {stats.best
                  ? `Best ${fmt(stats.best.steps)} · ${WINDOW_DAYS}-day total ${fmt(stats.total)}`
                  : "No entries yet"}
              </p>
            </div>
            <StepsChart
              days={chart}
              max={chartMax}
              goal={goal}
              today={todayKey}
              t={t}
            />
          </section>

          <Stat
            t={t}
            className="col-span-6 md:col-span-2"
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
            className="col-span-6 md:col-span-2"
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

          <section className={`${cardClass(t)} col-span-12 md:col-span-5`}>
            <p className={labelClass(t)}>Roadmap</p>
            <Roadmap
              milestones={milestones}
              t={t}
              onOpen={
                notebook ? () => navigate(`/metric/${notebook.id}`) : undefined
              }
            />
          </section>

          <section
            className={`${cardClass(t)} col-span-12 md:col-span-7 flex flex-col`}
          >
            <p className={labelClass(t)}>All metrics</p>
            <ul className="m-0 mt-3 grid list-none grid-cols-1 gap-1 p-0 sm:grid-cols-2">
              {metrics.map((metric) => (
                <li key={metric.id}>
                  <button
                    type="button"
                    onClick={() => navigate(`/metric/${metric.id}`)}
                    className={`flex w-full items-center justify-between gap-3 rounded-xl border-none bg-transparent px-3 py-1.5 text-left transition-colors ${t.rowHover}`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[0.83rem] font-medium tracking-[0.01em]">
                        {metric.name}
                      </span>
                      <span
                        className={`block truncate text-[0.68rem] ${t.muted}`}
                      >
                        {metricSubtitle(metric)}
                      </span>
                    </span>
                    <span className={`text-[0.8rem] ${t.faint}`}>→</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}

function Header({ now, t, theme, onTheme }) {
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
        <ThemeToggle theme={theme} onTheme={onTheme} t={t} />
      </div>
    </header>
  );
}

function ThemeToggle({ theme, onTheme, t }) {
  const options = [
    { value: "light", glyph: "☀", label: "Light background" },
    { value: "dark", glyph: "☾", label: "Dark background" },
  ];

  return (
    <div
      role="group"
      aria-label="Background"
      className={`flex items-center gap-0.5 rounded-full border p-0.5 ${t.card}`}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onTheme(option.value)}
          aria-label={option.label}
          aria-pressed={theme === option.value}
          className={`h-7 w-7 cursor-pointer rounded-full border-none text-[0.75rem] leading-none transition-colors ${
            theme === option.value ? t.toggleOn : t.toggleOff
          }`}
        >
          {option.glyph}
        </button>
      ))}
    </div>
  );
}

function Meter({ ratio, t }) {
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

function Stat({ label, value, hint, className = "", onClick, t }) {
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

function ProgressRing({ progress, muted, t }) {
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

function StepsChart({ days, max, goal, today, t }) {
  const goalRatio = goal > 0 ? Math.min(goal / max, 1) : 0;

  return (
    <div className="mt-4">
      <div className="relative flex h-[92px] items-end gap-[3px]">
        {goalRatio > 0 && (
          <div
            className="pointer-events-none absolute inset-x-0 border-t border-dashed"
            style={{
              bottom: `${goalRatio * 100}%`,
              borderTopColor: t.goalLine,
            }}
          />
        )}
        {days.map((day) => {
          const hit = goal > 0 && day.steps >= goal;
          return (
            <div
              key={day.key}
              title={`${day.key} — ${day.steps ? `${fmt(day.steps)} steps` : "no entry"}`}
              className="flex-1 rounded-t-[3px] transition-[height] duration-500 ease-out"
              style={{
                height: `${Math.max((day.steps / max) * 100, day.steps ? 2 : 0)}%`,
                minHeight: day.steps ? undefined : "2px",
                backgroundColor: day.steps
                  ? hit
                    ? t.accent
                    : t.accentSoft
                  : t.track,
              }}
            />
          );
        })}
      </div>
      <div className="mt-2 flex gap-[3px]">
        {days.map((day) => (
          <span
            key={day.key}
            className={`flex-1 text-center text-[0.6rem] ${t.faint}`}
            style={day.key === today ? { color: t.accent } : undefined}
          >
            {DAY_INITIALS[(day.date.getDay() + 6) % 7]}
          </span>
        ))}
      </div>
    </div>
  );
}

function Roadmap({ milestones, onOpen, t }) {
  if (!milestones?.length) {
    return (
      <p className={`m-0 mt-3 text-[0.78rem] ${t.muted}`}>No milestones yet</p>
    );
  }

  const done = milestones.filter((m) => m.status === "done").length;
  const current = milestones.find((m) => m.status === "in_progress");

  return (
    <>
      <div className="mt-2 flex items-baseline gap-2">
        <span className={`text-[1.8rem] leading-none ${numeralClass}`}>
          {done}
        </span>
        <span className={`text-[0.8rem] ${t.muted}`}>
          of {milestones.length} done
        </span>
      </div>
      <Meter ratio={done / milestones.length} t={t} />
      <p className={`m-0 mt-3 truncate text-[0.78rem] ${t.body}`}>
        {current ? (
          <>
            <span
              className="mr-2 inline-block h-1.5 w-1.5 rounded-full align-middle"
              style={{ backgroundColor: t.progressDot }}
            />
            {current.title}
          </>
        ) : (
          "Nothing in progress"
        )}
      </p>
      {onOpen && (
        <button
          type="button"
          onClick={onOpen}
          className={`mt-3 cursor-pointer rounded-lg border bg-transparent px-3 py-1.5 text-[0.6rem] uppercase tracking-[0.18em] transition-colors ${t.outlineBtn}`}
        >
          Open
        </button>
      )}
    </>
  );
}
