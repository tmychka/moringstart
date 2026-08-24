/**
 * What the body map reads out: the presets behind the status and mode pickers,
 * and the arithmetic that turns two series of daily numbers into a direction.
 *
 * Kept apart from the component because none of it needs React — a trend is a
 * function of the entries and the day, and reading it that way keeps the panel
 * to layout.
 */
import { lastNDays } from "./dashboardStats";
import { toKey } from "./stepsUtil";
import type { ProfileMode } from "./types";

/** Days the trend charts cover. Two weeks: long enough for a direction to show
 *  through a bad day, short enough that a fortnight-old habit isn't still
 *  weighing on today's reading. */
export const TREND_DAYS = 14;

/**
 * One-click statuses. The field takes anything typed into it — these are the
 * ones worth not typing, in the order a day tends to run.
 */
export const STATUS_PRESETS = [
  "Working",
  "Learning",
  "Training",
  "Reading",
  "Resting",
  "Eat",
  "Helper",
  "English",
  "Steps",
] as const;

/** What each mode means on the scale, in the picker's order. */
export const MODE_COPY: Record<ProfileMode, { label: string; hint: string }> = {
  cut: { label: "Cut", hint: "losing weight" },
  maintain: { label: "Maintain", hint: "holding weight" },
  bulk: { label: "Bulk", hint: "gaining weight" },
};

export type Direction = "up" | "down" | "flat";

/** Which way the scale is supposed to be moving in each mode. */
const MODE_INTENT: Record<ProfileMode, Direction> = {
  cut: "down",
  maintain: "flat",
  bulk: "up",
};

export type Verdict = "on-track" | "stalled" | "off-track" | "unknown";

/** One day of a series. `value` of 0 means nothing was logged, not a zero. */
export interface Point {
  date: Date;
  key: string;
  value: number;
}

/** The last `days` days of an entry map, oldest first. */
export const series = (
  entries: Record<string, number>,
  days: number,
  today: Date
): Point[] =>
  lastNDays(days, today).map((date) => {
    const key = toKey(date);
    return { date, key, value: entries[key] ?? 0 };
  });

export interface Trend {
  direction: Direction;
  /** Second half's average minus the first half's, in the series' own unit. */
  delta: number;
  /** The same change as a share of the first half; 0 with nothing to divide by. */
  ratio: number;
  /** Days with a reading, across the whole window. */
  logged: number;
}

const mean = (values: number[]): number =>
  values.reduce((sum, value) => sum + value, 0) / values.length;

/**
 * Which way a series is going: the second half of the window against the first,
 * rather than last-value-minus-first, so one heavy day or one skipped morning
 * doesn't set the direction on its own.
 *
 * `flatBand` is how big a relative change has to be before it counts as a
 * direction at all — everything under it is noise and reads as flat. Unlogged
 * days are left out of both averages: a day off the scale is a missing reading,
 * not a weight of zero.
 */
export function trend(points: Point[], flatBand: number): Trend {
  const mid = Math.floor(points.length / 2);
  const valuesIn = (slice: Point[]) =>
    slice.filter((p) => p.value > 0).map((p) => p.value);

  const earlier = valuesIn(points.slice(0, mid));
  const later = valuesIn(points.slice(mid));
  const logged = earlier.length + later.length;

  // One half empty leaves nothing to compare against, which is not the same as
  // having compared and found no movement — but it reads the same on the chart.
  if (earlier.length === 0 || later.length === 0) {
    return { direction: "flat", delta: 0, ratio: 0, logged };
  }

  const before = mean(earlier);
  const delta = mean(later) - before;
  const ratio = before > 0 ? delta / before : 0;

  return {
    direction: Math.abs(ratio) < flatBand ? "flat" : delta > 0 ? "up" : "down",
    delta,
    ratio,
    logged,
  };
}

/** A day's step count swings enough that under 6% either way is still flat. */
export const STEPS_FLAT_BAND = 0.06;
/** Body weight moves in much smaller relative steps — 0.5% is ~0.4 kg at 80. */
export const WEIGHT_FLAT_BAND = 0.005;

/**
 * Whether the scale agrees with the mode. Needs both halves of the window to
 * have a reading before it will call anything, so an empty week says "unknown"
 * rather than "on track".
 */
export function weightVerdict(t: Trend, mode: ProfileMode): Verdict {
  if (t.logged < 2 || (t.delta === 0 && t.ratio === 0)) return "unknown";
  if (t.direction === MODE_INTENT[mode]) return "on-track";
  // Not moving is progress only when not moving is the plan; under cut or bulk
  // it is the plan not working yet, which is worth saying differently from
  // actively going the wrong way.
  if (t.direction === "flat") return "stalled";
  return "off-track";
}

const VERDICT_COPY: Record<Verdict, string> = {
  "on-track": "on track",
  stalled: "stalled",
  "off-track": "off track",
  unknown: "not enough readings",
};

export const verdictLabel = (verdict: Verdict): string => VERDICT_COPY[verdict];

/** kg to one decimal, which is as fine as a bathroom scale is honest. */
export const kg = (value: number): string => value.toFixed(1);

/** Local time of day for a status entry; the backend stores UTC with a space. */
export const clockOf = (at: string): Date =>
  new Date(`${String(at).replace(" ", "T")}Z`);

/**
 * Local midnight written the way the backend stores its timestamps — UTC, with
 * a space instead of the T. Sent alongside a status so the server can compare
 * an entry's time against the start of *this* day rather than guessing at one.
 */
