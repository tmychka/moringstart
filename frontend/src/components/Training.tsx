import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import AppSidebar from "./AppSidebar";
import type { SidebarLink } from "./Sidebar";
import {
  deleteSet,
  deleteWorkout,
  getWorkouts,
  logSet,
  setWorkoutFinished,
  startWorkout,
  updateSet,
} from "../api";
import { TRAINING } from "../areas";
import { s } from "../plural";
import { cardClass, labelClass, numeralClass, useTheme } from "../theme";
import useNow from "../useNow";
import {
  PLANS,
  ROUTINES,
  SOLO,
  TRAINING_SECTIONS,
  WEEKDAYS,
  addDays,
  bestSets,
  clock,
  dayLabel,
  exerciseName,
  hold,
  kg,
  lastEffort,
  monthLabel,
  parseStamp,
  planOf,
  progressOf,
  sectionOf,
  setLabel,
  setsOf,
  sinceLabel,
  unitLabel,
  startOfWeek,
  suggestedKind,
  toKey,
  totalsOf,
  weekStreak,
  type Exercise,
  type SoloPlan,
} from "../training";
import type { Theme, WorkoutKind, WorkoutSession, WorkoutSet } from "../types";

const SECTION_LINKS: SidebarLink[] = TRAINING_SECTIONS.map((section) => ({
  icon: section.icon,
  label: section.label,
  to: `/${TRAINING.slug}/${section.slug}`,
}));

/**
 * Weeks the activity strip shows, counting back from the current one. Half a
 * year, at a fixed cell size rather than a share of the column: a day is a
 * square you glance at, and stretching 84 of them across a wide screen turns a
 * strip you read in one look into a wall of tiles.
 */
const STRIP_WEEKS = 26;

/** How far a stepper will go, so a slip on the keyboard can't log 900 kg. */
const MAX_REPS = 100;
const MAX_WEIGHT = 300;
/** Ten minutes: past that it stops being a set and starts being a nap. */
const MAX_HOLD = 600;

/**
 * How a stepper behaves for the unit its exercise is counted in. The label is
 * only a fallback — an exercise that has a better word for its own number says
 * so itself (`inputLabel`).
 */
const STEPPERS = {
  reps: { label: "Reps", step: 1, min: 1, max: MAX_REPS },
  seconds: { label: "Seconds", step: 5, min: 5, max: MAX_HOLD },
} as const;

// --- Data ---

/**
 * The whole history, plus the writes against it. Every mutation folds its own
 * response into the cache rather than refetching: a workout is a fast loop of
 * small writes, and a round trip after each one is what makes a log feel like
 * paperwork. A failed write falls back to a refetch, so the screen can't drift
 * from the server for longer than one action.
 */
function useWorkouts() {
  const id = TRAINING.metricId;
  const queryClient = useQueryClient();
  const key = useMemo(() => ["workouts", id], [id]);

  const { data, isLoading } = useQuery({
    queryKey: key,
    queryFn: () => getWorkouts(id),
  });

  const write = (updater: (prev: WorkoutSession[]) => WorkoutSession[]) =>
    queryClient.setQueryData<WorkoutSession[]>(key, (prev) =>
      updater(prev ?? [])
    );
  const reload = () => {
    void queryClient.invalidateQueries({ queryKey: key });
  };
  const replace = (session: WorkoutSession) =>
    write((prev) => prev.map((s) => (s.id === session.id ? session : s)));
  const patchSets = (
    sessionId: number,
    updater: (sets: WorkoutSet[]) => WorkoutSet[]
  ) =>
    write((prev) =>
      prev.map((s) =>
        s.id === sessionId ? { ...s, sets: updater(s.sets) } : s
      )
    );

  const start = useMutation({
    mutationFn: ({ date, kind }: { date: string; kind: WorkoutKind }) =>
      startWorkout(id, date, kind),
    // Resuming returns a session already in the list, so it is replaced rather
    // than prepended a second time.
    onSuccess: (session) =>
      write((prev) => [session, ...prev.filter((s) => s.id !== session.id)]),
    onError: reload,
  });

  const finish = useMutation({
    mutationFn: (sessionId: number) => setWorkoutFinished(sessionId, true),
    onSuccess: replace,
    onError: reload,
  });

  const discard = useMutation({
    mutationFn: (sessionId: number) => deleteWorkout(sessionId),
    onSuccess: (_result, sessionId) =>
      write((prev) => prev.filter((s) => s.id !== sessionId)),
    onError: reload,
  });

  const addSet = useMutation({
    mutationFn: (vars: {
      sessionId: number;
      exercise: string;
      reps: number;
      weight: number;
    }) => logSet(vars.sessionId, vars.exercise, vars.reps, vars.weight),
    onSuccess: (set) => patchSets(set.session_id, (sets) => [...sets, set]),
    onError: reload,
  });

  const editSet = useMutation({
    mutationFn: (vars: { setId: number; reps: number; weight: number }) =>
      updateSet(vars.setId, vars.reps, vars.weight),
    onSuccess: (set) =>
      patchSets(set.session_id, (sets) =>
        sets.map((s) => (s.id === set.id ? set : s))
      ),
    onError: reload,
  });

  const dropSet = useMutation({
    mutationFn: (vars: { sessionId: number; setId: number }) =>
      deleteSet(vars.setId),
    onSuccess: (_result, { sessionId, setId }) =>
      patchSets(sessionId, (sets) => sets.filter((s) => s.id !== setId)),
    onError: reload,
  });

  return {
    sessions: data ?? [],
    isLoading,
    start,
    finish,
    discard,
    addSet,
    editSet,
    dropSet,
  };
}

type Actions = ReturnType<typeof useWorkouts>;

// --- Page ---

