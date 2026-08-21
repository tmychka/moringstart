/**
 * The two routines training is made of, and everything read back out of the
 * sessions they produce.
 *
 * The plan lives here rather than in the database for the same reason the area
 * list does: it is part of the app, not something added at runtime. A stored
 * set only carries the exercise's slug, so the plan can gain an exercise, or
 * change what a target set looks like, without a migration — and sets logged
 * against an exercise no longer in the plan still read back (see `exerciseName`).
 */
import type { WorkoutKind, WorkoutSession, WorkoutSet } from "./types";
import type { IconName } from "./components/Sidebar";

/**
 * What a set of an exercise is counted in. A hold is still stored in the `reps`
 * column — the server only ever sees a whole number per set, and giving a plank
 * its own column would mean a migration to record something the same integer
 * already says. What the number *means* is a property of the exercise, so it
 * belongs here, and every readout goes through `unitOf` to find it.
 */
export type Unit = "reps" | "seconds";

export interface Exercise {
  /** Stored on every set; the one thing about an exercise that must not change. */
  slug: string;
  name: string;
  /** What it works, shown under the name so the routine reads as a plan. */
  muscle: string;
  /**
   * Whether a set carries a weight. Bodyweight sets are still logged with a
   * weight column of 0, which is what lets one table hold both routines — but
   * the UI hides the field, and totals count reps instead of kilograms.
   */
  weighted: boolean;
  unit: Unit;
  /** What the plan asks for. A target, not a limit — sets above it still log. */
  sets: number;
  /** Reps per set, or seconds held, depending on `unit`. */
  target: number;
  /**
   * What the number field is called. Seconds are seconds either way, but a
   * plank is held and a rope is skipped in rounds, and the field is the one
   * place on screen where saying which costs nothing.
   */
  inputLabel?: string;
}

/**
 * The words a one-exercise session needs, and the mark it goes by. Carrying
 * them is also what *makes* a plan a session of its own: the sidebar, the
 * routing and the strip all read this one field rather than each keeping their
 * own list of which kinds are which.
 */
export interface SoloWords {
  /** One set of it: a hold, a round. */
  effort: string;
  /** What was done, in the past tense: held, skipped. */
  verb: string;
  icon: IconName;
}

export interface WorkoutPlan {
  kind: WorkoutKind;
  label: string;
  /** One line on the start card, saying what the routine is for. */
  blurb: string;
  /** Seconds of rest suggested between sets of this routine. */
  rest: number;
  exercises: Exercise[];
  /** Set only on the single-exercise sessions — see `SOLO`. */
  solo?: SoloWords;
}

/** A plan that is one exercise, and so gets its own page and sidebar entry. */
export type SoloPlan = WorkoutPlan & { solo: SoloWords };

export const STRENGTH: WorkoutPlan = {
  kind: "strength",
  label: "Strength",
  blurb: "Bench, arms and shoulders — logged with the weight on the bar.",
  rest: 120,
  exercises: [
    {
      slug: "bench-press",
      name: "Bench press",
      muscle: "Chest",
      weighted: true,
      unit: "reps",
      sets: 4,
      target: 8,
    },
    {
      slug: "french-press",
      name: "French press",
      muscle: "Triceps",
      weighted: true,
      unit: "reps",
      sets: 3,
      target: 10,
    },
    {
      slug: "biceps-curl",
      name: "Biceps curl",
      muscle: "Biceps",
      weighted: true,
      unit: "reps",
      sets: 3,
      target: 10,
    },
    {
      slug: "lateral-raise",
      name: "Lateral raises",
      muscle: "Shoulders",
      weighted: true,
      unit: "reps",
      sets: 3,
      target: 12,
    },
  ],
};