export const dayStartStamp = (now: Date): string =>
  new Date(now.getFullYear(), now.getMonth(), now.getDate())
    .toISOString()
    .slice(0, 19)
    .replace("T", " ");

export interface Span {
  id: number;
  status: string;
  /** Minutes since local midnight. */
  from: number;
  to: number;
}

export interface StatusRow {
  id: number;
  status: string;
  at: string;
}

/**
 * How long a local day actually is, in minutes.
 *
 * Not the 1440 it is on all but two days a year: the clocks go forward in March
 * and back in October, and on those days a strip drawn against a fixed 1440
 * would put the evening past its own right-hand edge, or stop an hour short of
 * it. Measured from the day's own midnights, which handles both.
 */
export const minutesInDay = (day: Date): number => {
  const start = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  const end = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);
  return (end.getTime() - start.getTime()) / 60000;
};

/**
 * One local day's status log as spans across that day. Each entry runs until
 * the next one starts, and the last runs to the end of the day — or to now, if
 * the day has not got there yet. That is what makes a strip read as a day
 * rather than as a row of pins.
 *
 * A day is built only from entries stamped inside it: a status set last night
 * does not bleed into this morning. It means a day you never touched reads as
 * empty rather than as whatever you last happened to say, which is the honest
 * of the two — the log records when you told it something, not what was true
 * while you were asleep.
 */
export function spansForDay(log: StatusRow[], day: Date, now: Date): Span[] {
  const start = new Date(
    day.getFullYear(),
    day.getMonth(),
    day.getDate()
  ).getTime();
  // Built by date parts rather than by adding 24 hours, so the two days a year
  // that are 23 or 25 hours long still end where they actually end.
  const nextMidnight = new Date(
    day.getFullYear(),
    day.getMonth(),
    day.getDate() + 1
  ).getTime();
  if (now.getTime() <= start) return [];

  // Bounded by the day itself rather than by `now`, which is read off a clock
  // that only ticks every half minute: an entry written a moment ago is often
  // stamped a few seconds *after* the `now` this is holding, and filtering by it
  // would drop the write until the next tick. Pressing Stop would then do
  // nothing visible for up to thirty seconds.
  const starts = log
    .map((entry) => ({
      id: entry.id,
      status: entry.status,
      at: clockOf(entry.at).getTime(),
    }))
    .filter((entry) => entry.at >= start && entry.at < nextMidnight)
    // The id breaks a tie on the second: two statuses set inside the same
    // second are stamped identically, and without this they come out in
    // whatever order the log happened to arrive in — which is newest first,
    // exactly backwards.
    .sort((a, b) => a.at - b.at || a.id - b.id);
  if (starts.length === 0) return [];

  // Where the last span stops: now, or the newest entry when that clock is
  // behind it. Never past the day's own end.
  const edge = Math.min(
    nextMidnight,
    Math.max(now.getTime(), starts[starts.length - 1].at)
  );

  return (
    starts
      .map((entry, i) => ({
        id: entry.id,
        status: entry.status,
        from: (entry.at - start) / 60000,
        to: ((i + 1 < starts.length ? starts[i + 1].at : edge) - start) / 60000,
      }))
      // A blank entry is a stop: it ends whatever was running — which the line
      // above has already done, by being the next entry's start — and draws
      // nothing of its own. Dropped here rather than filtered out of the log,
      // because it is only useful for the boundary it provides.
      .filter((span) => span.status !== "")
  );
}

/**
 * Today's newest entry, or null on a day nothing was set.
 *
 * What undo works on, rather than the last drawn span: a stop draws nothing and
 * still has to be takeable back.
 */
export function lastEntryToday(log: StatusRow[], now: Date): StatusRow | null {
  const start = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  ).getTime();
  // Bounded by the day, not by `now`, for the same reason `spansForDay` is: a
  // just-written entry can sit seconds ahead of the clock this holds, and it is
  // exactly the entry Stop and Undo are being asked about.
  const nextMidnight = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1
  ).getTime();
  const today = log
    .filter((entry) => {
      const at = clockOf(entry.at).getTime();
      return at >= start && at < nextMidnight;
    })
    .sort((a, b) => clockOf(a.at).getTime() - clockOf(b.at).getTime());
  return today.length > 0 ? today[today.length - 1] : null;
}

/** Today, by the same rule — the strip beside the picker. */
export const todaySpans = (log: StatusRow[], now: Date): Span[] =>
  spansForDay(log, now, now);

export interface StatusTotal {
  status: string;
  minutes: number;
}

/**
 * Where the day actually went, longest first.
 *
 * The same status set twice with something else between it counts once, added
 * up — what you want to know at the end of a day is how long you worked, not
 * how many times you said so. The block still running is included as it stands,
 * so the tally is true at every hour rather than only after midnight.
 */
export function statusTotals(spans: Span[]): StatusTotal[] {
  const byStatus = new Map<string, number>();
  for (const span of spans) {
    const minutes = Math.max(0, span.to - span.from);
    byStatus.set(span.status, (byStatus.get(span.status) ?? 0) + minutes);
  }

  return [...byStatus]
    .map(([status, minutes]) => ({ status, minutes: Math.round(minutes) }))
    .filter((total) => total.minutes > 0)
    .sort((a, b) => b.minutes - a.minutes);
}