export default function Training({ section }: { section: string }) {
  const { t } = useTheme();
  // The day has to roll over under a page that says "today" on it.
  const now = useNow();
  const todayKey = toKey(now);
  const store = useWorkouts();
  const scroller = useRef<HTMLDivElement>(null);

  // A workout is live only if it is today's: one left unfinished on Monday is
  // history by Wednesday, and reopening it then would file Wednesday's sets
  // under Monday.
  //
  // Each section owns its own kinds, so a rope round running in the background
  // does not take over Today — and a routine does not take over Jump rope.
  const live = store.sessions.find(
    (session) => !session.finished_at && session.date === todayKey
  );
  const active = live && sectionOf(live.kind) === section ? live : undefined;
  const solo = SOLO.find((plan) => plan.kind === section);

  // Starting, finishing or leaving a workout swaps the whole page under a
  // scroll position that belonged to the last one — which is how you end up
  // halfway down a screen you have not seen the top of.
  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
  }, [section, active?.id]);

  return (
    // The same shell as the other area pages: rail, then the page's own scroll
    // column — so the sidebar owns the way back and the theme switch.
    <div
      className={`relative flex h-screen w-screen overflow-hidden transition-colors duration-300 ${t.page}`}
    >
      <AppSidebar variant="minimal" links={SECTION_LINKS} />

      <div ref={scroller} className="h-full flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[920px] px-5 pb-24 pt-6 sm:px-8">
          {store.isLoading ? (
            <p className={`m-0 pt-16 text-center text-[0.85rem] ${t.muted}`}>
              Loading your training…
            </p>
          ) : section === "history" ? (
            <History t={t} store={store} now={now} />
          ) : active ? (
            <ActiveWorkout
              t={t}
              session={active}
              sessions={store.sessions}
              store={store}
              now={now}
            />
          ) : solo ? (
            <SoloSession
              t={t}
              store={store}
              now={now}
              todayKey={todayKey}
              plan={solo}
            />
          ) : (
            <Ready t={t} store={store} now={now} todayKey={todayKey} />
          )}
        </div>
      </div>
    </div>
  );
}

// --- Today ---

interface ReadyProps {
  t: Theme;
  store: Actions;
  now: Date;
  todayKey: string;
}