export const SIMPLE: WorkoutPlan = {
  kind: "simple",
  label: "Simple",
  blurb: "Bar, bars and the floor — nothing to load, only your own weight.",
  rest: 90,
  exercises: [
    {
      slug: "pull-up",
      name: "Pull-ups",
      muscle: "Back · biceps",
      weighted: false,
      unit: "reps",
      sets: 4,
      target: 8,
    },
    {
      slug: "dip",
      name: "Dips",
      muscle: "Chest · triceps",
      weighted: false,
      unit: "reps",
      sets: 4,
      target: 10,
    },
    {
      slug: "push-up",
      name: "Push-ups",
      muscle: "Chest · shoulders",
      weighted: false,
      unit: "reps",
      sets: 4,
      target: 15,
    },
    {
      slug: "squat",
      name: "Squats",
      muscle: "Legs",
      weighted: false,
      unit: "reps",
      sets: 4,
      target: 20,
    },
  ],
};

/**
 * A session of one exercise. It is its own routine rather than the last line of
 * the bodyweight one because it is the only thing here you can do in a minute
 * between other work — tying it to a full routine would mean never doing it on
 * the days there is no time for one.
 */
export const PLANK: WorkoutPlan = {
  kind: "plank",
  label: "Plank",
  blurb: "Three holds and nothing else. Short enough to fit in any day.",
  rest: 60,
  solo: { effort: "hold", verb: "held", icon: "timer" },
  exercises: [
    {
      slug: "plank",
      name: "Plank",
      muscle: "Core",
      weighted: false,
      unit: "seconds",
      sets: 3,
      target: 45,
      inputLabel: "Hold, sec",
    },
  ],
};

/**
 * Rounds rather than a count of jumps: skipping is timed everywhere it is
 * taught, and counting to three hundred while you skip is a good way to lose
 * count of both.
 */
export const ROPE: WorkoutPlan = {
  kind: "rope",
  label: "Jump rope",
  blurb: "Three rounds on the clock. The warm-up that is also the workout.",
  rest: 60,
  solo: { effort: "round", verb: "skipped", icon: "rope" },
  exercises: [
    {
      slug: "jump-rope",
      name: "Jump rope",
      muscle: "Calves · wind",
      weighted: false,
      unit: "seconds",
      sets: 3,
      target: 180,
      inputLabel: "Round, sec",
    },
  ],
};

/** Every plan there is — what an exercise or a stored session is looked up in. */
export const PLANS: WorkoutPlan[] = [STRENGTH, SIMPLE, PLANK, ROPE];

/**
 * The one-exercise sessions, in sidebar order. Derived rather than listed, so a
 * new one is a plan with `solo` on it and nothing else to remember.
 */
export const SOLO: SoloPlan[] = PLANS.filter(
  (plan): plan is SoloPlan => !!plan.solo
);

/**
 * The two the Today page offers as a choice. The solo sessions are left out on
 * purpose: each has its own entry in the sidebar, and putting them here too
 * would make one evening look like four ways to spend it.
 */
export const ROUTINES: WorkoutPlan[] = [STRENGTH, SIMPLE];

const BY_KIND: Record<WorkoutKind, WorkoutPlan> = {
  strength: STRENGTH,
  simple: SIMPLE,
  plank: PLANK,
  rope: ROPE,
};

export const planOf = (kind: WorkoutKind): WorkoutPlan => BY_KIND[kind];

/**
 * The section a session belongs to. A solo session lives under its own slug and
 * the routines share Today, which is what keeps one running in the background
 * from taking over a page it has nothing to do with.
 */
export const sectionOf = (kind: WorkoutKind): string =>
  planOf(kind).solo ? kind : "today";

const EXERCISES = new Map<string, Exercise>(
  PLANS.flatMap((plan) => plan.exercises).map((ex) => [ex.slug, ex])
);

/**
 * A readable name for a slug that is no longer in the plan. History outlives
 * the plan, so a session logged against a dropped exercise has to render as
 * something — its slug, tidied up, rather than a blank row.
 */
export const exerciseName = (slug: string): string =>
  EXERCISES.get(slug)?.name ??
  slug.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());

/** Whether a slug's sets carry a weight; unknown slugs are read off their data. */
export const isWeighted = (slug: string, sets: WorkoutSet[] = []): boolean =>
  EXERCISES.get(slug)?.weighted ?? sets.some((set) => set.weight > 0);

/**
 * What a slug's sets are counted in. Reps for anything the plan has forgotten:
 * a number of repetitions is what a set has meant everywhere else, so it is the
 * reading that mislabels the fewest rows.
 */
