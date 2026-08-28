import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getNotes, getWorkouts } from "../api";
import AppSidebar from "./AppSidebar";
import DayMark from "./DayMark";
import DevNotes from "./DevNotes";
import StatusBar from "./StatusBar";
import TodayTodos from "./TodayTodos";
import WordsOfTheHour from "./WordsOfTheHour";
import { DEVELOPER, ENGLISH, TRAINING } from "../areas";
import { s } from "../plural";
import { cardClass, labelClass, numeralClass, useTheme } from "../theme";
import { readWords } from "../englishWords";
import {
  addDays,
  dayTitle,
  kindsByDate,
  liveSession,
  markOf,
  planOf,
  progressOf,
  sectionOf,
  sinceLabel,
  startOfWeek,
  suggestedKind,
  summary,
  targetSets,
  toKey,
  weekStreak,
} from "../training";
import useNow from "../useNow";
import type { Theme, WorkoutSession } from "../types";

// Re-reads on cross-tab writes; same-tab edits happen on a route that unmounts
// this component, so remounting already picks them up.
function useEnglishWords() {
  const [words, setWords] = useState(readWords);

  useEffect(() => {
    const sync = () => setWords(readWords());
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  return words;
}

/**
 * The morning screen: what you are doing now across the top, and under it the
 * four things a day is made of — what to revise, what to do, what to remember,
 * and what the body is up to.
 *
 * Every card is a glance with one gesture on it. Anything that takes more than
 * that has a page of its own in the sidebar, which is where the marathon went.
 */
export default function Dashboard() {
  const navigate = useNavigate();
  const now = useNow();
  const words = useEnglishWords();
  const { t } = useTheme();

  // Query keys match the area pages, so the cache is shared both ways.
  const { data: notes } = useQuery({
    queryKey: ["notes", DEVELOPER.metricId],
    queryFn: () => getNotes(DEVELOPER.metricId),
  });
  const { data: sessions } = useQuery({
    queryKey: ["workouts", TRAINING.metricId],
    queryFn: () => getWorkouts(TRAINING.metricId),
  });

  // A session left running belongs to its own section — opening Today while the
  // plank is going would show the page it is not on.
  const live = sessions && liveSession(sessions, now);

  return (
    <div
      className={`relative flex h-full w-full overflow-hidden transition-colors duration-300 ${t.page}`}
    >
      <AppSidebar />

      <div className="h-full flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-3 px-6 pb-16 pt-8 sm:px-8">
          {/* The day itself, across the top. It replaced the greeting, which
              said the time and nothing else — this says the time and what you
              have done with it. */}
          <StatusBar t={t} now={now} />

          {/* Two by two, in the order a day is worked: revise, then do, then
              remember, then move. */}
          <div className="grid grid-cols-12 gap-3">
            <DevNotes
              t={t}
              now={now}
              notes={notes}
              className="col-span-12 md:col-span-6"
              onOpen={() => navigate(`/${DEVELOPER.slug}`)}
            />
            <TodayTodos t={t} now={now} className="col-span-12 md:col-span-6" />
            <WordsOfTheHour
              t={t}
              now={now}
              words={words}
              className="col-span-12 md:col-span-6"
              onOpen={() => navigate(`/${ENGLISH.slug}`)}
            />
            <TrainingCard
              t={t}
              now={now}
              sessions={sessions}
              className="col-span-12 md:col-span-6"
              onOpen={() =>
                navigate(
                  live
                    ? `/${TRAINING.slug}/${sectionOf(live.kind)}`
                    : `/${TRAINING.slug}`
                )
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function Meter({ ratio, t }: { ratio: number; t: Theme }) {
  return (
    <div
      className="mt-3 h-1 w-full overflow-hidden rounded-full"
      style={{ backgroundColor: t.track }}
    >
      <div
        className="h-full rounded-full transition-[width] duration-700 ease-out"
        style={{ width: `${ratio * 100}%`, backgroundColor: t.accent }}
      />
    </div>
  );
}

interface TrainingProps {
  sessions: WorkoutSession[] | undefined;
  now: Date;
  onOpen?: () => void;
  className?: string;
  t: Theme;
}

/**
 * The two questions a morning asks about training: have I done it today, and
 * what is next. The card answers whichever one applies — a session running, a
 * session done, or the routine the rotation is up to — because on any given day
 * only one of them is a question at all.
 *
 * Under the answer, the week. It used to appear only on the days nothing had
 * happened yet, which is exactly the day it says least: seven marks are how you
 * see three sessions and a gap, and that reading is worth as much on the day you
 * have already trained.
 */
function TrainingCard({
  sessions,
  now,
  onOpen,
  className = "",
  t,
}: TrainingProps) {
  const all = sessions ?? [];
  const todayKey = toKey(now);
  // A session with no sets in it is an intention rather than a workout, so the
  // streak and the rotation both read only the ones that were actually done.
  const logged = all.filter((session) => session.sets.length > 0);
  const live = liveSession(all, now);
  const done = logged.find(
    (session) => session.date === todayKey && session.finished_at
  );
  // The server hands these back newest first, so the last one is simply the top.
  const last = logged[0];
  const streak = weekStreak(
    new Set(logged.map((session) => session.date)),
    now
  );

  const kind =
    live?.kind ?? done?.kind ?? (last ? suggestedKind(logged) : null);
  const plan = kind ? planOf(kind) : null;

  const body = (
    <>
      <div className="flex items-baseline justify-between gap-3">
        <p className={labelClass(t)}>Training</p>
        {live ? (
          <p className={`m-0 text-[0.7rem] ${t.muted}`}>still going</p>
        ) : (
          streak > 0 && (
            <p className={`m-0 text-[0.7rem] ${t.muted}`}>
              {streak} {s(streak, "week")} running
            </p>
          )
        )}
      </div>

      {!plan ? (
        <p className={`m-0 mt-2 text-[0.78rem] ${t.muted}`}>
          Nothing logged yet — pick a routine
        </p>
      ) : (
        <>
          <p
            className={`m-0 mt-2 flex items-center gap-2 text-[1.8rem] leading-none ${numeralClass}`}
          >
            {done && !live && <Check t={t} />}
            {plan.label}
          </p>

          {live && <Meter ratio={progressOf(live)} t={t} />}

          <p className={`m-0 mt-2 truncate text-[0.7rem] ${t.muted}`}>
            {live
              ? `${live.sets.length} of ${targetSets(plan)} sets logged`
              : done
                ? `logged today · ${done.sets.length} ${s(done.sets.length, "set")} · ${summary(done)}`
                : `up next · last was ${planOf(last.kind).label}, ${sinceLabel(last.date, now)}`}
          </p>

          {/* What the routine actually holds, when it is one you have not
              started: the reason to open the page rather than the name of it. */}
          {!live && !done && (
            <p className={`m-0 mt-1.5 truncate text-[0.66rem] ${t.faint}`}>
              {plan.exercises
                .slice(0, 3)
                .map((exercise) => exercise.name)
                .join(" · ")}
              {plan.exercises.length > 3 && " …"}
            </p>
          )}

          <WeekStrip sessions={logged} now={now} t={t} />
        </>
      )}
    </>
  );

  const layout = "flex flex-col justify-center";

  if (!onOpen) {
    return (
      <section className={`${cardClass(t)} ${className} ${layout}`}>
        {body}
      </section>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`${cardClass(t)} ${className} ${layout} w-full cursor-pointer text-left transition-colors ${t.cardHover}`}
    >
      {body}
    </button>
  );
}

/**
 * The current week as seven marks. They are the training page's marks, drawn at
 * the same size from the same file — a filled square has to mean strength on
 * both screens, or it means nothing on either.
 */
function WeekStrip({
  sessions,
  now,
  t,
}: {
  sessions: WorkoutSession[];
  now: Date;
  t: Theme;
}) {
  const byDate = kindsByDate(sessions);
  const monday = startOfWeek(now);
  const todayKey = toKey(now);

  return (
    <div className="mt-3 flex gap-1">
      {Array.from({ length: 7 }, (_, d) => {
        const key = toKey(addDays(monday, d));
        const kinds = byDate.get(key);
        const future = key > todayKey;

        return (
          <DayMark
            key={key}
            t={t}
            mark={markOf(kinds)}
            title={dayTitle(key, kinds, future)}
            today={key === todayKey}
            future={future}
          />
        );
      })}
    </div>
  );
}

// The one stroke this file needs; the training page draws its own for the same
// reason — no icon dependency for a tick.
function Check({ t }: { t: Theme }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke={t.accent}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="h-5 w-5 shrink-0"
    >
      <path d="m5 12.6 4.4 4.4L19 7" />
    </svg>
  );
}
