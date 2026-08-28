/**
 * A marathon is a run of N days you commit to, and the things you have to do on
 * them. Two kinds of thing, held in one list: a rule with no day on it applies
 * to every day of the run, and one pinned to a day belongs to that day alone.
 *
 * The card renders what this file works out. Everything here is a plain
 * function of the payload the server sends plus the current time, so a day's
 * state is derived rather than stored — which is what keeps a run correct when
 * the app is left closed for a week and opened on day 12.
 */

import { addDays } from "./dashboardStats";
import { days, plural, s } from "./plural";
import { toKey } from "./stepsUtil";
import type { Note } from "./encouragement";
import type { Marathon, MarathonItem } from "./types";

/** The lengths the start form offers, in the order it offers them. */
export const MARATHON_PRESETS = [7, 14, 21, 30] as const;

const fromKey = (key: string): Date => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
};

/** The date day `n` falls on, counting the start date as day 1. */
export const dateOfDay = (marathon: Marathon, n: number): string =>
  toKey(addDays(fromKey(marathon.start_date), n - 1));

/**
 * Which day of the run a date is, counting from 1. Days before the start come
 * back as 0 or less and days past the end as more than `days` — the caller
 * decides what that means, because "not started yet" and "already over" are two
 * different things to say and only it knows which one it is drawing.
 */
export const dayOfDate = (marathon: Marathon, key: string): number =>
  Math.round(
    (fromKey(key).getTime() - fromKey(marathon.start_date).getTime()) / 86400000
  ) + 1;

/** Which day of the run today is — see `dayOfDate` for out-of-range values. */
export const dayNow = (marathon: Marathon, now: Date): number =>
  dayOfDate(marathon, toKey(now));

export const hasStarted = (marathon: Marathon, now: Date): boolean =>
  dayNow(marathon, now) >= 1;

export const isOver = (marathon: Marathon, now: Date): boolean =>
  dayNow(marathon, now) > marathon.days;

/** Today's day number, clamped into the run — what the day strip selects. */
export const selectableDay = (marathon: Marathon, now: Date): number =>
  Math.min(Math.max(dayNow(marathon, now), 1), marathon.days);

/**
 * What day `n` asks of you: every rule that runs daily, then whatever was
 * pinned to that day. Rules first because they are the same every day — the
 * part of the list you learn by heart — so the day's own items are what changes
 * underneath them rather than something to hunt for in a shuffled list.
 */
export const itemsForDay = (marathon: Marathon, n: number): MarathonItem[] => [
  ...marathon.items.filter((item) => item.day === null),
  ...marathon.items.filter((item) => item.day === n),
];

/** Every tick as `itemId|date`, for asking about one without a scan each time. */
export const tickSet = (marathon: Marathon): Set<string> =>
  new Set(marathon.ticks.map((tick) => `${tick.item_id}|${tick.date}`));

export const isTicked = (
  ticks: Set<string>,
  itemId: number,
  date: string
): boolean => ticks.has(`${itemId}|${date}`);

/** How much of one day is done. `total` 0 means the day asks nothing. */
export interface DayLoad {
  done: number;
  total: number;
}

export const loadOfDay = (
  marathon: Marathon,
  n: number,
  ticks: Set<string>
): DayLoad => {
  const items = itemsForDay(marathon, n);
  const date = dateOfDay(marathon, n);
  return {
    done: items.filter((item) => isTicked(ticks, item.id, date)).length,
    total: items.length,
  };
};

/**
 * How a day is drawn. `empty` and `missed` are kept apart on purpose: a day
 * with nothing on it is not a day you failed, and colouring the two the same
 * would make an unplanned marathon look like a lost one.
 */
export type DayState = "future" | "empty" | "missed" | "partial" | "done";

export const stateOfDay = (
  marathon: Marathon,
  n: number,
  ticks: Set<string>,
  now: Date
): DayState => {
  if (n > dayNow(marathon, now)) return "future";
  const { done, total } = loadOfDay(marathon, n, ticks);
  if (total === 0) return "empty";
  if (done === total) return "done";
  return done === 0 ? "missed" : "partial";
};

