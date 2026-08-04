// The todo list lives in localStorage rather than behind the API, so it works
// the moment the page opens and syncs across tabs like the vocabulary list does.
//
// Two things make it more than an array of strings, and both live here so the
// page only has to render what they produce:
//
//   1. Capture is one line of plain text. "pay rent tomorrow at 9 !! #home ~20m"
//      is parsed into a due date, a time, a priority, a tag and an estimate.
//   2. The list orders itself. Every open task carries an urgency score, so what
//      matters next floats to the top instead of waiting to be dragged there.

import { useSyncExternalStore } from "react";
import { addDays } from "./dashboardStats";
import { toKey } from "./stepsUtil";

export const TODOS_STORAGE_KEY = "super-todos";

/** 0 normal, 1 high (`!`), 2 urgent (`!!`). */
export type Priority = 0 | 1 | 2;
export type Repeat = "day" | "weekday" | "week" | "month";

/** Where a task lands relative to today; also the order sections are shown in. */
export type Bucket =
  "overdue" | "today" | "tomorrow" | "week" | "later" | "someday";

export interface Todo {
  id: string;
  title: string;
  done: boolean;
  /** YYYY-MM-DD. Null means "someday" — captured, but not claimed by a day yet. */
  due: string | null;
  /** HH:MM when the capture named a time, else null. */
  at: string | null;
  priority: Priority;
  tag: string | null;
  /** Minutes; 0 when nothing was estimated. */
  estimate: number;
  repeat: Repeat | null;
  /** ms epoch. */
  created: number;
  /** ms epoch of the last completion; null while open. */
  completed: number | null;
  /** Completions of a repeating task, which never sits in the done pile. */
  runs: number;
  /**
   * Where this task sits in the hand-made order for today; null while the
   * ranking is left to decide. Only meaningful inside today's queue.
   */
  position: number | null;
}

// --- dates -------------------------------------------------------------------

const DAY_MS = 86400000;

const startOfDay = (d: Date): Date =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate());

export const fromKey = (key: string): Date => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
};

/** Calendar days from `now` to `key`; negative when the key is in the past. */
export const dayDiff = (key: string, now: Date): number =>
  Math.round((fromKey(key).getTime() - startOfDay(now).getTime()) / DAY_MS);

// Clamped to the end of the target month, so "monthly" on the 31st doesn't
// wander into the next month the way a naive setMonth would.
const addMonths = (d: Date, n: number): Date => {
  const target = new Date(d.getFullYear(), d.getMonth() + n, 1);
  const lastDay = new Date(
    target.getFullYear(),
    target.getMonth() + 1,
    0
  ).getDate();
  target.setDate(Math.min(d.getDate(), lastDay));
  return target;
};

// "friday" means the coming Friday, and today counts when it is one — writing a
// weekday down on that very day is a note about today, not about next week.
// `next friday` passes `includeToday: false` to mean the one after.
const nextWeekday = (
  from: Date,
  weekday: number,
  includeToday = true
): Date => {
  const base = startOfDay(from);
  const ahead = (weekday - base.getDay() + 7) % 7;
  return addDays(base, ahead === 0 && !includeToday ? 7 : ahead);
};

const nextWorkday = (from: Date): Date => {
  let d = startOfDay(from);
  while (d.getDay() === 0 || d.getDay() === 6) d = addDays(d, 1);
  return d;
};

// --- capture parser ----------------------------------------------------------

const WEEKDAY_WORDS: Record<string, number> = {
  sun: 0,
  sunday: 0,
  mon: 1,
  monday: 1,
  tue: 2,
  tues: 2,
  tuesday: 2,
  wed: 3,
  weds: 3,
  wednesday: 3,
  thu: 4,
  thur: 4,
  thurs: 4,
  thursday: 4,
  fri: 5,
  friday: 5,
  sat: 6,
  saturday: 6,
};

