/**
 * What the system has to say, read off every area at once.
 *
 * This is the one module in the app allowed to look at more than one area. Every
 * screen before it reported on its own patch — the steps card knows steps, the
 * vocabulary tile knows words — and the joining up was left to whoever was
 * reading. A card that says "4 200 steps" and a card that says "Cut" are two
 * facts; that you are cutting *and* barely moving is the observation, and until
 * now nothing was in a position to make it.
 *
 * It follows `encouragement.ts` in shape and in principle: nothing is invented,
 * every line is read off the data, and each one carries the source it came from
 * so the claim can be checked rather than believed. The cross-area notes carry
 * the highest weights, because they are the ones no other screen can make.
 */
import { currentStreak, startOfWeek } from "./dashboardStats";
import { observe as observeTodos, type Note } from "./encouragement";
import type { StoredWord } from "./englishWords";
import {
  STEPS_FLAT_BAND,
  TREND_DAYS,
  WEIGHT_FLAT_BAND,
  clockOf,
  kg,
  series,
  trend,
} from "./jarvis";
import { days, daysSince, plural, s, words } from "./plural";
import { parseSqlDate } from "./dashboardStats";
import { fmt, toKey } from "./stepsUtil";
import type { CompletionLog, Todo } from "./todos";
import { todayLoad } from "./todos";
import type {
  Milestone,
  Note as ApiNote,
  ProfileMode,
  StatusEntry,
  StepEntries,
  WeightEntries,
} from "./types";

/** Everything the app knows about the person, gathered in one place. */
export interface Signals {
  now: Date;
  todos: Todo[];
  completions: CompletionLog;
  steps: StepEntries;
  stepGoal: number;
  weights: WeightEntries;
  weightGoal: number;
  mode: ProfileMode;
  statusLog: StatusEntry[];
  vocabulary: StoredWord[];
  devNotes: ApiNote[];
  milestones: Milestone[];
}

// Thresholds, named rather than buried in the conditions. Each is the point
// where a number stops being noise and starts being worth saying out loud.
const STEP_STREAK_MIN = 2;
/** Under this share of the goal a day counts as a day off, not a light day. */
const SLOW_DAY_SHARE = 0.5;
const SLOW_RUN_MIN = 3;
/** Cutting or bulking without weighing in is the plan running unmeasured. */
const UNWEIGHED_DAYS = 3;
const COLD_VOCAB_DAYS = 4;
const COLD_NOTES_DAYS = 5;
const FROZEN_ROADMAP_DAYS = 7;
/** One status held this long has almost certainly stopped being true. */
const STALE_STATUS_HOURS = 4;

const MODE_UA: Record<ProfileMode, string> = {
  cut: "сушці",
  maintain: "підтримці",
  bulk: "масі",
};
const MODE_EN: Record<ProfileMode, string> = {
  cut: "a cut",
  maintain: "maintenance",
  bulk: "a bulk",
};

/** Days back from today, counting today as 0, on which a step goal was met. */
const slowRun = (entries: StepEntries, goal: number, now: Date): number => {
  if (goal <= 0) return 0;
  const floor = goal * SLOW_DAY_SHARE;
  let run = 0;
  // Yesterday backwards: today is still in progress, so a quiet morning is not
  // yet a slow day and should not be counted against the run.
  for (let d = 1; d <= TREND_DAYS; d++) {
    const key = toKey(
      new Date(now.getFullYear(), now.getMonth(), now.getDate() - d)
    );
    const value = entries[key] ?? 0;
    if (value === 0 || value >= floor) break;
    run++;
  }
  return run;
};

/** Whole days since the newest key in a date-keyed map; null when it is empty. */
const daysSinceEntry = (
  entries: Record<string, number>,
  now: Date
): number | null => {
  const latest = Object.keys(entries)
    .filter((key) => entries[key] > 0)
    .sort()
    .pop();
  if (!latest) return null;
  const [y, m, d] = latest.split("-").map(Number);
  return daysSince(new Date(y, m - 1, d).getTime(), now);
};

/** Newest `updated_at` across rows the backend timestamps, as epoch ms. */
const newestUpdate = (rows: { updated_at: string }[]): number | null => {
  const stamps = rows
    .map((row) => parseSqlDate(row.updated_at).getTime())
    .filter((ms) => Number.isFinite(ms));
  return stamps.length ? Math.max(...stamps) : null;
};

// --- per-area observers ------------------------------------------------------

function observeSteps(s0: Signals): Note[] {
  const notes: Note[] = [];
  const { steps, stepGoal, now } = s0;

  const streak = currentStreak(steps, stepGoal, now);
  if (streak >= STEP_STREAK_MIN) {
    notes.push({
      ua: `${streak} ${days(streak)} поспіль ти брав ціль по кроках.`,
      en: `${streak} ${s(streak, "day")} running, you've hit the step goal.`,
      source: "кроки",
      weight: 42 + streak * 5,
    });
  }

  const cold = daysSinceEntry(steps, now);
  if (cold !== null && cold >= 2) {
    notes.push({
      ua: `Кроки не записувались ${cold} ${days(cold)}.`,
      en: `No steps logged for ${cold} ${s(cold, "day")}.`,
      source: "кроки",
      weight: 30 + Math.min(cold, 10) * 3,
    });
  }

  return notes;
}

