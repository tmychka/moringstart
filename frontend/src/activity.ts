/**
 * The page's one chart: every area as a row, every day as a cell.
 *
 * Deliberately not a line or a bar chart. Those answer "how much", and across
 * six areas measured in steps, kilograms, tasks and words there is no shared
 * "how much" to plot — two scales on one axis would be inventing a comparison
 * the data cannot support. A matrix answers the question the areas do share:
 * *did this move today*, and what that looks like laid side by side. Which is
 * the same question the briefing answers in words.
 *
 * Each row carries its own scale, because a full cell has to mean "a lot, for
 * this row" — 10 000 steps and one note written are each a full day's work of
 * their kind. Rows that are only ever yes-or-no take a scale of 1, so any
 * reading at all fills the cell.
 */
import { parseSqlDate } from "./dashboardStats";
import type { Signals } from "./briefing";
import { kg } from "./jarvis";
import { s as en } from "./plural";
import { fmt, toKey } from "./stepsUtil";

export interface ActivityRow {
  label: string;
  /** Raw value per day, oldest first. 0 always means "nothing logged". */
  values: number[];
  /** `value / scale`, capped at 1, is the cell's intensity. */
  scale: number;
  /** Tooltip text for a day that has a value. */
  describe: (value: number) => string;
}

/**
 * A row is never scaled to its own best day alone: in a quiet fortnight that
 * would paint a single closed task as a full day. The floor keeps a full cell
 * meaning something steady rather than something relative to how little you did.
 */
const scaleFor = (values: number[], floor: number): number =>
  Math.max(...values, floor);

/** Counts per day, from timestamps of any kind. */
const countByDay = (stamps: number[], keys: string[]): number[] => {
  const tally = new Map<string, number>();
  for (const ms of stamps) {
    if (!Number.isFinite(ms)) continue;
    const key = toKey(new Date(ms));
    tally.set(key, (tally.get(key) ?? 0) + 1);
  }
  return keys.map((key) => tally.get(key) ?? 0);
};

/**
 * `days` is the exact run of dates to chart, passed in rather than derived
 * here: the band draws its own axis from the same list, and two places working
 * it out separately is two places for them to disagree.
 */
export function activityRows(signals: Signals, days: Date[]): ActivityRow[] {
  const keys = days.map(toKey);

  const steps = keys.map((key) => signals.steps[key] ?? 0);
  const tasks = keys.map((key) => signals.completions[key] ?? 0);
  const words = countByDay(
    signals.vocabulary.filter((w) => w.added > 0).map((w) => w.added),
    keys
  );
  const notes = countByDay(
    signals.devNotes.map((n) => parseSqlDate(n.updated_at).getTime()),
    keys
  );
  const roadmap = countByDay(
    signals.milestones.map((m) => parseSqlDate(m.updated_at).getTime()),
    keys
  );
  // Sessions carry the local day they belong to, so these two are tallied by
  // their own date key rather than by a timestamp: a set logged at half past
  // midnight belongs to the workout it was part of, not to the next column.
  const sets = keys.map((key) =>
    signals.workouts
      .filter((session) => session.date === key)
      .reduce((count, session) => count + session.sets.length, 0)
  );
  const marathon = keys.map(
    (key) =>
      signals.marathon?.ticks.filter((tick) => tick.date === key).length ?? 0
  );
  // Stepping on the scale is not a quantity — you either did or you didn't, and
  // the reading itself says nothing about the effort of that day. Carrying the
  // kilograms as the value anyway lets the tooltip name them; the scale of 1
  // caps every reading at a full cell.
  const weight = keys.map((key) => signals.weights[key] ?? 0);

  return [
    {
      label: "Steps",
      values: steps,
      // Against the goal rather than the best day: a full cell should mean the
      // day you set out to have, not merely your best one this fortnight.
      scale: signals.stepGoal > 0 ? signals.stepGoal : scaleFor(steps, 1),
      describe: (v) => `${fmt(v)} steps`,
    },
    {
      label: "Tasks",
      values: tasks,
      scale: scaleFor(tasks, 3),
      describe: (v) => `${v} closed`,
    },
    {
      label: "Training",
      values: sets,
      // A routine is eight to twelve sets, so that is what a full day of it
      // looks like — not whatever the heaviest session in the window happened
      // to be.
      scale: scaleFor(sets, 10),
      describe: (v) => `${v} ${en(v, "set")} logged`,
    },
    {
      label: "Marathon",
      values: marathon,
      scale: scaleFor(marathon, 2),
      describe: (v) => `${v} ticked off`,
    },
    {
      label: "English",
      values: words,
      scale: scaleFor(words, 3),
      describe: (v) => `${v} new ${en(v, "word")}`,
    },
    {
      label: "Notes",
      values: notes,
      scale: scaleFor(notes, 2),
      describe: (v) => `${v} ${en(v, "note")} written`,
    },
    {
      label: "Roadmap",
      values: roadmap,
      scale: 1,
      describe: (v) => `${v} ${en(v, "milestone")} moved`,
    },
    {
      label: "Weight",
      values: weight,
      scale: 1,
      describe: (v) => `${kg(v)} kg`,
    },
  ];
}