const MONTH_WORDS: Record<string, number> = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
};

// Longest first: regex alternation takes the first branch that matches, and
// `sun|sunday` would otherwise clip "sunday" to "sun" and leave "day" behind.
const alternation = (words: string[]): string =>
  words
    .slice()
    .sort((a, b) => b.length - a.length)
    .join("|");

const WEEKDAY_ALT = alternation(Object.keys(WEEKDAY_WORDS));
const MONTH_ALT = alternation(Object.keys(MONTH_WORDS));

/** Optional preposition in front of a date, so "buy milk on friday" reads cleanly. */
const LEAD = "\\b(?:on|by|due)?\\s*\\b";

interface Draft {
  due: string | null;
  at: string | null;
  priority: Priority;
  tag: string | null;
  estimate: number;
  repeat: Repeat | null;
}

interface Rule {
  re: RegExp;
  /** Null means "matched the shape but not a real value" — the text is left alone. */
  read: (m: RegExpExecArray, now: Date) => Partial<Draft> | null;
}

const toMinutes = (value: string, unit?: string): number => {
  const n = Number(value.replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return 0;
  const hours = unit ? /^h/i.test(unit) : false;
  return Math.min(Math.round(hours ? n * 60 : n), 24 * 60);
};

const timeFrom = (
  hour: string,
  minute?: string,
  suffix?: string
): Partial<Draft> | null => {
  let h = Number(hour);
  const m = minute ? Number(minute) : 0;
  if (!Number.isFinite(h) || h > 23 || m > 59) return null;
  const ampm = suffix?.toLowerCase();
  if (ampm === "pm" && h < 12) h += 12;
  if (ampm === "am" && h === 12) h = 0;
  // A bare "at 9" with no am/pm on a 12-hour-shaped number: 9 means 09:00.
  return { at: `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}` };
};

// A day/month with no year belongs to the next occurrence of that date, so
// "31 dec" written in January is this year and written in that same December
// is today rather than eleven months ago.
const dateFromParts = (
  now: Date,
  day: number,
  month: number,
  year?: number
): Partial<Draft> | null => {
  if (day < 1 || day > 31 || month < 0 || month > 11) return null;
  const build = (y: number) => new Date(y, month, day);
  let date = build(year ?? now.getFullYear());
  if (date.getMonth() !== month) return null; // e.g. 31 Feb
  if (year === undefined && date.getTime() < startOfDay(now).getTime()) {
    date = build(now.getFullYear() + 1);
  }
  return { due: toKey(date) };
};

// Order matters: whatever matches first also gets cut out of the text, so the
// specific patterns ("every monday", "day after tomorrow") run before the
// general ones that would otherwise swallow half of them.
const RULES: Rule[] = [
  {
    re: new RegExp(`\\bevery\\s+(${WEEKDAY_ALT})\\b`, "i"),
    read: (m, now) => ({
      repeat: "week",
      due: toKey(nextWeekday(now, WEEKDAY_WORDS[m[1].toLowerCase()])),
    }),
  },
  {
    re: /\b(?:every\s+day|daily|every\s+(?:week|work)days?|every\s+week|weekly|every\s+month|monthly)\b/i,
    read: (m, now) => {
      const phrase = m[0].toLowerCase().replace(/\s+/g, " ");
      if (phrase.includes("workday") || phrase.includes("weekday")) {
        return { repeat: "weekday", due: toKey(nextWorkday(now)) };
      }
      if (phrase.includes("month")) return { repeat: "month", due: toKey(now) };
      if (phrase.includes("week")) return { repeat: "week", due: toKey(now) };
      return { repeat: "day", due: toKey(now) };
    },
  },
  {
    re: /~\s*(\d+(?:[.,]\d+)?)\s*(h|hr|hrs|hours?|m|min|mins|minutes?)?\b/i,
    read: (m) => ({ estimate: toMinutes(m[1], m[2]) }),
  },
  {
    re: /\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i,
    read: (m) => timeFrom(m[1], m[2], m[3]),
  },
  {
    re: /\b(\d{1,2}):(\d{2})\s*(am|pm)?\b/i,
    read: (m) => timeFrom(m[1], m[2], m[3]),
  },
  {
    re: /\b(\d{1,2})\s*(am|pm)\b/i,
    read: (m) => timeFrom(m[1], undefined, m[2]),
  },
  {
    re: /\bday after tomorrow\b/i,
    read: (_m, now) => ({ due: toKey(addDays(now, 2)) }),
  },
  {
    re: new RegExp(`${LEAD}(today|tonight|tomorrow|tmr|tmrw|tmw)\\b`, "i"),
    read: (m, now) => {
      const word = m[1].toLowerCase();
      if (word === "tonight") return { due: toKey(now), at: "20:00" };
      if (word === "today") return { due: toKey(now) };
      return { due: toKey(addDays(now, 1)) };
    },
  },
  {
    re: /\bin\s+(\d{1,3})\s*(days?|d|weeks?|w|months?|mo)\b/i,
    read: (m, now) => {
      const n = Number(m[1]);
      const unit = m[2].toLowerCase();
      if (unit.startsWith("d")) return { due: toKey(addDays(now, n)) };
      if (unit.startsWith("w")) return { due: toKey(addDays(now, n * 7)) };
      return { due: toKey(addMonths(now, n)) };
    },
  },
  {
    re: new RegExp(`\\bnext\\s+(week|month|${WEEKDAY_ALT})\\b`, "i"),
    read: (m, now) => {
      const word = m[1].toLowerCase();
      if (word === "week") return { due: toKey(addDays(now, 7)) };
      if (word === "month") return { due: toKey(addMonths(now, 1)) };
      return { due: toKey(nextWeekday(now, WEEKDAY_WORDS[word], false)) };
    },
  },
  {
    re: new RegExp(`${LEAD}(${WEEKDAY_ALT})\\b`, "i"),
    read: (m, now) => ({
      due: toKey(nextWeekday(now, WEEKDAY_WORDS[m[1].toLowerCase()])),
    }),
  },
  {
    re: new RegExp(
      `${LEAD}(\\d{1,2})\\s*(?:st|nd|rd|th)?\\s+(${MONTH_ALT})\\b`,
      "i"
    ),
    read: (m, now) =>
      dateFromParts(now, Number(m[1]), MONTH_WORDS[m[2].toLowerCase()]),
  },
  {
    re: new RegExp(`${LEAD}(${MONTH_ALT})\\s+(\\d{1,2})\\b`, "i"),
    read: (m, now) =>
      dateFromParts(now, Number(m[2]), MONTH_WORDS[m[1].toLowerCase()]),
  },
  {
    // Day first, like every other date the app prints (en-GB).
    re: new RegExp(`${LEAD}(\\d{1,2})[./](\\d{1,2})(?:[./](\\d{2,4}))?\\b`),
    read: (m, now) => {
      const year = m[3]
        ? Number(m[3]) < 100
          ? 2000 + Number(m[3])
          : Number(m[3])
        : undefined;
      return dateFromParts(now, Number(m[1]), Number(m[2]) - 1, year);
    },
  },
  {
    re: /\b(?:for|about|approx)?\s*(\d{1,3}(?:[.,]\d+)?)\s*(h|hr|hrs|hours?|m|min|mins|minutes?)\b/i,
    read: (m) => ({ estimate: toMinutes(m[1], m[2]) }),
  },
  {
    re: /(!{1,3})(?=\s)/,
    read: (m) => ({ priority: (m[1].length > 1 ? 2 : 1) as Priority }),
  },
  { re: /#([\p{L}\d_-]+)/u, read: (m) => ({ tag: m[1].toLowerCase() }) },
];

// First value found wins, so "tomorrow ... friday" keeps tomorrow rather than
// letting the later rule overwrite what the earlier, more specific one read.
const merge = (draft: Draft, found: Partial<Draft>) => {
  if (found.due != null && draft.due == null) draft.due = found.due;
  if (found.at != null && draft.at == null) draft.at = found.at;
  if (found.tag != null && draft.tag == null) draft.tag = found.tag;
  if (found.repeat != null && draft.repeat == null) draft.repeat = found.repeat;
  if (found.estimate && !draft.estimate) draft.estimate = found.estimate;
  if (found.priority && !draft.priority) draft.priority = found.priority;
};

/** One thing the parser understood, for the live preview under the capture bar. */
export interface Chip {
  kind: "due" | "tag" | "priority" | "estimate" | "repeat";
  label: string;
}

export interface Capture extends Draft {
  title: string;
  chips: Chip[];
}

export function parseCapture(input: string, now: Date = new Date()): Capture {
  // Padded so patterns can rely on a boundary at both ends of the string.
  let text = ` ${input} `;
  const draft: Draft = {
    due: null,
    at: null,
    priority: 0,
    tag: null,
    estimate: 0,
    repeat: null,
  };

  for (const rule of RULES) {
    const m = rule.re.exec(text);
    if (!m) continue;
    const found = rule.read(m, now);
    if (!found) continue;
    text = `${text.slice(0, m.index)} ${text.slice(m.index + m[0].length)}`;
    merge(draft, found);
  }

  // A time on its own means today, unless today's slot has already gone by —
  // "call mum at 9" typed at midnight is tomorrow morning.
  if (draft.at && !draft.due) {
    const [h, min] = draft.at.split(":").map(Number);
    const slot = new Date(now);
    slot.setHours(h, min, 0, 0);
    draft.due = toKey(slot.getTime() <= now.getTime() ? addDays(now, 1) : now);
  }

  const title = text
    .replace(/\s+/g, " ")
    .trim()
    // A preposition whose object was just parsed away ("pay rent on "). Only the
    // words no real title ends in — "log in" and "wait for" have to survive.
    .replace(/[\s,]*\b(on|at|by|due|every|next)$/i, "")
    .trim();

  // Everything-was-a-date inputs ("tomorrow") still deserve to become a task.
  return {
    ...draft,
    title: title || input.trim(),
    chips: describe(draft, now),
  };
}

// --- labels ------------------------------------------------------------------

export function formatMinutes(minutes: number): string {
  if (minutes <= 0) return "";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

const REPEAT_LABEL: Record<Repeat, string> = {
  day: "Every day",
  weekday: "Weekdays",
  week: "Every week",
  month: "Every month",
};

const timeLabel = (at: string | null): string => (at ? ` · ${at}` : "");

/** Minutes since a HH:MM slot passed today; negative while it is still ahead. */
const minutesPast = (at: string, now: Date): number => {
  const [h, m] = at.split(":").map(Number);
  return now.getHours() * 60 + now.getMinutes() - (h * 60 + m);
};

/**
 * A task is late the minute its slot passes, not at midnight: something due at
 * 09:00 is late at 09:01, which is when being late starts to matter. Without a
 * time on it, a task has the whole day and only runs late tomorrow.
 */
export function isLate(
  due: string | null,
  at: string | null,
  now: Date = new Date()
): boolean {
  if (!due) return false;
  const days = dayDiff(due, now);
  if (days !== 0) return days < 0;
  return at !== null && minutesPast(at, now) > 0;
}

/** "Today · 09:00", "Tomorrow", "Fri", "3 Aug", "20m late · 09:00". */
export function dueLabel(
  due: string | null,
  at: string | null,
  now: Date = new Date()
): string {
  if (!due) return at ? at : "Someday";
  const days = dayDiff(due, now);
  if (days === 0) {
    const late = at ? minutesPast(at, now) : 0;
    return late > 0
      ? `${formatMinutes(late)} late${timeLabel(at)}`
      : `Today${timeLabel(at)}`;
  }
  if (days === 1) return `Tomorrow${timeLabel(at)}`;
  if (days === -1) return `Yesterday${timeLabel(at)}`;
  if (days < 0) return `${Math.abs(days)} days late${timeLabel(at)}`;
  const date = fromKey(due);
  if (days < 7) {
    return `${date.toLocaleDateString("en-GB", { weekday: "short" })}${timeLabel(at)}`;
  }
  const label = date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    // A date in another year needs saying so; this one doesn't.
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  });
  return `${label}${timeLabel(at)}`;
}

/** The chips the capture preview shows, for a task that is already on the list. */
export const chipsFor = (todo: Todo, now: Date = new Date()): Chip[] =>
  describe(todo, now);

const describe = (draft: Draft, now: Date): Chip[] => {
  const chips: Chip[] = [];
  if (draft.due || draft.at) {
    chips.push({ kind: "due", label: dueLabel(draft.due, draft.at, now) });
  }
  if (draft.repeat) {
    chips.push({ kind: "repeat", label: REPEAT_LABEL[draft.repeat] });
  }
  if (draft.estimate) {
    chips.push({ kind: "estimate", label: formatMinutes(draft.estimate) });
  }
  if (draft.tag) chips.push({ kind: "tag", label: `#${draft.tag}` });
  if (draft.priority) {
    chips.push({
      kind: "priority",
      label: draft.priority === 2 ? "Urgent" : "High",
    });
  }
  return chips;
};

// --- ranking -----------------------------------------------------------------

// The moment a task came due: its time when it named one, else the start of its
// day.
const slotTime = (due: string, at: string | null): number => {
  const date = fromKey(due);
  if (at) {
    const [h, m] = at.split(":").map(Number);
    date.setHours(h, m, 0, 0);
  }
  return date.getTime();
};

/** Minutes past a task's slot; 0 while it still has time. */
export function lateMinutes(todo: Todo, now: Date): number {
  if (!todo.due || !isLate(todo.due, todo.at, now)) return 0;
  return Math.max((now.getTime() - slotTime(todo.due, todo.at)) / 60000, 0);
}

export function bucketOf(todo: Todo, now: Date): Bucket {
  if (!todo.due) return "someday";
  if (isLate(todo.due, todo.at, now)) return "overdue";
  const days = dayDiff(todo.due, now);
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  return days <= 7 ? "week" : "later";
}

const BUCKET_WEIGHT: Record<Bucket, number> = {
  overdue: 900,
  today: 700,
  tomorrow: 420,
  week: 300,
  later: 160,
  someday: 120,
};

export interface Ranked {
  todo: Todo;
  bucket: Bucket;
  score: number;
}

// The score is what replaces manual ordering. A day bucket sets the floor,
// priority lifts inside it, and the small terms settle ties: a task with an hour
// on the clock outranks one due "sometime today", a fifteen-minute job beats an
// afternoon-long one at the same urgency, and nothing gets to sit at the bottom
// forever — age nudges every task upward.
export function scoreOf(todo: Todo, bucket: Bucket, now: Date): number {
  let score = BUCKET_WEIGHT[bucket] + todo.priority * 80;

  if (bucket === "overdue") {
    // Hours count here, not whole days: ten minutes late is a nudge and three
    // days late is an alarm, and the two shouldn't sort by the same integer.
    score += Math.min(lateMinutes(todo, now) / (60 * 24), 14) * 12;
  } else if (todo.at && bucket === "today") {
    score += (24 - Number(todo.at.slice(0, 2))) * 3;
  }
  if (bucket === "week" || bucket === "later") {
    score -= Math.min(dayDiff(todo.due ?? toKey(now), now), 60) * 2;
  }
  if (todo.estimate > 0 && todo.estimate <= 15) score += 10;

  const ageDays = (now.getTime() - todo.created) / DAY_MS;
  return score + Math.min(Math.max(ageDays, 0), 21) * 1.5;
}

/** The buckets that make up today's queue — the only tasks a plan orders. */
export const isPlannable = (bucket: Bucket): boolean =>
  bucket === "overdue" || bucket === "today";

/** Open tasks, most urgent first, with any hand-made order applied. */
export function rank(todos: Todo[], now: Date = new Date()): Ranked[] {
  const ranked = todos
    .filter((todo) => !todo.done)
    .map((todo) => {
      const bucket = bucketOf(todo, now);
      return { todo, bucket, score: scoreOf(todo, bucket, now) };
    })
    .sort((a, b) => b.score - a.score);

  // A hand-made order beats the score, but only for the tasks it names: they are
  // dealt back into the slots they already held between them, in the order you
  // set. Everything you never touched keeps its place, so planning three things
  // doesn't reshuffle the rest of the list — and it keeps the comparison a total
  // order, which a "position first, score otherwise" sort would not be.
  const slots: number[] = [];
  const planned: Ranked[] = [];
  ranked.forEach((entry, i) => {
    if (entry.todo.position !== null && isPlannable(entry.bucket)) {
      slots.push(i);
      planned.push(entry);
    }
  });
  planned.sort((a, b) => (a.todo.position ?? 0) - (b.todo.position ?? 0));
  slots.forEach((slot, i) => {
    ranked[slot] = planned[i];
  });

  return ranked;
}

/** What today actually asks of you: everything due today plus what ran late. */
export interface Load {
  open: number;
  done: number;
  /** Minutes. Unestimated tasks count as `DEFAULT_ESTIMATE`, so the number is a plan, not a promise. */
  minutes: number;
}

const DEFAULT_ESTIMATE = 15;

export function todayLoad(todos: Todo[], now: Date = new Date()): Load {
  const todayKey = toKey(now);
  const open = todos.filter(
    (todo) => !todo.done && todo.due !== null && dayDiff(todo.due, now) <= 0
  );
  const done = todos.filter(
    (todo) =>
      todo.completed !== null && toKey(new Date(todo.completed)) === todayKey
  );

  return {
    open: open.length,
    done: done.length,
    minutes: open.reduce(
      (sum, todo) => sum + (todo.estimate || DEFAULT_ESTIMATE),
      0
    ),
  };
}

// --- storage -----------------------------------------------------------------

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;

const str = (value: unknown): string | null =>
  typeof value === "string" && value ? value : null;

// Only the title is required; every other field is filled in, so a list written
// by an older build survives a schema that has grown since.
const parseTodo = (value: unknown, index: number): Todo | null => {
  const raw = asRecord(value);
  if (!raw || typeof raw.title !== "string" || !raw.title.trim()) return null;

  const repeat = str(raw.repeat);
  const priority = Number(raw.priority);
  const completed = Number(raw.completed);
  const created = Number(raw.created);

  return {
    id: str(raw.id) ?? `restored-${index}`,
    title: raw.title,
    done: raw.done === true,
    due: str(raw.due),
    at: str(raw.at),
    priority: (priority === 1 || priority === 2 ? priority : 0) as Priority,
    tag: str(raw.tag),
    estimate:
      Number.isFinite(Number(raw.estimate)) && Number(raw.estimate) > 0
        ? Number(raw.estimate)
        : 0,
    repeat:
      repeat === "day" ||
      repeat === "weekday" ||
      repeat === "week" ||
      repeat === "month"
        ? repeat
        : null,
    created: Number.isFinite(created) && created > 0 ? created : Date.now(),
    completed: Number.isFinite(completed) && completed > 0 ? completed : null,
    runs: Number.isFinite(Number(raw.runs)) ? Number(raw.runs) : 0,
    // Checked as a number rather than coerced: `Number(null)` is 0, which would
    // silently plant an unplanned task at the head of the queue.
    position:
      typeof raw.position === "number" &&
      Number.isFinite(raw.position) &&
      raw.position >= 0
        ? raw.position
        : null,
  };
};

function readTodos(): Todo[] {
  try {
    const parsed: unknown = JSON.parse(
      localStorage.getItem(TODOS_STORAGE_KEY) ?? "[]"
    );
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((value, i) => parseTodo(value, i))
      .filter((todo): todo is Todo => todo !== null);
  } catch {
    return [];
  }
}

function writeTodos(list: Todo[]) {
  try {
    localStorage.setItem(TODOS_STORAGE_KEY, JSON.stringify(list));
  } catch {
    // Storage can be blocked or full; the list still works for this session.
  }
}

// One list for the whole app, held module-side like the theme: any component can
// read it with a hook and mutate it with a plain function call.
let todos: Todo[] = readTodos();
let undoStack: Todo[][] = [];
const listeners = new Set<() => void>();

const UNDO_DEPTH = 25;

const emit = () => listeners.forEach((listener) => listener());

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const getTodos = () => todos;
const getCanUndo = () => undoStack.length > 0;

// Every mutation goes through here, so undo is a stack of whole lists rather
// than an inverse operation per action.
function commit(next: Todo[], undoable = true) {
  if (undoable) undoStack = [...undoStack, todos].slice(-UNDO_DEPTH);
  todos = next;
  writeTodos(next);
  emit();
}

const newId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export function useTodos(): Todo[] {
  return useSyncExternalStore(subscribe, getTodos, getTodos);
}

export function useCanUndo(): boolean {
  return useSyncExternalStore(subscribe, getCanUndo, getCanUndo);
}

export function addTodo(capture: Capture): Todo {
  const todo: Todo = {
    id: newId(),
    title: capture.title,
    done: false,
    due: capture.due,
    at: capture.at,
    priority: capture.priority,
    tag: capture.tag,
    estimate: capture.estimate,
    repeat: capture.repeat,
    created: Date.now(),
    completed: null,
    runs: 0,
    position: null,
  };
  commit([...todos, todo]);
  return todo;
}

export function patchTodo(id: string, patch: Partial<Todo>) {
  commit(todos.map((todo) => (todo.id === id ? { ...todo, ...patch } : todo)));
}

export function removeTodo(id: string) {
  commit(todos.filter((todo) => todo.id !== id));
}

// Every step is measured from the original date rather than from the previous
// step, so a monthly task anchored to the 31st keeps landing on the 31st instead
// of drifting to the 28th the first time it passes February.
const stepFrom = (base: Date, repeat: Repeat, n: number): Date => {
  if (repeat === "week") return addDays(base, n * 7);
  if (repeat === "month") return addMonths(base, n);
  if (repeat === "weekday") return nextWorkday(addDays(base, n));
  return addDays(base, n);
};

/** The next slot for a repeating task: always in the future, however long it sat. */
export function nextOccurrence(
  repeat: Repeat,
  due: string | null,
  now: Date = new Date()
): string {
  const base = due ? fromKey(due) : startOfDay(now);
  // A task left alone for months has to catch up a step at a time; the cap keeps
  // a corrupt date from spinning here forever.
  for (let n = 1; n <= 400; n++) {
    const next = stepFrom(base, repeat, n);
    if (dayDiff(toKey(next), now) > 0) return toKey(next);
  }
  return toKey(addDays(now, 1));
}

/**
 * Completing a task. A repeating one never lands in the done pile — it rolls to
 * its next slot and counts the run, which is the whole point of repeating it.
 *
 * @returns the date it rolled to, or null for a plain toggle.
 */
export function toggleTodo(id: string, now: Date = new Date()): string | null {
  const todo = todos.find((t) => t.id === id);
  if (!todo) return null;

  if (todo.repeat && !todo.done) {
    const due = nextOccurrence(todo.repeat, todo.due, now);
    // It has left today, so it leaves today's order with it.
    patchTodo(id, {
      due,
      completed: now.getTime(),
      runs: todo.runs + 1,
      position: null,
    });
    return due;
  }

  patchTodo(id, {
    done: !todo.done,
    completed: todo.done ? null : now.getTime(),
  });
  return null;
}

export function snoozeTodo(id: string, due: string | null) {
  // Sent to another day, so it drops out of today's order rather than keeping a
  // seat it will not use.
  patchTodo(id, { due, position: null });
}

/** Today's queue in the order it is shown — what a place number counts. */
const planQueue = (now: Date): Todo[] =>
  rank(todos, now)
    .filter((entry) => isPlannable(entry.bucket))
    .map((entry) => entry.todo);

// Numbering the whole queue on the first reorder is what makes the order
// stated rather than half-guessed: from then on every task has a place, and
// whatever holds the first one is what "Next up" shows.
const reorderQueue = (queue: Todo[], from: number, to: number) => {
  if (from === to) return;
  const next = [...queue];
  next.splice(to, 0, ...next.splice(from, 1));
  const positions = new Map(next.map((todo, i) => [todo.id, i]));

  let changed = false;
  const updated = todos.map((todo) => {
    const position = positions.get(todo.id);
    if (position === undefined || position === todo.position) return todo;
    changed = true;
    return { ...todo, position };
  });
  if (changed) commit(updated);
};

/**
 * Put a task at a given place in today's queue — the number typed on the row.
 * `place` is 1-based and clamps to the ends, so "9" on a queue of four means
 * last rather than nothing.
 */
export function planSet(id: string, place: number, now: Date = new Date()) {
  const queue = planQueue(now);
  const from = queue.findIndex((todo) => todo.id === id);
  if (from < 0) return;
  const to = Math.min(Math.max(Math.round(place) - 1, 0), queue.length - 1);
  reorderQueue(queue, from, to);
}

/** Nudge a task one place up or down the queue. */
export function planMove(id: string, step: -1 | 1, now: Date = new Date()) {
  const queue = planQueue(now);
  const from = queue.findIndex((todo) => todo.id === id);
  const to = from + step;
  if (from < 0 || to < 0 || to >= queue.length) return;
  reorderQueue(queue, from, to);
}

/** Drop the hand-made order and hand the day back to the ranking. */
export function clearPlan(): number {
  const planned = todos.filter((todo) => todo.position !== null).length;
  if (planned) {
    commit(
      todos.map((todo) =>
        todo.position === null ? todo : { ...todo, position: null }
      )
    );
  }
  return planned;
}

/** Everything that ran late becomes today's problem, in one move. */
export function rollOverdue(now: Date = new Date()): number {
  const todayKey = toKey(now);
  const late = todos.filter(
    (todo) => !todo.done && todo.due !== null && dayDiff(todo.due, now) < 0
  );
  if (!late.length) return 0;

  const ids = new Set(late.map((todo) => todo.id));
  commit(
    todos.map((todo) => (ids.has(todo.id) ? { ...todo, due: todayKey } : todo))
  );
  return late.length;
}

export function clearDone(): number {
  const count = todos.filter((todo) => todo.done).length;
  if (count) commit(todos.filter((todo) => !todo.done));
  return count;
}

export function undo(): boolean {
  const previous = undoStack[undoStack.length - 1];
  if (!previous) return false;
  undoStack = undoStack.slice(0, -1);
  commit(previous, false);
  return true;
}

// Another tab writing the list should update this one, same as the theme.
window.addEventListener("storage", (e) => {
  if (e.key !== TODOS_STORAGE_KEY) return;
  todos = readTodos();
  // The stack describes a list this tab no longer holds, so it can't be applied.
  undoStack = [];
  emit();
});