/** The run as a whole: where it has got to, and how it has gone so far. */
export interface MarathonProgress {
  /** Days that have happened, capped at the length of the run. */
  elapsed: number;
  /** Of those, the ones where everything asked for was done. */
  clean: number;
  total: number;
  /** Consecutive clean days ending today — see `streakOf`. */
  streak: number;
  /** The longest such run anywhere in the marathon so far. */
  best: number;
  /** Days of the run still ahead, today not counted. */
  left: number;
}

/**
 * Clean days in a row, ending today. Today not being finished does not break
 * the streak — the day is still going — so an incomplete today is stepped over
 * and the count resumes from yesterday, the way the steps streak does.
 */
export function streakOf(
  marathon: Marathon,
  ticks: Set<string>,
  now: Date
): number {
  const today = Math.min(dayNow(marathon, now), marathon.days);
  const clean = (n: number) => {
    const { done, total } = loadOfDay(marathon, n, ticks);
    return total > 0 && done === total;
  };

  let cursor = clean(today) ? today : today - 1;
  let streak = 0;
  while (cursor >= 1 && clean(cursor)) {
    streak += 1;
    cursor -= 1;
  }
  return streak;
}

/** The longest run of clean days anywhere in the marathon so far. */
export function bestStreakOf(
  marathon: Marathon,
  ticks: Set<string>,
  now: Date
): number {
  const elapsed = Math.min(Math.max(dayNow(marathon, now), 0), marathon.days);
  let best = 0;
  let run = 0;
  for (let n = 1; n <= elapsed; n++) {
    const { done, total } = loadOfDay(marathon, n, ticks);
    run = total > 0 && done === total ? run + 1 : 0;
    if (run > best) best = run;
  }
  return best;
}

export function progressOf(
  marathon: Marathon,
  ticks: Set<string>,
  now: Date
): MarathonProgress {
  const elapsed = Math.min(Math.max(dayNow(marathon, now), 0), marathon.days);
  let clean = 0;
  for (let n = 1; n <= elapsed; n++) {
    const { done, total } = loadOfDay(marathon, n, ticks);
    if (total > 0 && done === total) clean += 1;
  }
  return {
    elapsed,
    clean,
    total: marathon.days,
    streak: streakOf(marathon, ticks, now),
    best: bestStreakOf(marathon, ticks, now),
    left: Math.max(marathon.days - elapsed, 0),
  };
}

/** "Day 7 of 30", or where the run sits when today is outside it. */
export function dayLabel(marathon: Marathon, now: Date): string {
  const day = dayNow(marathon, now);
  if (day < 1) {
    const away = 1 - day;
    return away === 1 ? "starts tomorrow" : `starts in ${away} days`;
  }
  if (day > marathon.days) return `finished · ${marathon.days} days`;
  return `day ${day} of ${marathon.days}`;
}

// --- what the run knows about itself -----------------------------------------

/**
 * One true thing about this marathon, weighted — the same shape the todo list's
 * notes have, and for the same reason. What makes a run worth staying in is not
 * being told it matters; it is being shown what is already behind you. So
 * nothing here is invented: every line is read off the ticks, and the sentence
 * around the number is all this file writes.
 *
 * The card shows the strongest few in rotation, through `noteFor`.
 */