export const unitOf = (slug: string): Unit =>
  EXERCISES.get(slug)?.unit ?? "reps";

/** One set as it is written in a list of them: `8×40`, `12`, `45`. */
export const setLabel = (set: WorkoutSet, slug: string): string =>
  isWeighted(slug, [set]) ? `${set.reps}×${kg(set.weight)}` : String(set.reps);

/** The unit those numbers are in, for the tail of such a list. */
export const unitLabel = (slug: string, sets: WorkoutSet[] = []): string =>
  isWeighted(slug, sets) ? "kg" : unitOf(slug) === "seconds" ? "s" : "reps";

/** A single hold: seconds while it reads as seconds, m:ss once it doesn't. */
export const hold = (seconds: number): string =>
  seconds < 60 ? `${seconds} s` : clock(seconds);

// --- Sections ---

export interface TrainingSection {
  slug: string;
  label: string;
  icon: IconName;
}

// The solo sessions sit between the routines and the record, in plan order, so
// adding one never means editing this list.
export const TRAINING_SECTIONS: TrainingSection[] = [
  { slug: "today", label: "Today", icon: "dumbbell" },
  ...SOLO.map((plan) => ({
    slug: plan.kind,
    label: plan.label,
    icon: plan.solo.icon,
  })),
  { slug: "history", label: "History", icon: "activity" },
];

/** Where a bare `/training` lands, so a section is always the current page. */
export const DEFAULT_TRAINING_SECTION = TRAINING_SECTIONS[0];

export const trainingSectionBySlug = (
  slug: string | undefined
): TrainingSection | undefined =>
  TRAINING_SECTIONS.find((section) => section.slug === slug);

// --- Reading sessions back ---

export interface Totals {
  sets: number;
  reps: number;
  /** Seconds held, kept apart from `reps` — 45 seconds is not 45 repetitions. */
  seconds: number;
  /** Kilograms moved: reps × weight, summed. 0 for a bodyweight session. */
  volume: number;
}

export const totalsOf = (sets: WorkoutSet[]): Totals =>
  sets.reduce<Totals>(
    (acc, set) => {
      const held = unitOf(set.exercise) === "seconds";
      return {
        sets: acc.sets + 1,
        reps: acc.reps + (held ? 0 : set.reps),
        seconds: acc.seconds + (held ? set.reps : 0),
        volume: acc.volume + set.reps * set.weight,
      };
    },
    { sets: 0, reps: 0, seconds: 0, volume: 0 }
  );

export const setsOf = (
  session: WorkoutSession,
  exercise: string
): WorkoutSet[] => session.sets.filter((set) => set.exercise === exercise);

/**
 * How much of the plan a session has covered, as a fraction. An exercise counts
 * once it has as many sets as the plan asks for — partial ones pull their own
 * weight, so the bar moves on every set rather than only on the last of four.
 */
export const progressOf = (session: WorkoutSession): number => {
  const plan = planOf(session.kind);
  const target = plan.exercises.reduce((sum, ex) => sum + ex.sets, 0);
  if (target === 0) return 0;
  const done = plan.exercises.reduce(
    (sum, ex) => sum + Math.min(ex.sets, setsOf(session, ex.slug).length),
    0
  );
  return done / target;
};

/**
 * The sets of an exercise the last time it was trained, skipping the session
 * being logged now. This is the number that actually drives a workout: what to
 * beat is last time's, and having to remember it is what a log is for.
 */
export const lastEffort = (
  sessions: WorkoutSession[],
  exercise: string,
  exceptId: number
): { date: string; sets: WorkoutSet[] } | null => {
  for (const session of sessions) {
    if (session.id === exceptId) continue;
    const sets = setsOf(session, exercise);
    if (sets.length > 0) return { date: session.date, sets };
  }
  return null;
};

/**
 * The single best set of an exercise: heaviest if loaded, otherwise the biggest
 * number — most reps, or longest held, which is the same comparison because
 * both live in the same column.
 */
export interface Best {
  set: WorkoutSet;
  date: string;
}

