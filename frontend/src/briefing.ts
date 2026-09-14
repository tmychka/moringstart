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
import { topicBySlug } from "./developerTopics";
import { observe as observeTodos, type Note } from "./encouragement";
import type { StoredWord } from "./englishWords";
import {
  STEPS_FLAT_BAND,
  TREND_DAYS,
  WEIGHT_FLAT_BAND,
  clockOf,
  kg,
  series,
  statusTotals,
  todaySpans,
  trend,
} from "./jarvis";
import { days, daysSince, plural, s, words } from "./plural";
import { parseSqlDate } from "./dashboardStats";
import { fmt, toKey } from "./stepsUtil";
import type { CompletionLog, Todo } from "./todos";
import { formatMinutes, todayLoad } from "./todos";
import { planOf, weekStreak } from "./training";
import type {
  Note as ApiNote,
  ProfileMode,
  StatusEntry,
  StepEntries,
  WeightEntries,
  WorkoutSession,
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
  /** Every session ever logged, newest first — the training area's own list. */
  workouts: WorkoutSession[];
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
/** A subject with nothing new in it for this long has quietly been dropped. */
const COLD_SUBJECT_DAYS = 12;
/** Enough unfiled notes for the filing itself to be worth a line. */
const UNFILED_NOTES = 5;
/** One status held this long has almost certainly stopped being true. */
const STALE_STATUS_HOURS = 4;
/** A gap this long stops being a rest day and starts being a stopped habit. */
const COLD_TRAINING_DAYS = 4;
/** Past this hour a day with no status on it is a day that went unrecorded. */
const UNLOGGED_STATUS_HOUR = 12;
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

/** Whole days between a `YYYY-MM-DD` day and today, counted by local midnights. */
const daysSinceKey = (key: string, now: Date): number => {
  const [y, m, d] = key.split("-").map(Number);
  return daysSince(new Date(y, m - 1, d).getTime(), now);
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
  return latest === undefined ? null : daysSinceKey(latest, now);
};

/**
 * The sessions that actually happened.
 *
 * A session with no sets in it is an intention — the training page opens one the
 * moment a routine is picked — so counting those would report a workout for
 * every time the screen was opened and closed again.
 */
const trained = (workouts: WorkoutSession[]): WorkoutSession[] =>
  workouts.filter((session) => session.sets.length > 0);

/** Days since the last real session; null when there has never been one. */
const daysSinceTraining = (
  workouts: WorkoutSession[],
  now: Date
): number | null => {
  const latest = trained(workouts)
    .map((session) => session.date)
    .sort()
    .pop();
  return latest === undefined ? null : daysSinceKey(latest, now);
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

/** How a note count reads in Ukrainian. */
const noteWord = (n: number): string =>
  plural(n, "нотатка", "нотатки", "нотаток");

/**
 * The notes behind "Learn to code" — what was written, and what is going cold.
 *
 * The subject line is the one this area was missing most. Notes are filed under
 * a subject, and a subject nobody has added to in a fortnight is exactly what
 * the revision card on the dashboard is drawing from: material that is sitting
 * there, unread and unextended.
 *
 * The last line is a floor. Everything above it is conditional, and an area that
 * can only speak when a threshold is crossed is an area that says nothing on the
 * days you are actually working — so as long as there is a single note, there is
 * something true to report.
 */
function observeNotes(s0: Signals): Note[] {
  const notes: Note[] = [];
  const { devNotes, now } = s0;
  if (devNotes.length === 0) {
    return [
      {
        ua: "У «Learn to code» ще жодної нотатки — писати нема з чого повторювати.",
        en: "Nothing written in Learn to code yet — nothing to revise from.",
        source: "нотатки",
        weight: 20,
      },
    ];
  }

  const stamped = devNotes
    .map((note) => ({ note, at: parseSqlDate(note.updated_at).getTime() }))
    .filter(({ at }) => Number.isFinite(at));
  const newest = Math.max(...stamped.map(({ at }) => at));
  const cold = daysSince(newest, now);

  const todayCount = stamped.filter(
    ({ at }) => daysSince(at, now) === 0
  ).length;
  if (todayCount > 0) {
    notes.push({
      ua: `${todayCount} ${noteWord(todayCount)} сьогодні.`,
      en: `${todayCount} ${s(todayCount, "note")} written today.`,
      source: "нотатки",
      weight: 52,
    });
  }

  // Since Monday, because the line says "this week" and has to mean it.
  const monday = startOfWeek(now).getTime();
  const week = stamped.filter(({ at }) => at >= monday).length;
  if (week >= 3) {
    notes.push({
      ua: `${week} ${noteWord(week)} цього тижня.`,
      en: `${week} ${s(week, "note")} this week.`,
      source: "нотатки",
      weight: 46,
    });
  }

  if (cold >= COLD_NOTES_DAYS) {
    notes.push({
      ua: `Нотаток не було ${cold} ${days(cold)}.`,
      en: `No notes written in ${cold} ${s(cold, "day")}.`,
      source: "нотатки",
      weight: 26 + Math.min(cold, 10) * 2,
    });
  }

  // The subject that has gone quietest. Only the ones that have something in
  // them: a subject never started is a subject you have not chosen yet, which is
  // not the same as one you have dropped.
  const bySubject = new Map<string, number>();
  for (const { note, at } of stamped) {
    if (!note.topic) continue;
    bySubject.set(note.topic, Math.max(bySubject.get(note.topic) ?? 0, at));
  }
  const coldest = [...bySubject]
    .map(([topic, at]) => ({ topic, age: daysSince(at, now) }))
    .sort((a, b) => b.age - a.age)[0];
  if (coldest && coldest.age >= COLD_SUBJECT_DAYS) {
    const label = topicBySlug(coldest.topic)?.label ?? coldest.topic;
    notes.push({
      ua: `Найдовше без нових нотаток — ${label}, ${coldest.age} ${days(coldest.age)}.`,
      en: `Longest without a new note — ${label}, ${coldest.age} ${s(coldest.age, "day")}.`,
      source: "нотатки · теми",
      weight: 38,
    });
  }

  // Worth saying differently when it is all of them: "10 нотаток без теми"
  // directly above "10 нотаток у Learn to code" is the same number twice, which
  // reads as the panel repeating itself rather than as two separate facts.
  const untagged = devNotes.filter((note) => !note.topic).length;
  if (untagged >= UNFILED_NOTES) {
    notes.push({
      ua:
        untagged === devNotes.length
          ? `Жодна з ${untagged} ${noteWord(untagged)} не розкладена по темах.`
          : `${untagged} ${noteWord(untagged)} лежать без теми.`,
      en:
        untagged === devNotes.length
          ? `Not one of the ${untagged} notes is filed under a subject.`
          : `${untagged} ${s(untagged, "note")} are filed under no subject.`,
      source: "нотатки",
      weight: 18,
    });
  }

  notes.push({
    ua: `${devNotes.length} ${noteWord(devNotes.length)} у «Learn to code», остання ${cold === 0 ? "сьогодні" : cold === 1 ? "вчора" : `${cold} ${days(cold)} тому`}.`,
    en: `${devNotes.length} ${s(devNotes.length, "note")} in Learn to code, the last one ${cold === 0 ? "today" : `${cold} ${s(cold, "day")} ago`}.`,
    source: "нотатки",
    weight: 12,
  });

  return notes;
}

/**
 * Training. The area keeps a session per day with the sets inside it, so what
 * this can say is the same three things every habit has: it is running, it has
 * stopped, or something was left half-done.
 */
function observeTraining(s0: Signals): Note[] {
  const notes: Note[] = [];
  const { workouts, now } = s0;
  const done = trained(workouts);
  if (done.length === 0) return notes;

  const todayKey = toKey(now);
  const dates = new Set(done.map((session) => session.date));

  const streak = weekStreak(dates, now);
  if (streak >= 2) {
    notes.push({
      ua: `${streak} ${plural(streak, "тиждень", "тижні", "тижнів")} поспіль із тренуванням.`,
      en: `${streak} ${s(streak, "week")} running with a workout in them.`,
      source: "тренування",
      weight: 44 + streak * 4,
    });
  }

  const today = done.find(
    (session) => session.date === todayKey && session.finished_at
  );
  if (today) {
    notes.push({
      ua: `Сьогодні закрито «${planOf(today.kind).label}» — ${today.sets.length} ${plural(today.sets.length, "підхід", "підходи", "підходів")}.`,
      en: `"${planOf(today.kind).label}" closed today — ${today.sets.length} ${s(today.sets.length, "set")}.`,
      source: "тренування",
      weight: 68,
    });
  }

  const cold = daysSinceTraining(workouts, now);
  if (cold !== null && cold >= COLD_TRAINING_DAYS) {
    notes.push({
      ua: `Тренувань не було ${cold} ${days(cold)}.`,
      en: `No training for ${cold} ${s(cold, "day")}.`,
      source: "тренування",
      weight: 34 + Math.min(cold, 10) * 3,
    });
  }

  // Left open on a day that is over: the sets are logged, the session never got
  // finished, so every count that reads `finished_at` quietly skips it.
  const open = done.find(
    (session) => !session.finished_at && session.date < todayKey
  );
  if (open) {
    const age = daysSinceKey(open.date, now);
    notes.push({
      ua: `Тренування «${planOf(open.kind).label}» ${age === 1 ? "за вчора" : `за ${age} ${days(age)} тому`} лишилось незакритим.`,
      en: `The "${planOf(open.kind).label}" session from ${age} ${s(age, "day")} ago was never finished.`,
      source: "тренування",
      weight: 52,
    });
  }

  return notes;
}

/**
 * The status log, as a record of the day rather than as a label.
 *
 * The timeline across the top of the dashboard is drawn from these rows, so what
 * is missing from it is now visible at a glance — which makes an empty afternoon
 * worth one line, and a day with hours in it worth saying where they went.
 */
function observeStatus(s0: Signals): Note[] {
  const notes: Note[] = [];
  const { statusLog, now } = s0;

  const totals = statusTotals(todaySpans(statusLog, now));
  const logged = totals.reduce((sum, total) => sum + total.minutes, 0);

  if (logged === 0) {
    if (now.getHours() >= UNLOGGED_STATUS_HOUR) {
      notes.push({
        ua: "Сьогодні жодного статусу не ставилось — день ніде не записаний.",
        en: "No status set today — nothing of the day is on the record.",
        source: "журнал статусів",
        weight: 38,
      });
    }
    return notes;
  }

  // Only once there is enough of a day for a share of it to mean anything.
  if (logged >= 120) {
    const top = totals[0];
    notes.push({
      ua: `Сьогодні записано ${formatMinutes(logged)}, найбільше — «${top.status}» (${formatMinutes(top.minutes)}).`,
      en: `${formatMinutes(logged)} on the record today, most of it "${top.status}" (${formatMinutes(top.minutes)}).`,
      source: "журнал статусів",
      weight: 30,
    });
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
  const { steps, stepGoal, weights, weightGoal, mode, now } = s0;

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

  // A regime is also a claim about work you are or are not doing. Cutting and
  // bulking both run on training — one to keep the muscle, one to build it — so
  // a fortnight of neither is the plan existing only on the scale.
  const coldTraining = daysSinceTraining(s0.workouts, now);
  if (mode !== "maintain" && coldTraining !== null) {
    if (coldTraining >= COLD_TRAINING_DAYS) {
      notes.push({
        ua: `Ти на ${MODE_UA[mode]}, а тренувань не було ${coldTraining} ${days(coldTraining)}.`,
        en: `You're on ${MODE_EN[mode]} and haven't trained in ${coldTraining} ${s(coldTraining, "day")}.`,
        source: "режим + тренування",
        weight: 86,
      });
    }
  }

  // An hour of learning that left nothing behind. The status log says the time
  // went in; the notes say there will be nothing to revise from tomorrow — and
  // neither screen can see the other's half of that.
  const learning = statusTotals(todaySpans(s0.statusLog, now)).find((total) =>
    /learn|навч|вивч/i.test(total.status)
  );
  if (learning && learning.minutes >= 60) {
    const wroteToday = s0.devNotes.some(
      (note) => daysSince(parseSqlDate(note.updated_at).getTime(), now) === 0
    );
    if (!wroteToday) {
      notes.push({
        ua: `${formatMinutes(learning.minutes)} сьогодні в статусі «${learning.status}», а нотаток за сьогодні жодної.`,
        en: `${formatMinutes(learning.minutes)} on "${learning.status}" today, and not one note written.`,
        source: "статуси + нотатки",
        weight: 80,
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
    ...observeNotes(s0),
    ...observeTraining(s0),
    ...observeStatus(s0),
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