export function marathonNotes(
  marathon: Marathon,
  ticks: Set<string>,
  now: Date
): Note[] {
  const notes: Note[] = [];
  const { elapsed, clean, total, streak, best, left } = progressOf(
    marathon,
    ticks,
    now
  );
  const day = dayNow(marathon, now);
  const today = loadOfDay(marathon, Math.min(Math.max(day, 1), total), ticks);
  const missed = elapsed - clean;

  // --- the run as a whole ---

  if (day > total) {
    notes.push({
      ua: `Марафон закінчено — ${clean} ${days(clean)} з ${total} чисто.`,
      en: `Run finished — ${clean} of ${total} days clean.`,
      source: "весь марафон",
      weight: 100,
    });
  }

  if (elapsed >= 3 && clean === elapsed) {
    notes.push({
      ua: `Жодного пропущеного дня. ${elapsed} з ${elapsed}.`,
      en: `Not a day missed yet. ${elapsed} for ${elapsed}.`,
      source: "усі дні забігу",
      weight: 95,
    });
  }

  if (streak >= 2) {
    const record = streak === best && best >= 3;
    notes.push({
      ua: record
        ? `${streak} ${days(streak)} поспіль — найдовша серія цього забігу.`
        : `${streak} ${days(streak)} поспіль.`,
      en: record
        ? `${streak} ${s(streak, "day")} in a row — the longest of this run.`
        : `${streak} ${s(streak, "day")} in a row.`,
      source: "серія",
      weight: record ? 88 : 40 + streak * 6,
    });
  }

  // The middle of a run is where it is abandoned, so the halfway mark is worth
  // saying out loud: it is the one day when what is behind outweighs what is left.
  if (elapsed > 0 && elapsed * 2 >= total && (elapsed - 1) * 2 < total) {
    notes.push({
      ua: `Половина. ${elapsed} ${days(elapsed)} позаду, ${left} попереду.`,
      en: `Halfway. ${elapsed} ${s(elapsed, "day")} behind you, ${left} ahead.`,
      source: "середина забігу",
      weight: 82,
    });
  }

  if (left > 0 && left <= 3 && day >= 1) {
    notes.push({
      ua: `Лишилось ${left} ${days(left)}. Найважче вже позаду.`,
      en: `${left} ${s(left, "day")} left. The hard part is behind you.`,
      source: "кінець забігу",
      weight: 78,
    });
  }

  // --- today ---

  if (
    today.total > 0 &&
    today.done === today.total &&
    day >= 1 &&
    day <= total
  ) {
    notes.push({
      ua: `Сьогодні закрито повністю. Це ${clean} ${days(clean)} з ${elapsed}.`,
      en: `Today is done in full. That's ${clean} of ${elapsed} ${s(elapsed, "day")}.`,
      source: "сьогодні",
      weight: 90,
    });
  }

  if (today.done > 0 && today.done < today.total) {
    notes.push({
      ua: "Перше за сьогодні зроблено. Найважче вже позаду.",
      en: "First one done today. The hard part is behind you.",
      source: "сьогодні",
      weight: 55,
    });
  }

  if (elapsed === 1 && clean === 1) {
    notes.push({
      ua: "День перший закрито. Далі буде легше, ніж здається.",
      en: "Day one, closed. It gets easier from here.",
      source: "перший день",
      weight: 80,
    });
  }

  // --- what is not going well, said without a scolding ---

  if (missed > 0 && clean > 0) {
    notes.push({
      ua: `${missed} ${plural(missed, "пропуск", "пропуски", "пропусків")} за ${elapsed} ${days(elapsed)}. Забіг усе одно твій.`,
      en: `${missed} ${s(missed, "slip")} in ${elapsed} ${s(elapsed, "day")}. The run is still yours.`,
      source: "пропущені дні",
      weight: 22,
    });
  }

  // --- nothing to report yet ---

  if (marathon.items.length === 0) {
    notes.push({
      ua: "Поки що марафон порожній. Додай одне правило — і він почне рахуватись.",
      en: "The run is empty so far. Add one rule and it starts counting.",
      source: "порожній забіг",
      weight: 5,
    });
  }

  if (!notes.length) {
    notes.push({
      ua: `День ${Math.max(day, 1)} з ${total}. Попереду ще все.`,
      en: `Day ${Math.max(day, 1)} of ${total}. It's all still ahead.`,
      source: "початок",
      weight: 1,
    });
  }

  return notes.sort((a, b) => b.weight - a.weight);
}

/** "Today", "Tomorrow", "Yesterday", else the date the day falls on. */
export function dayTitle(marathon: Marathon, n: number, now: Date): string {
  const offset = n - dayNow(marathon, now);
  if (offset === 0) return "Today";
  if (offset === 1) return "Tomorrow";
  if (offset === -1) return "Yesterday";
  return fromKey(dateOfDay(marathon, n)).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}