export const bestSets = (sessions: WorkoutSession[]): Map<string, Best> => {
  const best = new Map<string, Best>();
  for (const session of sessions) {
    for (const set of session.sets) {
      const current = best.get(set.exercise);
      const beats = !current
        ? true
        : isWeighted(set.exercise)
          ? set.weight > current.set.weight ||
            (set.weight === current.set.weight && set.reps > current.set.reps)
          : set.reps > current.set.reps;
      if (beats) best.set(set.exercise, { set, date: session.date });
    }
  }
  return best;
};

/**
 * Consecutive weeks, counting back from the one containing `today`, with at
 * least one session in them. A daily streak would be the wrong measure — nobody
 * lifts seven days a week, and a rest day should not read as a broken streak —
 * so the unit is the week, and the current one is only counted once it has a
 * session in it rather than breaking the run before it has had a chance.
 */
export const weekStreak = (dates: Set<string>, today: Date): number => {
  const monday = startOfWeek(today);
  const hasSession = (start: Date): boolean => {
    for (let i = 0; i < 7; i++)
      if (dates.has(toKey(addDays(start, i)))) return true;
    return false;
  };

  let streak = 0;
  let cursor = hasSession(monday) ? monday : addDays(monday, -7);
  while (hasSession(cursor)) {
    streak++;
    cursor = addDays(cursor, -7);
  }
  return streak;
};

/**
 * Which routine to offer first: whichever was not the last one done. Solo
 * sessions are skipped over rather than counted — they are what you fit around
 * the routines, not a turn in the rotation between them.
 */
export const suggestedKind = (sessions: WorkoutSession[]): WorkoutKind => {
  const last = sessions.find(
    (session) => session.sets.length > 0 && !planOf(session.kind).solo
  );
  return last?.kind === "strength" ? "simple" : "strength";
};

// --- Dates ---

export const toKey = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;

export const addDays = (d: Date, n: number): Date => {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
};

/** Monday of the week `d` falls in, at local midnight. */
export const startOfWeek = (d: Date): Date => {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  r.setDate(r.getDate() - ((r.getDay() + 6) % 7));
  return r;
};

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** "20 Aug" from a YYYY-MM-DD key, without going through Date parsing rules. */
export const dayLabel = (key: string): string => {
  const [, month, day] = key.split("-").map(Number);
  return `${day} ${MONTHS[month - 1] ?? ""}`.trim();
};

export const monthLabel = (key: string): string => {
  const [year, month] = key.split("-").map(Number);
  return `${MONTHS[month - 1] ?? ""} ${year}`;
};

/** "today", "yesterday", "3 days ago" — how long since a session's day. */
export const sinceLabel = (key: string, today: Date): string => {
  const [y, m, d] = key.split("-").map(Number);
  const days = Math.round(
    (new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate()
    ).getTime() -
      new Date(y, m - 1, d).getTime()) /
      86400000
  );
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 14) return "last week";
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`;
  return `${Math.floor(days / 30)} months ago`;
};

/** Elapsed time as m:ss, or h:mm:ss once a workout runs past the hour. */
export const clock = (seconds: number): string => {
  const s = Math.max(0, Math.floor(seconds));
  const mm = Math.floor(s / 60) % 60;
  const ss = String(s % 60).padStart(2, "0");
  const hh = Math.floor(s / 3600);
  return hh > 0 ? `${hh}:${String(mm).padStart(2, "0")}:${ss}` : `${mm}:${ss}`;
};

/** Thousands spaced, and never a trailing ".0" on a half-kilo plate. */
export const kg = (n: number): string => {
  const rounded = Math.round(n * 10) / 10;
  const [whole, fraction] = String(rounded).split(".");
  const spaced = whole.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return fraction ? `${spaced}.${fraction}` : spaced;
};

/**
 * A stored `finished_at`/`created_at` is a UTC `YYYY-MM-DD HH:MM:SS` with no
 * zone on it, which `new Date()` reads as local time — an hours-wide error on
 * the session timer. Naming the zone is what keeps the clock honest.
 */
export const parseStamp = (stamp: string): number =>
  Date.parse(`${stamp.replace(" ", "T")}Z`);
