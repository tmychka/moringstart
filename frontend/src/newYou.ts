// New You: the three things being worked on for the rest of the year, planned a
// week at a time — a small list per direction per day.
//
// Kept in localStorage like the todo list and the vocabulary, so the board works
// the moment the page opens and follows edits made in another tab.

import { useSyncExternalStore } from "react";
import { DEVELOPER, ENGLISH, TRAINING, type Area } from "./areas";
import { addDays } from "./dashboardStats";
import { toKey } from "./stepsUtil";

export const NEW_YOU_STORAGE_KEY = "new-you-plans";

export type Direction = "sport" | "coding" | "english";

export interface DirectionInfo {
  id: Direction;
  label: string;
  /** The area behind it, so the row can open the page where the work is done. */
  area: Area;
  /** Placeholder for the add field — what one day of it might look like. */
  hint: string;
}

/** In board order. */
export const DIRECTIONS: DirectionInfo[] = [
  { id: "sport", label: "Sport", area: TRAINING, hint: "Run 5 km" },
  { id: "coding", label: "Coding", area: DEVELOPER, hint: "One kata" },
  { id: "english", label: "English", area: ENGLISH, hint: "10 words" },
];

export interface Plan {
  id: string;
  direction: Direction;
  /** The day it is planned for, YYYY-MM-DD. */
  date: string;
  title: string;
  done: boolean;
  /** ms epoch. */
  created: number;
}

// --- dates -------------------------------------------------------------------

export const fromKey = (key: string): Date => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
};

/**
 * Every day from the first one anything was planned for — or today, if that is
 * earlier — to New Year's Eve. The run starts where the person did, not on 1
 * January, so a September start isn't drawn as eight months of nothing.
 */
export function runDays(plans: Plan[], today: string): string[] {
  const year = today.slice(0, 4);
  const floor = `${year}-01-01`;
  const end = `${year}-12-31`;
  const first = plans.reduce(
    (min, plan) => (plan.date < min ? plan.date : min),
    today
  );

  const keys: string[] = [];
  for (
    let day = fromKey(first < floor ? floor : first);
    toKey(day) <= end;
    day = addDays(day, 1)
  ) {
    keys.push(toKey(day));
  }
  return keys;
}

// --- the run -----------------------------------------------------------------

/**
 * How one day of a direction reads on the run strip: something ticked off,
 * something still waiting, something planned that the day passed by, or nothing.
 */
export type RunMark = "done" | "open" | "missed" | "idle";

export interface Run {
  /** One per day of `runDays`, in order. */
  marks: RunMark[];
  /** Days up to today with at least one thing done. */
  done: Set<string>;
  best: number;
  /**
   * The streak ending today — or yesterday, while today's is still to do, so a
   * streak doesn't read as broken at breakfast.
   */
  current: number;
}

export function runOf(
  plans: Plan[],
  direction: Direction,
  days: string[],
  today: string
): Run {
  const planned = new Set<string>();
  const ticked = new Set<string>();
  for (const plan of plans) {
    if (plan.direction !== direction) continue;
    planned.add(plan.date);
    if (plan.done) ticked.add(plan.date);
  }

  const done = new Set<string>();
  let best = 0;
  let current = 0;
  const marks = days.map((day): RunMark => {
    if (ticked.has(day)) {
      // Ticking tomorrow's off early still draws, but a streak is only ever
      // made of days that have actually happened.
      if (day <= today) {
        done.add(day);
        current += 1;
        best = Math.max(best, current);
      }
      return "done";
    }
    if (day < today) current = 0;
    if (!planned.has(day)) return "idle";
    return day < today ? "missed" : "open";
  });

  return { marks, done, best, current };
}

// --- storage -----------------------------------------------------------------

const isDirection = (value: unknown): value is Direction =>
  DIRECTIONS.some((direction) => direction.id === value);

function parsePlan(value: unknown): Plan | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as Record<string, unknown>;
  if (
    typeof raw.id !== "string" ||
    !isDirection(raw.direction) ||
    typeof raw.date !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(raw.date) ||
    typeof raw.title !== "string"
  ) {
    return null;
  }
  return {
    id: raw.id,
    direction: raw.direction,
    date: raw.date,
    title: raw.title,
    done: raw.done === true,
    created: typeof raw.created === "number" ? raw.created : 0,
  };
}

function readPlans(): Plan[] {
  try {
    const parsed: unknown = JSON.parse(
      localStorage.getItem(NEW_YOU_STORAGE_KEY) ?? "[]"
    );
    if (!Array.isArray(parsed)) return [];
    return parsed.map(parsePlan).filter((plan): plan is Plan => plan !== null);
  } catch {
    return [];
  }
}

function writePlans(list: Plan[]) {
  try {
    localStorage.setItem(NEW_YOU_STORAGE_KEY, JSON.stringify(list));
  } catch {
    // Storage can be blocked or full; the board still works for this session.
  }
}

// Held module-side like the todo list: read with a hook, changed with a call.
let plans: Plan[] = readPlans();
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((listener) => listener());

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const getPlans = () => plans;

function commit(next: Plan[]) {
  plans = next;
  writePlans(next);
  emit();
}

const newId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export function usePlans(): Plan[] {
  return useSyncExternalStore(subscribe, getPlans, getPlans);
}

export function addPlan(direction: Direction, date: string, title: string) {
  const clean = title.trim().slice(0, 120);
  if (!clean) return;
  commit([
    ...plans,
    {
      id: newId(),
      direction,
      date,
      title: clean,
      done: false,
      created: Date.now(),
    },
  ]);
}

export const togglePlan = (id: string) =>
  commit(
    plans.map((plan) => (plan.id === id ? { ...plan, done: !plan.done } : plan))
  );

export const movePlan = (id: string, date: string) =>
  commit(plans.map((plan) => (plan.id === id ? { ...plan, date } : plan)));

export const removePlan = (id: string) =>
  commit(plans.filter((plan) => plan.id !== id));

/**
 * Last week's plan laid onto the week starting `monday`, weekday for weekday,
 * all of it open again. Only offered on an empty week, so nothing doubles up.
 */
export function repeatWeek(monday: string) {
  const from = toKey(addDays(fromKey(monday), -7));
  const created = Date.now();
  const copies = plans
    .filter((plan) => plan.date >= from && plan.date < monday)
    .map((plan) => ({
      ...plan,
      id: newId(),
      date: toKey(addDays(fromKey(plan.date), 7)),
      done: false,
      created,
    }));
  if (copies.length > 0) commit([...plans, ...copies]);
}

// Another tab writing the board should update this one, same as the todos.
window.addEventListener("storage", (e) => {
  if (e.key !== NEW_YOU_STORAGE_KEY) return;
  plans = readPlans();
  emit();
});