function observeWeight(s0: Signals): Note[] {
  const notes: Note[] = [];
  const { weights, weightGoal, now } = s0;

  const points = series(weights, TREND_DAYS, now);
  const t = trend(points, WEIGHT_FLAT_BAND);
  if (t.logged >= 4 && t.direction !== "flat") {
    const size = Math.abs(t.delta);
    notes.push({
      ua: `Вага ${t.direction === "down" ? "пішла вниз" : "пішла вгору"} на ${kg(size)} кг за два тижні.`,
      en: `Weight is ${t.direction} ${kg(size)} kg over two weeks.`,
      source: "вага · 14 днів",
      weight: 46,
    });
  }

  const latest = Object.keys(weights)
    .filter((key) => weights[key] > 0)
    .sort()
    .pop();
  if (latest && weightGoal > 0) {
    const gap = weights[latest] - weightGoal;
    if (Math.abs(gap) < 0.3) {
      notes.push({
        ua: "Ти на цільовій вазі.",
        en: "You're at your target weight.",
        source: "вага",
        weight: 70,
      });
    }
  }

  return notes;
}

function observeVocabulary(s0: Signals): Note[] {
  const notes: Note[] = [];
  const dated = s0.vocabulary.filter((w) => w.added > 0);
  if (!dated.length) return notes;

  const newest = Math.max(...dated.map((w) => w.added));
  const cold = daysSince(newest, s0.now);
  if (cold >= COLD_VOCAB_DAYS) {
    notes.push({
      ua: `Словник не поповнювався ${cold} ${days(cold)}.`,
      en: `Nothing added to the vocabulary in ${cold} ${s(cold, "day")}.`,
      source: "англійська",
      weight: 28 + Math.min(cold, 10) * 2,
    });
  }

  // Since Monday, because the line says "this week" and has to mean it.
  const monday = startOfWeek(s0.now).getTime();
  const week = dated.filter((w) => w.added >= monday).length;
  if (week >= 5) {
    notes.push({
      ua: `${week} нових ${words(week)} цього тижня.`,
      en: `${week} new ${s(week, "word")} this week.`,
      source: "англійська",
      weight: 44,
    });
  }

  return notes;
}

function observeDeveloper(s0: Signals): Note[] {
  const notes: Note[] = [];
  const { milestones, now } = s0;

  const current = milestones.find((m) => m.status === "in_progress");
  if (current) {
    const age = daysSince(parseSqlDate(current.updated_at).getTime(), now);
    if (age >= FROZEN_ROADMAP_DAYS) {
      notes.push({
        ua: `«${current.title}» в роботі вже ${age} ${days(age)}.`,
        en: `"${current.title}" has been in progress ${age} ${s(age, "day")}.`,
        source: "roadmap",
        weight: 40 + Math.min(age, 20),
      });
    }
  }

  const done = milestones.filter((m) => m.status === "done").length;
  if (milestones.length > 0 && done === milestones.length) {
    notes.push({
      ua: "Roadmap пройдено повністю.",
      en: "The roadmap is fully done.",
      source: "roadmap",
      weight: 95,
    });
  }

  const written = newestUpdate(s0.devNotes);
  if (written !== null) {
    const cold = daysSince(written, now);
    if (cold >= COLD_NOTES_DAYS) {
      notes.push({
        ua: `Нотаток не було ${cold} ${days(cold)}.`,
        en: `No notes written in ${cold} ${s(cold, "day")}.`,
        source: "нотатки",
        weight: 26 + Math.min(cold, 10) * 2,
      });
    }
  }

  return notes;
}

// --- across areas ------------------------------------------------------------

/**
 * The notes that need two areas to be true. These outweigh everything above on
 * purpose: any one screen can tell you its own number, and none of them can
 * tell you that two numbers disagree.
 */