/** The page between workouts: what to do next, and what has been done so far. */
function Ready({ t, store, now, todayKey }: ReadyProps) {
  const { sessions, start } = store;
  const logged = sessions.filter((session) => session.sets.length > 0);
  const doneToday = logged.filter((session) => session.date === todayKey);
  const suggested = suggestedKind(logged);
  const last = logged[0];

  const weekStart = startOfWeek(now);
  const thisWeek = logged.filter((s) => s.date >= toKey(weekStart)).length;
  const dates = new Set(logged.map((session) => session.date));
  const streak = weekStreak(dates, now);
  const volume = logged.reduce(
    (sum, session) => sum + totalsOf(session.sets).volume,
    0
  );

  const headline = doneToday.length
    ? `${doneToday.length === 1 ? "One workout" : `${doneToday.length} workouts`} logged today. Anything more is a bonus.`
    : last
      ? `Last time was ${planOf(last.kind).label.toLowerCase()}, ${sinceLabel(last.date, now)} — ${planOf(suggested).label.toLowerCase()} is up next.`
      : "Nothing logged yet. Pick a routine and put the first set down.";

  return (
    <>
      <header className="flex flex-col gap-1.5">
        <p className={labelClass(t)}>
          {WEEKDAYS[(now.getDay() + 6) % 7]}, {dayLabel(todayKey)}
        </p>
        <h1 className="m-0 text-[2rem] font-extralight tracking-[-0.01em]">
          Training
        </h1>
        <p className={`m-0 max-w-[52ch] text-[0.9rem] ${t.body}`}>{headline}</p>
      </header>

      {doneToday.length > 0 && (
        <section className="mt-6 flex flex-wrap gap-2">
          {doneToday.map((session) => {
            const totals = totalsOf(session.sets);
            return (
              <span
                key={session.id}
                className={`flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[0.78rem] ${t.card}`}
              >
                {/* A session in another section can still be running while this
                    one is on screen, and a tick on it would claim it is over. */}
                {session.finished_at ? (
                  <Glyph
                    name="check"
                    className="h-3.5 w-3.5 text-emerald-500"
                  />
                ) : (
                  <Glyph
                    name="timer"
                    className="h-3.5 w-3.5"
                    style={{ color: t.accent }}
                  />
                )}
                {planOf(session.kind).label}
                <span className={t.muted}>
                  {totals.sets} {s(totals.sets, "set")} · {summary(session)}
                  {session.finished_at ? "" : " · still going"}
                </span>
              </span>
            );
          })}
        </section>
      )}

      <section className="mt-6 grid gap-4 sm:grid-cols-2">
        {ROUTINES.map((plan) => {
          const previous = logged.find((s) => s.kind === plan.kind);
          return (
            <div
              key={plan.kind}
              className={`${cardClass(t)} flex flex-col gap-4 p-5 transition-colors ${t.cardHover}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="m-0 text-[1.15rem] font-light tracking-[-0.01em]">
                    {plan.label}
                  </h2>
                  <p className={`m-0 mt-1 text-[0.78rem] ${t.muted}`}>
                    {plan.exercises.length} exercises ·{" "}
                    {plan.exercises.reduce((n, ex) => n + ex.sets, 0)} sets
                  </p>
                </div>
                {plan.kind === suggested && logged.length > 0 && (
                  <span
                    className="shrink-0 rounded-full px-2.5 py-1 text-[0.6rem] uppercase tracking-[0.16em]"
                    style={{ backgroundColor: t.accentSoft, color: t.appFg }}
                  >
                    Up next
                  </span>
                )}
              </div>

              <p className={`m-0 text-[0.82rem] leading-relaxed ${t.body}`}>
                {plan.blurb}
              </p>

              <ul className={`m-0 flex list-none flex-col gap-2 p-0`}>
                {plan.exercises.map((ex) => (
                  <li
                    key={ex.slug}
                    className="flex items-baseline justify-between gap-3 text-[0.85rem]"
                  >
                    <span className="min-w-0 truncate">
                      {ex.name}
                      <span className={`ml-2 text-[0.72rem] ${t.faint}`}>
                        {ex.muscle}
                      </span>
                    </span>
                    <span
                      className={`shrink-0 text-[0.78rem] ${numeralClass} ${t.muted}`}
                    >
                      {ex.sets} ×{" "}
                      {ex.unit === "seconds" ? hold(ex.target) : ex.target}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="mt-auto flex items-center gap-3 pt-1">
                <button
                  type="button"
                  disabled={start.isPending}
                  onClick={() =>
                    start.mutate({ date: todayKey, kind: plan.kind })
                  }
                  className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-2xl border-none px-4 py-3 text-[0.85rem] font-medium tracking-[0.01em] transition-opacity hover:opacity-85 disabled:cursor-default disabled:opacity-50"
                  style={{ backgroundColor: t.accent, color: t.appBg }}
                >
                  Start {plan.label.toLowerCase()}
                  <Glyph name="arrow" className="h-4 w-4" />
                </button>
              </div>

              <p className={`m-0 text-[0.72rem] ${t.faint}`}>
                {previous
                  ? `Last done ${sinceLabel(previous.date, now)} · ${summary(previous)}`
                  : "Not done yet"}
              </p>
            </div>
          );
        })}
      </section>

      <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          t={t}
          label="This week"
          value={String(thisWeek)}
          unit={s(thisWeek, "workout")}
        />
        <Stat
          t={t}
          label="Streak"
          value={String(streak)}
          unit={`${s(streak, "week")} running`}
        />
        <Stat
          t={t}
          label="Last session"
          value={last ? sinceLabel(last.date, now) : "—"}
          unit={last ? planOf(last.kind).label.toLowerCase() : "nothing yet"}
        />
        <Stat
          t={t}
          label="Lifted"
          value={volume > 0 ? kg(volume) : "—"}
          unit="kg all time"
        />
      </section>

      <ActivityStrip t={t} sessions={logged} now={now} />
    </>
  );
}

// --- The one-exercise sessions ---

/**
 * A solo session's page — the plank's, the rope's, and whatever else earns a
 * `solo` on its plan. One exercise means the numbers that matter are its own:
 * the best effort, the last one, the time it all adds up to, rather than the
 * volume and rotation the two routines are read by. Which is why this is not
 * the Today panel with a single card in it.
 */
function SoloSession({
  t,
  store,
  now,
  todayKey,
  plan,
}: ReadyProps & { plan: SoloPlan }) {
  const { sessions, start } = store;
  const exercise = plan.exercises[0];
  const { effort, verb } = plan.solo;
  const logged = sessions.filter(
    (session) => session.kind === plan.kind && session.sets.length > 0
  );
  const last = logged[0];
  const best = bestSets(logged).get(exercise.slug);

  const weekStart = toKey(startOfWeek(now));
  const thisWeek = logged.filter((session) => session.date >= weekStart).length;
  const allTime = logged.reduce(
    (sum, session) => sum + totalsOf(session.sets).seconds,
    0
  );
  const doneToday = logged.some((session) => session.date === todayKey);

  return (
    <>
      <header className="flex flex-col gap-1.5">
        <p className={labelClass(t)}>
          {WEEKDAYS[(now.getDay() + 6) % 7]}, {dayLabel(todayKey)}
        </p>
        <h1 className="m-0 text-[2rem] font-extralight tracking-[-0.01em]">
          {plan.label}
        </h1>
        <p className={`m-0 max-w-[52ch] text-[0.9rem] ${t.body}`}>
          {doneToday
            ? `Already ${verb} today. Coming back tomorrow is worth more than a second round now.`
            : best
              ? `Your best ${effort} is ${hold(best.set.reps)}. Beat it, or match it ${exercise.sets} times — either is a good session.`
              : `One exercise, ${exercise.sets} ${s(exercise.sets, effort)}. Whatever you manage first becomes the mark to beat.`}
        </p>
      </header>

      <section className={`${cardClass(t)} mt-6 flex flex-col gap-4 p-5`}>
        <div>
          <h2 className="m-0 text-[1.15rem] font-light tracking-[-0.01em]">
            {exercise.name}
          </h2>
          <p className={`m-0 mt-1 text-[0.78rem] ${t.muted}`}>
            {exercise.muscle} · target {exercise.sets} × {hold(exercise.target)}{" "}
            · {plan.rest} s rest
          </p>
        </div>

        <p className={`m-0 text-[0.82rem] leading-relaxed ${t.body}`}>
          {plan.blurb}
        </p>

        <button
          type="button"
          disabled={start.isPending}
          onClick={() => start.mutate({ date: todayKey, kind: plan.kind })}
          className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl border-none px-4 py-3 text-[0.85rem] font-medium tracking-[0.01em] transition-opacity hover:opacity-85 disabled:cursor-default disabled:opacity-50"
          style={{ backgroundColor: t.accent, color: t.appBg }}
        >
          Start {plan.label.toLowerCase()}
          <Glyph name="arrow" className="h-4 w-4" />
        </button>

        <p className={`m-0 text-[0.72rem] ${t.faint}`}>
          {last
            ? `Last ${verb} ${sinceLabel(last.date, now)} · ${summary(last)}`
            : `Not ${verb} yet`}
        </p>
      </section>

      <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          t={t}
          label={`Best ${effort}`}
          value={best ? hold(best.set.reps) : "—"}
          unit={best ? dayLabel(best.date) : "nothing yet"}
        />
        <Stat
          t={t}
          label={`Last ${effort}`}
          value={
            last ? hold(Math.max(...last.sets.map((set) => set.reps))) : "—"
          }
          unit={last ? sinceLabel(last.date, now) : "nothing yet"}
        />
        <Stat
          t={t}
          label="This week"
          value={String(thisWeek)}
          unit={s(thisWeek, "session")}
        />
        <Stat
          t={t}
          label="Total time"
          value={allTime > 0 ? clock(allTime) : "—"}
          unit="all time"
        />
      </section>

      {logged.length > 0 && (
        <section className="mt-7">
          <p className={`${labelClass(t)} mb-3`}>Every session</p>
          <div className="flex flex-col gap-2">
            {logged.map((session) => (
              <div
                key={session.id}
                className={`${cardClass(t)} flex flex-wrap items-baseline gap-x-4 gap-y-1 px-4 py-3`}
              >
                <span
                  className={`w-[68px] shrink-0 text-[0.85rem] ${numeralClass}`}
                >
                  {dayLabel(session.date)}
                </span>
                <span className={`flex-1 text-[0.82rem] ${numeralClass}`}>
                  {session.sets.map((set) => hold(set.reps)).join(" · ")}
                </span>
                <span className={`shrink-0 text-[0.75rem] ${t.muted}`}>
                  {summary(session)}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

function Stat({
  t,
  label,
  value,
  unit,
}: {
  t: Theme;
  label: string;
  value: string;
  unit: string;
}) {
  return (
    <div className={`${cardClass(t)} flex flex-col gap-1 px-4 py-3.5`}>
      <p className={labelClass(t)}>{label}</p>
      <p className={`m-0 text-[1.35rem] leading-tight ${numeralClass}`}>
        {value}
      </p>
      <p className={`m-0 text-[0.7rem] ${t.faint}`}>{unit}</p>
    </div>
  );
}

/**
 * Twelve weeks of days, one column per week, Monday at the top.
 *
 * Which routine a day held is an identity, not a quantity, so the three are
 * told apart by shape rather than tone — filled for strength, ringed for
 * simple, a dot for the plank, which is the smallest session and gets the
 * smallest mark. Shape survives any colour vision, and it survives the palette
 * too: every treatment in this app has exactly one accent, so three invented
 * hues would be three hues that belong to nothing.
 */
function ActivityStrip({
  t,
  sessions,
  now,
}: {
  t: Theme;
  sessions: WorkoutSession[];
  now: Date;
}) {
  const byDate = new Map<string, Set<WorkoutKind>>();
  for (const session of sessions) {
    const kinds = byDate.get(session.date) ?? new Set<WorkoutKind>();
    kinds.add(session.kind);
    byDate.set(session.date, kinds);
  }

  const firstWeek = addDays(startOfWeek(now), (1 - STRIP_WEEKS) * 7);
  const weeks = Array.from({ length: STRIP_WEEKS }, (_, w) =>
    addDays(firstWeek, w * 7)
  );
  const todayKey = toKey(now);

  return (
    <section className="mt-8">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className={labelClass(t)}>Last 6 months</p>
        <p className={`m-0 text-[0.7rem] ${t.faint}`}>
          each column is a week, Mon at the top
        </p>
      </div>

      {/* Narrower than the strip on a small screen, so it scrolls on its own
          rather than making the page scroll sideways. */}
      <div className="-mx-1 overflow-x-auto px-1 pb-1">
        <div className="w-max">
          {/* Month ticks. The label is wider than the column it marks, so it
              hangs out of it rather than spacing the columns apart. */}
          <div className="mb-1 flex gap-1">
            {weeks.map((weekStart, w) => {
              // Only where the month actually turns. The leftmost column is
              // usually mid-month, and labelling it too would print two months
              // a column apart, on top of each other.
              const turns =
                w > 0 && weeks[w - 1].getMonth() !== weekStart.getMonth();
              return (
                <div
                  key={`tick-${toKey(weekStart)}`}
                  className="relative h-3 w-4 shrink-0"
                >
                  {turns && (
                    <span
                      className={`absolute left-0 top-0 text-[0.58rem] uppercase tracking-[0.1em] ${t.faint}`}
                    >
                      {monthLabel(toKey(weekStart)).split(" ")[0]}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex gap-1">
            {weeks.map((weekStart) => (
              <div
                key={toKey(weekStart)}
                className="flex shrink-0 flex-col gap-1"
              >
                {Array.from({ length: 7 }, (_, d) => {
                  const day = addDays(weekStart, d);
                  const key = toKey(day);
                  const kinds = byDate.get(key);
                  const future = key > todayKey;
                  // A day can hold more than one kind, so the cell takes the
                  // heaviest — plan order — and the tooltip names them all. The
                  // marks stay one each however they are combined.
                  const mark: Mark =
                    PLANS.find((plan) => kinds?.has(plan.kind))?.kind ?? "rest";

                  return (
                    <span
                      key={key}
                      title={`${WEEKDAYS[d]} ${dayLabel(key)} — ${
                        kinds
                          ? [...kinds].map((k) => planOf(k).label).join(" + ")
                          : future
                            ? "not yet"
                            : "rest"
                      }`}
                      className="grid h-4 w-4 place-items-center rounded-[3px]"
                      style={{
                        ...markStyle(t, mark),
                        opacity: future ? 0.35 : 1,
                        outline:
                          key === todayKey ? `1.5px solid ${t.accentSoft}` : "",
                        outlineOffset: "1px",
                      }}
                    >
                      {markInner(t, mark)}
                    </span>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Three marks means the legend is not optional: shape says which is
          which, and this is the only place that says what the shapes mean. */}
      <div
        className={`mt-3 flex flex-wrap gap-x-5 gap-y-2 text-[0.7rem] ${t.muted}`}
      >
        {MARKS.map(({ mark, label }) => (
          <span key={mark} className="flex items-center gap-2">
            <i
              className="grid h-4 w-4 shrink-0 place-items-center rounded-[3px]"
              style={markStyle(t, mark)}
            >
              {markInner(t, mark)}
            </i>
            {label}
          </span>
        ))}
      </div>
    </section>
  );
}

/** What a day's cell can be. A kind each, plus the days with none of them. */
type Mark = WorkoutKind | "rest";

/** In legend order, and named by the plans so the two cannot drift apart. */
const MARKS: { mark: Mark; label: string }[] = [
  ...PLANS.map((plan) => ({ mark: plan.kind as Mark, label: plan.label })),
  { mark: "rest", label: "Rest" },
];

/** The cell itself: filled for strength, ringed for simple, bare otherwise. */
const markStyle = (t: Theme, mark: Mark): CSSProperties =>
  mark === "strength"
    ? { backgroundColor: t.accent }
    : mark === "simple"
      ? { boxShadow: `inset 0 0 0 2px ${t.accent}` }
      : { backgroundColor: t.track };

/**
 * What sits inside the bare cells, which is what tells the solo sessions apart:
 * a dot for the plank, a bar for the rope. Drawn as a child rather than another
 * inset shadow — at four pixels across, a ring and a dot on the same box fight
 * over the same edge and both lose.
 */
const markInner = (t: Theme, mark: Mark): ReactNode =>
  mark === "plank" ? (
    <i
      className="h-1.5 w-1.5 rounded-full"
      style={{ backgroundColor: t.accent }}
    />
  ) : mark === "rope" ? (
    <i
      className="h-[2px] w-2.5 rounded-full"
      style={{ backgroundColor: t.accent }}
    />
  ) : null;

// --- The workout itself ---

interface ActiveProps {
  t: Theme;
  session: WorkoutSession;
  sessions: WorkoutSession[];
  store: Actions;
  now: Date;
}

function ActiveWorkout({ t, session, sessions, store, now }: ActiveProps) {
  const plan = planOf(session.kind);
  const [openSlug, setOpenSlug] = useState<string | null>(null);
  /** When the current rest ends, as an ms stamp; null when not resting. */
  const [restUntil, setRestUntil] = useState<number | null>(null);
  const tick = useTick();

  // The exercise still short of its target — what the plan says to do next. An
  // explicit choice overrides it, until a set completes an exercise and hands
  // the page back to the plan.
  const nextUp =
    plan.exercises.find((ex) => setsOf(session, ex.slug).length < ex.sets)
      ?.slug ?? plan.exercises[plan.exercises.length - 1].slug;
  const open = openSlug ?? nextUp;

  const totals = totalsOf(session.sets);
  const targetSets = plan.exercises.reduce((n, ex) => n + ex.sets, 0);
  const pct = Math.round(progressOf(session) * 100);
  const elapsed = clock((tick - parseStamp(session.created_at)) / 1000);

  const onLogged = (exercise: string) => {
    setRestUntil(() => Date.now() + plan.rest * 1000);
    const done =
      setsOf(session, exercise).length + 1 >=
      (plan.exercises.find((ex) => ex.slug === exercise)?.sets ?? 0);
    if (done) setOpenSlug(null);
  };

  // Nothing logged means nothing happened: finishing an empty session throws it
  // away rather than filing a workout that was never done.
  const finishing = store.finish.isPending || store.discard.isPending;
  const finish = () =>
    session.sets.length === 0
      ? store.discard.mutate(session.id)
      : store.finish.mutate(session.id);

  return (
    <>
      <div
        className={`sticky top-0 z-20 -mx-5 mb-5 px-5 pb-4 pt-5 sm:-mx-8 sm:px-8 ${t.surface}`}
      >
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <div className="min-w-0 flex-1">
            <p className={labelClass(t)}>In progress</p>
            <h1 className="m-0 flex items-baseline gap-3 text-[1.5rem] font-extralight tracking-[-0.01em]">
              {plan.label}
              <span className={`text-[1rem] ${numeralClass} ${t.muted}`}>
                {elapsed}
              </span>
            </h1>
          </div>
          <button
            type="button"
            disabled={finishing}
            onClick={finish}
            className={`shrink-0 cursor-pointer rounded-2xl border px-4 py-2.5 text-[0.8rem] tracking-[0.02em] transition-colors disabled:cursor-default disabled:opacity-50 ${t.outlineBtn} bg-transparent`}
          >
            {session.sets.length === 0 ? "Cancel workout" : "Finish workout"}
          </button>
        </div>

        <div className="mt-3.5 flex items-center gap-3">
          <div
            className="h-1.5 flex-1 overflow-hidden rounded-full"
            style={{ backgroundColor: t.track }}
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Workout progress"
          >
            <div
              className="h-full rounded-full transition-[width] duration-300"
              style={{ width: `${pct}%`, backgroundColor: t.accent }}
            />
          </div>
          <p className={`m-0 shrink-0 text-[0.72rem] ${t.muted}`}>
            <span className={numeralClass}>
              {totals.sets}/{targetSets}
            </span>{" "}
            sets · {summary(session)}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {plan.exercises.map((exercise, i) => (
          <ExerciseCard
            key={exercise.slug}
            t={t}
            index={i + 1}
            exercise={exercise}
            session={session}
            sessions={sessions}
            store={store}
            now={now}
            open={open === exercise.slug}
            onOpen={() =>
              setOpenSlug(open === exercise.slug ? "" : exercise.slug)
            }
            onLogged={() => onLogged(exercise.slug)}
          />
        ))}
      </div>

      {restUntil !== null && (
        <RestBar
          t={t}
          remaining={Math.ceil((restUntil - tick) / 1000)}
          total={plan.rest}
          onAdd={() => setRestUntil((until) => (until ?? Date.now()) + 30000)}
          onDismiss={() => setRestUntil(null)}
        />
      )}
    </>
  );
}

interface ExerciseCardProps {
  t: Theme;
  index: number;
  exercise: Exercise;
  session: WorkoutSession;
  sessions: WorkoutSession[];
  store: Actions;
  now: Date;
  open: boolean;
  onOpen: () => void;
  onLogged: () => void;
}

function ExerciseCard({
  t,
  index,
  exercise,
  session,
  sessions,
  store,
  now,
  open,
  onOpen,
  onLogged,
}: ExerciseCardProps) {
  const done = setsOf(session, exercise.slug);
  const previous = lastEffort(sessions, exercise.slug, session.id);
  const complete = done.length >= exercise.sets;
  // A plank is counted in seconds rather than repetitions, so the field it is
  // logged in, the numbers already logged and the target all change their unit
  // together — there is only one of them, and it belongs to the exercise.
  const held = exercise.unit === "seconds";
  const stepper = STEPPERS[exercise.unit];

  // Seeded once from what was done last time, then left alone: the numbers you
  // just logged are almost always the numbers for the next set, so carrying
  // them over is the whole point of a stepper rather than an empty field.
  const [reps, setReps] = useState(
    () => previous?.sets.at(-1)?.reps ?? exercise.target
  );
  const [weight, setWeight] = useState(
    () => previous?.sets.at(-1)?.weight ?? 0
  );

  const log = () => {
    store.addSet.mutate(
      {
        sessionId: session.id,
        exercise: exercise.slug,
        reps,
        weight: exercise.weighted ? weight : 0,
      },
      { onSuccess: onLogged }
    );
  };

  return (
    <section
      className={`${cardClass(t)} overflow-hidden p-0`}
      style={open ? { boxShadow: `inset 3px 0 0 0 ${t.accent}` } : undefined}
    >
      <button
        type="button"
        onClick={onOpen}
        aria-expanded={open}
        className={`flex w-full cursor-pointer items-center gap-3.5 border-none bg-transparent px-4 py-3.5 text-left transition-colors ${t.rowHover}`}
      >
        <span
          className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-[0.72rem] ${numeralClass}`}
          style={
            complete
              ? { backgroundColor: t.accent, color: t.appBg }
              : { backgroundColor: t.track }
          }
        >
          {complete ? <Glyph name="check" className="h-3.5 w-3.5" /> : index}
        </span>

        <span className="min-w-0 flex-1">
          <span className="block truncate text-[0.95rem]">{exercise.name}</span>
          <span className={`block text-[0.72rem] ${t.faint}`}>
            {exercise.muscle} · target {exercise.sets} ×{" "}
            {held ? hold(exercise.target) : exercise.target}
          </span>
        </span>

        <span className={`shrink-0 text-[0.78rem] ${numeralClass} ${t.muted}`}>
          {done.length}/{exercise.sets}
        </span>
        <Glyph
          name="chevron"
          className={`h-4 w-4 shrink-0 transition-transform ${t.faint} ${open ? "rotate-90" : ""}`}
        />
      </button>

      {open && (
        <div className={`border-t px-4 pb-4 pt-3.5 ${t.rule}`}>
          <p className={`m-0 text-[0.75rem] ${t.muted}`}>
            {previous ? (
              <>
                Last time, {sinceLabel(previous.date, now)}:{" "}
                <span className={numeralClass}>
                  {previous.sets
                    .map((set) => setLabel(set, exercise.slug))
                    .join(" · ")}
                </span>{" "}
                {unitLabel(exercise.slug)}
              </>
            ) : (
              "First time on this one — whatever you log becomes the mark to beat."
            )}
          </p>

          {done.length > 0 && (
            <ul className="m-0 mt-3 flex list-none flex-col gap-1.5 p-0">
              {done.map((set, i) => (
                <li
                  key={set.id}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2 text-[0.82rem] ${t.rowHover}`}
                  style={{ backgroundColor: t.track }}
                >
                  <span className={`w-12 shrink-0 text-[0.7rem] ${t.faint}`}>
                    Set {i + 1}
                  </span>
                  <span className={`flex-1 ${numeralClass}`}>
                    {held ? hold(set.reps) : `${set.reps} reps`}
                    {exercise.weighted && (
                      <>
                        {" "}
                        <span className={t.faint}>×</span> {kg(set.weight)} kg
                      </>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setReps(set.reps);
                      setWeight(set.weight);
                    }}
                    title="Copy these numbers into the next set"
                    className={`shrink-0 cursor-pointer rounded-lg border-none bg-transparent px-2 py-1 text-[0.68rem] transition-colors ${t.iconBtn}`}
                  >
                    Repeat
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      store.dropSet.mutate({
                        sessionId: session.id,
                        setId: set.id,
                      })
                    }
                    aria-label={`Remove set ${i + 1}`}
                    className={`grid h-7 w-7 shrink-0 cursor-pointer place-items-center rounded-lg border-none bg-transparent transition-colors ${t.iconBtn}`}
                  >
                    <Glyph name="trash" className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-3.5 flex flex-wrap items-end gap-3">
            <Stepper
              t={t}
              label={exercise.inputLabel ?? stepper.label}
              value={reps}
              step={stepper.step}
              min={stepper.min}
              max={stepper.max}
              onChange={setReps}
            />
            {exercise.weighted && (
              <Stepper
                t={t}
                label="Weight, kg"
                value={weight}
                step={2.5}
                min={0}
                max={MAX_WEIGHT}
                onChange={setWeight}
              />
            )}
            <button
              type="button"
              disabled={store.addSet.isPending}
              onClick={log}
              className="flex min-w-[140px] flex-1 cursor-pointer items-center justify-center gap-2 rounded-2xl border-none px-4 py-3 text-[0.85rem] font-medium transition-opacity hover:opacity-85 disabled:cursor-default disabled:opacity-50"
              style={{ backgroundColor: t.accent, color: t.appBg }}
            >
              <Glyph name="plus" className="h-4 w-4" />
              Log set {done.length + 1}
            </button>
          </div>

          {complete && (
            <p className={`m-0 mt-3 text-[0.72rem] ${t.faint}`}>
              Target met — extra sets still count.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function Stepper({
  t,
  label,
  value,
  step,
  min,
  max,
  onChange,
}: {
  t: Theme;
  label: string;
  value: number;
  step: number;
  min: number;
  max: number;
  onChange: (next: number) => void;
}) {
  const clamp = (n: number) =>
    Math.min(max, Math.max(min, Math.round(n * 4) / 4));

  return (
    <label className="flex flex-col gap-1.5">
      <span className={labelClass(t)}>{label}</span>
      <span className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onChange(clamp(value - step))}
          aria-label={`${label} down`}
          className={`grid h-10 w-10 shrink-0 cursor-pointer place-items-center rounded-xl border-none transition-colors ${t.iconBtn}`}
          style={{ backgroundColor: t.track }}
        >
          <Glyph name="minus" className="h-4 w-4" />
        </button>
        <input
          type="number"
          inputMode="decimal"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={(e) => onChange(clamp(Number(e.target.value) || 0))}
          className={`w-[76px] rounded-xl border px-2 py-2.5 text-center text-[1rem] outline-none transition-all ${numeralClass} ${t.input} [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`}
        />
        <button
          type="button"
          onClick={() => onChange(clamp(value + step))}
          aria-label={`${label} up`}
          className={`grid h-10 w-10 shrink-0 cursor-pointer place-items-center rounded-xl border-none transition-colors ${t.iconBtn}`}
          style={{ backgroundColor: t.track }}
        >
          <Glyph name="plus" className="h-4 w-4" />
        </button>
      </span>
    </label>
  );
}

/**
 * The rest between sets, as a bar across the bottom. It counts down rather than
 * up because the question mid-workout is "how much longer", and it stays put at
 * zero instead of vanishing — a timer that disappears is one you have to
 * remember went off.
 */
function RestBar({
  t,
  remaining,
  total,
  onAdd,
  onDismiss,
}: {
  t: Theme;
  remaining: number;
  total: number;
  onAdd: () => void;
  onDismiss: () => void;
}) {
  const over = remaining <= 0;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-4 pb-5">
      <div
        className={`pointer-events-auto flex w-full max-w-[520px] flex-col gap-2.5 rounded-2xl border p-3.5 ${t.popover}`}
      >
        <div className="flex items-center gap-3">
          <Glyph
            name="timer"
            className={`h-4 w-4 shrink-0 ${over ? "" : t.muted}`}
            style={over ? { color: t.accent } : undefined}
          />
          <span className="flex-1 text-[0.85rem]">
            {over ? (
              "Rest done — go again"
            ) : (
              <>
                Rest <span className={numeralClass}>{clock(remaining)}</span>
              </>
            )}
          </span>
          {!over && (
            <button
              type="button"
              onClick={onAdd}
              className={`cursor-pointer rounded-lg border-none bg-transparent px-2 py-1 text-[0.75rem] transition-colors ${t.iconBtn}`}
            >
              +30s
            </button>
          )}
          <button
            type="button"
            onClick={onDismiss}
            className={`cursor-pointer rounded-lg border-none bg-transparent px-2 py-1 text-[0.75rem] transition-colors ${t.iconBtn}`}
          >
            {over ? "Dismiss" : "Skip"}
          </button>
        </div>
        <div
          className="h-1 overflow-hidden rounded-full"
          style={{ backgroundColor: t.track }}
        >
          <div
            className="h-full rounded-full transition-[width] duration-1000 ease-linear"
            style={{
              width: `${Math.max(0, Math.min(100, (remaining / total) * 100))}%`,
              backgroundColor: t.accent,
            }}
          />
        </div>
      </div>
    </div>
  );
}

// --- History ---

function History({ t, store, now }: { t: Theme; store: Actions; now: Date }) {
  const logged = store.sessions.filter((s) => s.sets.length > 0);
  const best = useMemo(() => bestSets(logged), [logged]);
  const [openId, setOpenId] = useState<number | null>(null);
  const [confirmId, setConfirmId] = useState<number | null>(null);

  // Sessions arrive newest first, so grouping in order gives months in order.
  const months: { key: string; sessions: WorkoutSession[] }[] = [];
  for (const session of logged) {
    const key = session.date.slice(0, 7);
    const last = months.at(-1);
    if (last?.key === key) last.sessions.push(session);
    else months.push({ key, sessions: [session] });
  }

  return (
    <>
      <header className="flex flex-col gap-1.5">
        <p className={labelClass(t)}>Training</p>
        <h1 className="m-0 text-[2rem] font-extralight tracking-[-0.01em]">
          History
        </h1>
        <p className={`m-0 text-[0.9rem] ${t.body}`}>
          {logged.length > 0
            ? `${logged.length} ${s(logged.length, "workout")} logged.`
            : "Nothing logged yet — the first workout starts the record."}
        </p>
      </header>

      {best.size > 0 && (
        <section className="mt-7">
          <p className={`${labelClass(t)} mb-3`}>Personal bests</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {PLANS.flatMap((plan) => plan.exercises).map((exercise) => {
              const record = best.get(exercise.slug);
              return (
                <div
                  key={exercise.slug}
                  className={`${cardClass(t)} flex flex-col gap-1 px-4 py-3.5`}
                >
                  <p className={`m-0 truncate text-[0.8rem] ${t.body}`}>
                    {exercise.name}
                  </p>
                  {record ? (
                    <>
                      <p
                        className={`m-0 text-[1.25rem] leading-tight ${numeralClass}`}
                      >
                        {exercise.weighted
                          ? `${kg(record.set.weight)} kg`
                          : exercise.unit === "seconds"
                            ? hold(record.set.reps)
                            : `${record.set.reps} reps`}
                      </p>
                      <p className={`m-0 text-[0.7rem] ${t.faint}`}>
                        {exercise.weighted ? `${record.set.reps} reps · ` : ""}
                        {dayLabel(record.date)}
                      </p>
                    </>
                  ) : (
                    <>
                      <p
                        className={`m-0 text-[1.25rem] leading-tight ${numeralClass} ${t.faint}`}
                      >
                        —
                      </p>
                      <p className={`m-0 text-[0.7rem] ${t.faint}`}>
                        no sets yet
                      </p>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {months.map((month) => (
        <section key={month.key} className="mt-7">
          <p className={`${labelClass(t)} mb-3`}>{monthLabel(month.key)}</p>
          <div className="flex flex-col gap-2">
            {month.sessions.map((session) => {
              const open = openId === session.id;
              const totals = totalsOf(session.sets);
              const plan = planOf(session.kind);

              return (
                <div
                  key={session.id}
                  className={`${cardClass(t)} overflow-hidden p-0`}
                >
                  <button
                    type="button"
                    onClick={() => setOpenId(open ? null : session.id)}
                    aria-expanded={open}
                    className={`flex w-full cursor-pointer items-center gap-3 border-none bg-transparent px-4 py-3 text-left transition-colors ${t.rowHover}`}
                  >
                    <span
                      className={`w-[68px] shrink-0 text-[0.85rem] ${numeralClass}`}
                    >
                      {dayLabel(session.date)}
                    </span>
                    {/* Filled, ringed, soft — the same three weights the strip
                        gives these kinds, and the chip says which anyway. */}
                    <span
                      className="shrink-0 rounded-full px-2.5 py-1 text-[0.65rem] uppercase tracking-[0.12em]"
                      style={
                        session.kind === "strength"
                          ? { backgroundColor: t.accent, color: t.appBg }
                          : session.kind === "simple"
                            ? { boxShadow: `inset 0 0 0 1.5px ${t.accent}` }
                            : { backgroundColor: t.accentSoft }
                      }
                      title={plan.label}
                    >
                      {plan.label}
                    </span>
                    <span
                      className={`min-w-0 flex-1 truncate text-[0.78rem] ${t.muted}`}
                    >
                      {totals.sets} {s(totals.sets, "set")} · {summary(session)}
                    </span>
                    <Glyph
                      name="chevron"
                      className={`h-4 w-4 shrink-0 transition-transform ${t.faint} ${open ? "rotate-90" : ""}`}
                    />
                  </button>

                  {open && (
                    <div className={`border-t px-4 pb-3.5 pt-3 ${t.rule}`}>
                      <ul className="m-0 flex list-none flex-col gap-2 p-0">
                        {groupByExercise(session).map(([slug, sets]) => (
                          <li
                            key={slug}
                            className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[0.82rem]"
                          >
                            <span className="min-w-[9rem]">
                              {exerciseName(slug)}
                            </span>
                            <span className={`${numeralClass} ${t.muted}`}>
                              {sets
                                .map((set) => setLabel(set, slug))
                                .join(" · ")}{" "}
                              {unitLabel(slug, sets)}
                            </span>
                          </li>
                        ))}
                      </ul>

                      <div className="mt-3.5 flex justify-end">
                        <button
                          type="button"
                          onClick={() => {
                            if (confirmId === session.id) {
                              store.discard.mutate(session.id);
                              setConfirmId(null);
                            } else {
                              setConfirmId(session.id);
                            }
                          }}
                          onBlur={() => setConfirmId(null)}
                          className={`cursor-pointer rounded-xl border-none bg-transparent px-3 py-1.5 text-[0.72rem] transition-colors ${
                            confirmId === session.id
                              ? "text-red-500"
                              : t.iconBtn
                          }`}
                        >
                          {confirmId === session.id
                            ? "Delete this workout?"
                            : "Delete"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}

      {logged.length === 0 && (
        <p className={`mt-10 text-center text-[0.85rem] ${t.faint}`}>
          Sessions show up here once they have a set in them.
        </p>
      )}

      {/* `now` keeps this honest across a midnight spent on the page. */}
      <p className={`mt-10 text-center text-[0.7rem] ${t.faint}`}>
        {logged[0] ? `Last workout ${sinceLabel(logged[0].date, now)}` : " "}
      </p>
    </>
  );
}

// --- Shared bits ---

/** Sets in the order they were done, grouped under the exercise they belong to. */
const groupByExercise = (session: WorkoutSession): [string, WorkoutSet[]][] => {
  const groups = new Map<string, WorkoutSet[]>();
  for (const set of session.sets) {
    const list = groups.get(set.exercise);
    if (list) list.push(set);
    else groups.set(set.exercise, [set]);
  }
  return [...groups];
};

/**
 * What a session amounts to in one figure — or two, when it holds both kinds of
 * work. Kilograms for the loaded routine and reps for the bodyweight one,
 * because volume in kilograms is zero for the second and would read as a
 * session that did nothing; a plank adds the time it was held, which belongs
 * next to those rather than folded into them.
 */
const summary = (session: WorkoutSession): string => {
  const plan = planOf(session.kind);
  const verb = plan.solo?.verb ?? "logged";
  const totals = totalsOf(session.sets);

  const parts: string[] = [];
  if (session.kind === "strength" && totals.volume > 0) {
    parts.push(`${kg(totals.volume)} kg`);
  } else if (totals.reps > 0) {
    parts.push(`${totals.reps} reps`);
  }
  // Time is worth saying what was done with it — held, skipped — because the
  // number alone is the same however it was spent.
  if (totals.seconds > 0) parts.push(`${hold(totals.seconds)} ${verb}`);
  if (parts.length > 0) return parts.join(" · ");

  // Nothing logged yet, which still has to read as something: zero, in the unit
  // this plan is actually counted in rather than in reps it will never have.
  return plan.exercises.every((ex) => ex.unit === "seconds")
    ? `${hold(0)} ${verb}`
    : "0 reps";
};

/** A clock that only runs while something is being timed against it. */
function useTick(): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  return now;
}

// The few marks this page needs, drawn inline for the same reason the sidebar's
// are: no icon dependency for a handful of strokes.
const GLYPHS = {
  check: <path d="m5 12.6 4.4 4.4L19 7" />,
  plus: <path d="M12 5.6v12.8M5.6 12h12.8" />,
  minus: <path d="M5.6 12h12.8" />,
  chevron: <path d="m9.4 5.6 6.4 6.4-6.4 6.4" />,
  arrow: <path d="M5 12h13m-5.6-5.6L18 12l-5.6 5.6" />,
  trash: (
    <>
      <path d="M4.8 6.8h14.4M9.6 6.8V5h4.8v1.8" />
      <path d="M6.7 6.8 7.6 19h8.8l.9-12.2" />
    </>
  ),
  timer: (
    <>
      <circle cx="12" cy="13.4" r="7.2" />
      <path d="M12 10v3.4l2.4 1.6M9.7 3.4h4.6" />
    </>
  ),
} satisfies Record<string, ReactNode>;

function Glyph({
  name,
  className = "h-4 w-4",
  style,
}: {
  name: keyof typeof GLYPHS;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
    >
      {GLYPHS[name]}
    </svg>
  );
}
