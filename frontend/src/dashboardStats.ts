import { toKey } from "./stepsUtil";
import type { StepEntries } from "./types";

const startOfDay = (d: Date): Date =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate());

export const addDays = (d: Date, n: number): Date => {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
};

const fromKey = (key: string): Date => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
};

// SQLite writes `datetime('now')`, i.e. UTC with a space separator and no zone
// marker — which browsers would otherwise read as local time.
export const parseSqlDate = (value: string): Date =>
  new Date(`${String(value).replace(" ", "T")}Z`);

export function timeAgo(value: string, now: Date = new Date()): string {
  const then = parseSqlDate(value);
  if (Number.isNaN(then.getTime())) return "";
  const minutes = Math.round((now.getTime() - then.getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.round(days / 30)}mo ago`;
}

// `count` days ending on `today`, oldest first.
export function lastNDays(count: number, today: Date = new Date()): Date[] {
  const end = startOfDay(today);
  return Array.from({ length: count }, (_, i) => addDays(end, i - count + 1));
}

/**
 * The Monday of the week `date` falls in. Monday because that is where the week
 * starts here — a Sunday-first week would put the weekend either side of the
 * working days and make a "quiet weekend" impossible to see as one block.
 */
export function startOfWeek(date: Date = new Date()): Date {
  const day = startOfDay(date);
  // getDay() is Sunday-first, so Sunday (0) is six days into the week, not none.
  return addDays(day, -((day.getDay() + 6) % 7));
}

/**
 * `count` whole calendar weeks ending with the one `today` is in, oldest first
 * — Monday to Sunday, every time.
 *
 * The last week runs to its Sunday rather than to today, so the grid it fills
 * keeps seven columns and every column is one weekday all the way down. Days
 * still ahead come back as dates, and it is for the caller to draw them as days
 * that have not happened rather than as days with nothing in them.
 */
export function lastNWeeks(count: number, today: Date = new Date()): Date[] {
  const first = addDays(startOfWeek(today), -7 * (count - 1));
  return Array.from({ length: count * 7 }, (_, i) => addDays(first, i));
}

// Consecutive goal-hitting days ending today. A blank today does not break the
// streak — the day isn't over yet, so counting resumes from yesterday.
export function currentStreak(
  entries: StepEntries,
  goal: number,
  today: Date = new Date()
): number {
  // A non-positive goal makes every day a "hit", which would walk backwards
  // forever. It only happens before the goal has loaded, so report no streak.
  if (!(goal > 0)) return 0;

  let cursor = startOfDay(today);
  if ((entries[toKey(cursor)] ?? 0) < goal) cursor = addDays(cursor, -1);

  let streak = 0;
  while ((entries[toKey(cursor)] ?? 0) >= goal) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

export function bestStreak(entries: StepEntries, goal: number): number {
  if (!(goal > 0)) return 0;

  const hits = Object.keys(entries)
    .filter((key) => entries[key] >= goal)
    .sort();

  let best = 0;
  let run = 0;
  let prev: Date | null = null;
  for (const key of hits) {
    // Comparing via keys rather than millisecond deltas keeps this correct
    // across daylight-saving boundaries, where a "day" is 23 or 25 hours.
    run = prev && toKey(addDays(prev, 1)) === key ? run + 1 : 1;
    if (run > best) best = run;
    prev = fromKey(key);
  }
  return best;
}

/** One day of the rolling window. */
export interface DaySummary {
  date: Date;
  key: string;
  steps: number;
}

export interface StepsSummary {
  window: DaySummary[];
  total: number;
  best: DaySummary | null;
  hitDays: number;
  loggedDays: number;
  average: number;
  hitRate: number;
}

// Rolling-window totals. Averages and rates intentionally ignore days with no
// entry: an unlogged day is missing data, not a zero-step day.
export function summarize(
  entries: StepEntries,
  goal: number,
  days: number,
  today: Date = new Date()
): StepsSummary {
  const window: DaySummary[] = lastNDays(days, today).map((date) => {
    const key = toKey(date);
    return { date, key, steps: entries[key] ?? 0 };
  });

  const logged = window.filter((day) => day.steps > 0);
  const total = logged.reduce((sum, day) => sum + day.steps, 0);
  // Without a loaded goal nothing counts as a hit, rather than everything.
  const hitDays =
    goal > 0 ? logged.filter((day) => day.steps >= goal).length : 0;
  const best = logged.reduce<DaySummary | null>(
    (max, day) => (day.steps > (max?.steps ?? 0) ? day : max),
    null
  );

  return {
    window,
    total,
    best,
    hitDays,
    loggedDays: logged.length,
    average: logged.length ? Math.round(total / logged.length) : 0,
    hitRate: logged.length ? hitDays / logged.length : 0,
  };
}