function observeAcross(s0: Signals): Note[] {
  const notes: Note[] = [];
  const { steps, stepGoal, weights, weightGoal, mode, milestones, now } = s0;

  // Cutting while the mileage falls — the two halves of the same plan pulling
  // against each other, which is the whole reason this module exists.
  const stepTrend = trend(series(steps, TREND_DAYS, now), STEPS_FLAT_BAND);
  if (mode !== "maintain" && stepTrend.logged >= 4) {
    const wrongWay =
      (mode === "cut" && stepTrend.direction === "down") ||
      (mode === "bulk" && stepTrend.direction === "down");
    if (wrongWay) {
      notes.push({
        ua: `Ти на ${MODE_UA[mode]}, а кроків стало менше, ніж було.`,
        en: `You're on ${MODE_EN[mode]}, and you're moving less than you were.`,
        source: "режим + кроки",
        weight: 88,
      });
    }
  }

  const run = slowRun(steps, stepGoal, now);
  if (run >= SLOW_RUN_MIN && mode === "cut") {
    notes.push({
      ua: `${run} ${days(run)} поспіль менше половини цілі по кроках — на сушці.`,
      en: `${run} ${s(run, "day")} running under half the step goal, on a cut.`,
      source: "режим + кроки",
      weight: 92,
    });
  }

  // A regime is a claim about a number you are not writing down.
  if (mode !== "maintain" && weightGoal > 0) {
    const cold = daysSinceEntry(weights, now);
    if (cold === null || cold >= UNWEIGHED_DAYS) {
      notes.push({
        ua:
          cold === null
            ? `Режим — ${MODE_UA[mode]}, а ваги в журналі жодної.`
            : `Режим — ${MODE_UA[mode]}, а ти не важився ${cold} ${days(cold)}.`,
        en:
          cold === null
            ? `You're on ${MODE_EN[mode]} with nothing on the scale yet.`
            : `You're on ${MODE_EN[mode]} and haven't weighed in for ${cold} ${s(cold, "day")}.`,
        source: "режим + вага",
        weight: 84,
      });
    }
  }

  // Closing tasks while the plan they were meant to serve stands still.
  const current = milestones.find((m) => m.status === "in_progress");
  if (current) {
    const frozen = daysSince(parseSqlDate(current.updated_at).getTime(), now);
    const closed = Object.entries(s0.completions)
      .filter(([key]) => {
        const [y, m, d] = key.split("-").map(Number);
        return daysSince(new Date(y, m - 1, d).getTime(), now) < frozen;
      })
      .reduce((sum, [, n]) => sum + n, 0);

    if (frozen >= FROZEN_ROADMAP_DAYS && closed >= 5) {
      notes.push({
        ua: `Roadmap стоїть ${frozen} ${days(frozen)}, а задач за цей час закрито ${closed}. Рухається не те, що планувалось.`,
        en: `The roadmap hasn't moved in ${frozen} ${s(frozen, "day")}, but ${closed} tasks closed in that time. You're moving, just not the plan.`,
        source: "roadmap + журнал",
        weight: 86,
      });
    }
  }

  // One status held far too long to still be describing anything.
  const newest = s0.statusLog[0];
  if (newest) {
    const held = (now.getTime() - clockOf(newest.at).getTime()) / 3600000;
    if (held >= STALE_STATUS_HOURS) {
      const whole = Math.floor(held);
      notes.push({
        ua: `Статус «${newest.status}» стоїть ${whole} ${plural(whole, "годину", "години", "годин")}.`,
        en: `Status "${newest.status}" has been up for ${whole} ${s(whole, "hour")}.`,
        source: "журнал статусів",
        weight: 62,
      });
    }
  }

  // The day where everything lined up. Worth saying, and rare enough that the
  // weight can sit above every complaint.
  const load = todayLoad(s0.todos, now);
  const todayKey = toKey(now);
  const stepsToday = steps[todayKey] ?? 0;
  if (
    load.done > 0 &&
    load.open === 0 &&
    stepGoal > 0 &&
    stepsToday >= stepGoal
  ) {
    notes.push({
      ua: `Задачі закриті, ${fmt(stepsToday)} кроків, ціль узята. Сьогодні зійшлось усе.`,
      en: `Tasks closed, ${fmt(stepsToday)} steps, goal met. Everything lined up today.`,
      source: "задачі + кроки",
      weight: 96,
    });
  }

  return notes;
}

// --- the briefing ------------------------------------------------------------

/**
 * Everything true right now, strongest first. Todo notes come from the module
 * that already wrote them well — this adds the rest of the areas and the joins
 * between them rather than restating what is there.
 */
export function observeAll(s0: Signals): Note[] {
  return [
    ...observeAcross(s0),
    ...observeSteps(s0),
    ...observeWeight(s0),
    ...observeVocabulary(s0),
    ...observeDeveloper(s0),
    ...observeTodos(s0.todos, s0.completions, s0.now),
  ].sort((a, b) => b.weight - a.weight);
}

/**
 * The briefing: the strongest few, one per source. Without the second rule a
 * quiet fortnight of steps would fill all three slots with three ways of saying
 * the same thing, and the point of reading every area is lost.
 */
export function brief(s0: Signals, count = 3): Note[] {
  const seen = new Set<string>();
  const picked: Note[] = [];

  for (const note of observeAll(s0)) {
    const area = note.source.split(" ")[0];
    if (seen.has(area)) continue;
    seen.add(area);
    picked.push(note);
    if (picked.length === count) break;
  }

  return picked;
}

export type { Note };
