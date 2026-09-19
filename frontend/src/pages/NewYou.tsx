/**
 * New You: the rest of the year, worked on in three directions.
 *
 * The board is a week — a row per direction, a column per day — and every cell
 * is a small list of what that day of it is going to be. Under it, the run: one
 * square a day per direction, from the first plan to New Year's Eve, so a week
 * that went well and a week that didn't are both visible as a shape.
 */
import { useMemo, useRef, useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import AppSidebar from "../components/AppSidebar";
import { addDays, startOfWeek } from "../dashboardStats";
import {
  addPlan,
  DIRECTIONS,
  fromKey,
  movePlan,
  removePlan,
  repeatWeek,
  runDays,
  runOf,
  togglePlan,
  usePlans,
  type DirectionInfo,
  type Plan,
  type Run,
  type RunMark,
} from "../newYou";
import { s } from "../plural";
import { toKey } from "../stepsUtil";
import { cardClass, labelClass, numeralClass, useTheme } from "../theme";
import type { Theme } from "../types";
import useNow from "../useNow";

const DAY_MS = 86400000;

const weekday = new Intl.DateTimeFormat("en-GB", { weekday: "short" });
const dayMonth = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
});

export default function NewYou() {
  const { t } = useTheme();
  const navigate = useNavigate();
  const now = useNow();
  const plans = usePlans();
  // Weeks away from the current one; 0 is this week.
  const [offset, setOffset] = useState(0);

  const todayKey = toKey(now);
  const year = now.getFullYear();
  // Counted on UTC dates, like the dashboard's countdown, so a daylight-saving
  // day can't round the number a day either side.
  const left = Math.round(
    (Date.UTC(year + 1, 0, 1) - Date.UTC(year, now.getMonth(), now.getDate())) /
      DAY_MS
  );
  const weeksLeft = Math.ceil(left / 7);

  const monday = addDays(startOfWeek(now), offset * 7);
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const first = toKey(days[0]);
  const last = toKey(days[6]);
  const week = plans.filter((plan) => plan.date >= first && plan.date <= last);
  const weekDone = week.filter((plan) => plan.done).length;
  const lastWeekFrom = toKey(addDays(monday, -7));
  const canRepeat =
    week.length === 0 &&
    plans.some((plan) => plan.date >= lastWeekFrom && plan.date < first);

  const run = useMemo(() => {
    const keys = runDays(plans, todayKey);
    return {
      keys,
      runs: DIRECTIONS.map((direction) =>
        runOf(plans, direction.id, keys, todayKey)
      ),
    };
  }, [plans, todayKey]);
  // The days all three got something done — the ones that count double.
  const allThree = run.keys.filter(
    (key) => key <= todayKey && run.runs.every((r) => r.done.has(key))
  ).length;

  return (
    <div
      className={`relative flex h-screen w-screen overflow-hidden transition-colors duration-300 ${t.page}`}
    >
      <AppSidebar />

      <div className="h-full flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-3 px-6 pb-16 pt-8 sm:px-8">
          <header className={`border-b pb-4 ${t.rule}`}>
            <button
              type="button"
              onClick={() => navigate("/")}
              className={`${labelClass(t)} cursor-pointer border-none bg-transparent p-0 transition-opacity hover:opacity-70`}
            >
              ← Dashboard
            </button>

            <div className="mt-4 flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
              <div className="min-w-0">
                <p className={labelClass(t)}>New You · {year + 1}</p>
                <h1
                  className={`m-0 mt-2 text-[1.7rem] leading-none ${numeralClass}`}
                >
                  {left}
                  <span className={`ml-2 text-[0.8rem] ${t.muted}`}>
                    {s(left, "day")} to become who you want to be
                  </span>
                </h1>
              </div>

              <dl className="m-0 flex gap-8">
                <Stat
                  t={t}
                  value={`${weekDone}/${week.length}`}
                  label={offset === 0 ? "done this week" : "done that week"}
                />
                <Stat
                  t={t}
                  value={String(allThree)}
                  label={`${s(allThree, "day")} with all three`}
                />
              </dl>
            </div>
          </header>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1">
              <WeekButton
                t={t}
                label="Previous week"
                onClick={() => setOffset((value) => value - 1)}
              >
                ‹
              </WeekButton>
              <p
                className={`m-0 min-w-[8.5rem] text-center text-[0.95rem] ${numeralClass}`}
              >
                {rangeLabel(days[0], days[6])}
              </p>
              <WeekButton
                t={t}
                label="Next week"
                onClick={() => setOffset((value) => value + 1)}
              >
                ›
              </WeekButton>
              {offset !== 0 && (
                <button
                  type="button"
                  onClick={() => setOffset(0)}
                  className={`ml-1 rounded-lg px-2 py-1 text-[0.72rem] transition-colors ${t.iconBtn}`}
                >
                  Back to this week
                </button>
              )}
            </div>
            <p className={`m-0 text-[0.72rem] ${t.muted}`}>
              {weekCaption(offset)} · {weeksLeft} {s(weeksLeft, "week")} left in{" "}
              {year}
            </p>
          </div>

          {plans.length === 0 && (
            <p className={`m-0 text-[0.78rem] ${t.muted}`}>
              Give each direction one small thing a day — click “+ add” in any
              cell. Everything you tick off fills in the run below.
            </p>
          )}

          {canRepeat && (
            <div
              className={`flex flex-wrap items-center justify-between gap-2 rounded-2xl border px-4 py-2.5 ${t.rule}`}
            >
              <p className={`m-0 text-[0.78rem] ${t.muted}`}>
                Nothing planned for this week yet.
              </p>
              <button
                type="button"
                onClick={() => repeatWeek(first)}
                className={`rounded-lg px-2.5 py-1 text-[0.75rem] transition-colors ${t.iconBtn}`}
              >
                Repeat last week’s plan
              </button>
            </div>
          )}

          {/* One set of elements for both layouts: on a wide screen the rows
              dissolve into a 7-day grid, below it every direction stacks its
              days as a list with the weekday written beside each. */}
          <section
            className={`${cardClass(t)} xl:grid xl:grid-cols-[8rem_repeat(7,minmax(0,1fr))] xl:gap-1.5`}
          >
            <div className="hidden xl:block" aria-hidden="true" />
            {days.map((day) => {
              const key = toKey(day);
              const today = key === todayKey;
              return (
                <div key={key} className="hidden px-1.5 pb-1 xl:block">
                  <p
                    className={labelClass(t)}
                    style={today ? { color: t.accent } : undefined}
                  >
                    {today ? "Today" : weekday.format(day)}
                  </p>
                  <p
                    className={`m-0 mt-1 text-[1.2rem] leading-none ${numeralClass} ${
                      key < todayKey ? t.muted : ""
                    }`}
                    style={today ? { color: t.accent } : undefined}
                  >
                    {day.getDate()}
                  </p>
                </div>
              );
            })}

            {DIRECTIONS.map((direction, i) => (
              <DirectionRow
                key={direction.id}
                t={t}
                direction={direction}
                days={days}
                todayKey={todayKey}
                plans={week.filter((plan) => plan.direction === direction.id)}
                run={run.runs[i]}
                first={i === 0}
              />
            ))}
          </section>

          <section className={cardClass(t)}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className={labelClass(t)}>The run to {year + 1}</p>
              <p className={`m-0 text-[0.7rem] ${t.muted}`}>
                one square a day, from your first plan to New Year’s Eve
              </p>
            </div>

            {DIRECTIONS.map((direction, i) => (
              <RunStrip
                key={direction.id}
                t={t}
                direction={direction}
                run={run.runs[i]}
                keys={run.keys}
                todayKey={todayKey}
              />
            ))}

            <Legend t={t} />
          </section>
        </div>
      </div>
    </div>
  );
}

// --- header ------------------------------------------------------------------

function Stat({ t, value, label }: { t: Theme; value: string; label: string }) {
  return (
    <div className="flex flex-col-reverse items-end">
      <dt className={`mt-1 text-[0.66rem] ${t.muted}`}>{label}</dt>
      <dd className={`m-0 text-[1.35rem] leading-none ${numeralClass}`}>
        {value}
      </dd>
    </div>
  );
}

function WeekButton({
  t,
  label,
  onClick,
  children,
}: {
  t: Theme;
  label: string;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`grid h-8 w-8 place-items-center rounded-lg text-[1.1rem] leading-none transition-colors ${t.iconBtn}`}
    >
      {children}
    </button>
  );
}

// --- the board ---------------------------------------------------------------

interface DirectionRowProps {
  t: Theme;
  direction: DirectionInfo;
  days: Date[];
  todayKey: string;
  /** This direction's plans for the week on show. */
  plans: Plan[];
  run: Run;
  first: boolean;
}

function DirectionRow({
  t,
  direction,
  days,
  todayKey,
  plans,
  run,
  first,
}: DirectionRowProps) {
  const navigate = useNavigate();
  const done = plans.filter((plan) => plan.done).length;

  return (
    <div
      className={`xl:contents ${first ? "" : `mt-5 border-t pt-5 ${t.rule}`}`}
    >
      <div className="mb-2 flex items-center justify-between gap-3 xl:mb-0 xl:flex-col xl:items-start xl:justify-center xl:gap-1.5 xl:pr-3">
        <button
          type="button"
          onClick={() => navigate(`/${direction.area.slug}`)}
          title={`Open ${direction.area.label}`}
          className="cursor-pointer border-none bg-transparent p-0 text-left text-[0.95rem] font-medium tracking-[-0.01em] transition-opacity hover:opacity-70"
        >
          {direction.label}
        </button>
        <div className="flex items-center gap-2 xl:w-full xl:flex-col xl:items-start xl:gap-1.5">
          <p className={`m-0 text-[0.66rem] tabular-nums ${t.muted}`}>
            {plans.length === 0
              ? "nothing planned"
              : `${done} of ${plans.length} done`}
          </p>
          <Meter t={t} ratio={plans.length ? done / plans.length : 0} />
          {run.current > 0 && (
            <p className={`m-0 text-[0.62rem] ${t.faint}`}>
              {run.current}-day streak
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-1.5 xl:contents">
        {days.map((day) => {
          const key = toKey(day);
          return (
            <DayCell
              key={key}
              t={t}
              direction={direction}
              day={day}
              dateKey={key}
              todayKey={todayKey}
              plans={plans.filter((plan) => plan.date === key)}
            />
          );
        })}
      </div>
    </div>
  );
}

function Meter({ t, ratio }: { t: Theme; ratio: number }) {
  return (
    <div
      className="h-1 w-16 overflow-hidden rounded-full xl:w-full"
      style={{ backgroundColor: t.track }}
    >
      <div
        className="h-full rounded-full transition-[width] duration-500 ease-out"
        style={{ width: `${ratio * 100}%`, backgroundColor: t.accent }}
      />
    </div>
  );
}

interface DayCellProps {
  t: Theme;
  direction: DirectionInfo;
  day: Date;
  dateKey: string;
  todayKey: string;
  plans: Plan[];
}

/**
 * One day of one direction. The add field only opens on request — twenty-one
 * inputs sitting open would make the board a form rather than a week.
 */
function DayCell({
  t,
  direction,
  day,
  dateKey,
  todayKey,
  plans,
}: DayCellProps) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  // Escape leaves through blur like any other exit, and this is how that blur
  // knows to throw the draft away rather than keep it.
  const cancelled = useRef(false);

  const today = dateKey === todayKey;
  const past = dateKey < todayKey;
  const label = `${direction.label}, ${dayMonth.format(day)}`;

  const close = () => {
    if (!cancelled.current) addPlan(direction.id, dateKey, draft);
    cancelled.current = false;
    setDraft("");
    setAdding(false);
  };

  return (
    <div
      className={`group/cell flex gap-3 rounded-xl border p-1.5 transition-colors xl:min-h-[6.5rem] xl:flex-col xl:gap-1 ${t.rule}`}
      style={today ? { borderColor: t.accent } : undefined}
    >
      <p
        className={`m-0 w-14 shrink-0 pl-1 pt-[3px] text-[0.7rem] xl:hidden ${
          today ? "" : t.muted
        }`}
        style={today ? { color: t.accent } : undefined}
      >
        {today ? "Today" : weekday.format(day)}{" "}
        <span className="tabular-nums">{day.getDate()}</span>
      </p>

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {plans.length > 0 && (
          <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
            {plans.map((plan) => (
              <PlanRow
                key={plan.id}
                t={t}
                plan={plan}
                carryTo={past && !plan.done ? todayKey : null}
              />
            ))}
          </ul>
        )}

        {adding ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              addPlan(direction.id, dateKey, draft);
              setDraft("");
            }}
          >
            <input
              // Opened by a click on "+ add", so focus belongs here already.
              autoFocus
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={close}
              onKeyDown={(event) => {
                if (event.key !== "Escape") return;
                cancelled.current = true;
                event.currentTarget.blur();
              }}
              maxLength={120}
              placeholder={direction.hint}
              aria-label={`Add to ${label}`}
              className={`w-full min-w-0 rounded-lg border px-1.5 py-1 text-[0.72rem] outline-none transition-colors ${t.input}`}
            />
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            aria-label={`Add to ${label}`}
            className={`self-start rounded-md border-none bg-transparent px-1 text-[0.7rem] leading-5 transition-opacity hover:opacity-100 focus:opacity-100 group-hover/cell:opacity-100 ${t.faint} ${
              plans.length > 0 ? "opacity-0" : "opacity-60"
            }`}
          >
            + add
          </button>
        )}
      </div>
    </div>
  );
}

function PlanRow({
  t,
  plan,
  carryTo,
}: {
  t: Theme;
  plan: Plan;
  /** Today's key when the plan is an unfinished one from a day already gone. */
  carryTo: string | null;
}) {
  return (
    <li
      className={`group/row relative flex items-start gap-1.5 rounded-lg px-1 py-0.5 transition-colors ${t.rowHover}`}
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={plan.done}
        aria-label={`${plan.done ? "Reopen" : "Complete"} ${plan.title}`}
        onClick={() => togglePlan(plan.id)}
        // The same round mark as the todo rows, so ticking something off is one
        // gesture across the app.
        className="mt-[3px] grid h-3.5 w-3.5 shrink-0 cursor-pointer place-items-center rounded-full border p-0 transition-colors"
        style={{
          borderColor: plan.done ? t.accent : t.track,
          backgroundColor: plan.done ? t.accent : "transparent",
        }}
      >
        {plan.done && <Check t={t} />}
      </button>

      <span
        className={`min-w-0 flex-1 break-words text-[0.74rem] leading-snug ${
          plan.done ? t.faint : t.body
        }`}
        style={plan.done ? { textDecoration: "line-through" } : undefined}
      >
        {plan.title}
      </span>

      {/* Floated over the row rather than beside it: a cell is narrow, and
          two buttons' worth of width would wrap every title a line early. */}
      <span
        className="absolute right-0.5 top-0.5 flex rounded-md opacity-0 transition-opacity focus-within:opacity-100 group-hover/row:opacity-100"
        style={{
          backgroundColor: t.appBg,
          boxShadow: `0 0 0 1px ${t.track}`,
        }}
      >
        {carryTo && (
          <button
            type="button"
            title="Move to today"
            aria-label={`Move ${plan.title} to today`}
            onClick={() => movePlan(plan.id, carryTo)}
            className={`rounded-md px-1 text-[0.68rem] leading-4 ${t.iconBtn}`}
          >
            →
          </button>
        )}
        <button
          type="button"
          title="Delete"
          aria-label={`Delete ${plan.title}`}
          onClick={() => removePlan(plan.id)}
          className={`rounded-md px-1 text-[0.62rem] leading-4 ${t.iconBtn}`}
        >
          ✕
        </button>
      </span>
    </li>
  );
}

function Check({ t }: { t: Theme }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke={t.appBg}
      strokeWidth="3.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="h-2.5 w-2.5"
    >
      <path d="m5 12.6 4.4 4.4L19 7" />
    </svg>
  );
}

// --- the run -----------------------------------------------------------------

const MARK_WORDS: Record<RunMark, string> = {
  done: "done",
  open: "planned",
  missed: "planned, not done",
  idle: "nothing planned",
};

const markStyle = (
  t: Theme,
  mark: RunMark,
  future: boolean,
  today: boolean
): CSSProperties => ({
  ...(mark === "done"
    ? { backgroundColor: t.accent }
    : mark === "open"
      ? { boxShadow: `inset 0 0 0 1.5px ${t.accent}` }
      : mark === "missed"
        ? { boxShadow: `inset 0 0 0 1.5px ${t.track}` }
        : { backgroundColor: t.track }),
  // A day that hasn't happened is not a day with nothing in it.
  opacity: future && mark === "idle" ? 0.35 : 1,
  outline: today ? `1.5px solid ${t.accentSoft}` : "",
  outlineOffset: "1px",
});

function RunStrip({
  t,
  direction,
  run,
  keys,
  todayKey,
}: {
  t: Theme;
  direction: DirectionInfo;
  run: Run;
  keys: string[];
  todayKey: string;
}) {
  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <p className="m-0 text-[0.82rem]">{direction.label}</p>
        <p className={`m-0 text-[0.66rem] tabular-nums ${t.muted}`}>
          {run.done.size} {s(run.done.size, "day")} done · best streak{" "}
          {run.best}
        </p>
      </div>
      <div className="mt-2 flex flex-wrap gap-[3px]">
        {keys.map((key, i) => (
          <i
            key={key}
            title={`${dayMonth.format(fromKey(key))} · ${MARK_WORDS[run.marks[i]]}`}
            className="block h-2.5 w-2.5 rounded-[2px]"
            style={markStyle(t, run.marks[i], key > todayKey, key === todayKey)}
          />
        ))}
      </div>
    </div>
  );
}

function Legend({ t }: { t: Theme }) {
  const marks: RunMark[] = ["done", "open", "missed", "idle"];
  return (
    <div
      className={`mt-4 flex flex-wrap gap-x-4 gap-y-1 border-t pt-3 ${t.rule}`}
    >
      {marks.map((mark) => (
        <span
          key={mark}
          className={`flex items-center gap-1.5 text-[0.66rem] ${t.muted}`}
        >
          <i
            className="block h-2.5 w-2.5 rounded-[2px]"
            style={markStyle(t, mark, false, false)}
          />
          {MARK_WORDS[mark]}
        </span>
      ))}
    </div>
  );
}

// --- labels ------------------------------------------------------------------

/** "15 – 21 Sep", or "29 Sep – 5 Oct" when the week straddles two months. */
function rangeLabel(from: Date, to: Date): string {
  return from.getMonth() === to.getMonth()
    ? `${from.getDate()} – ${dayMonth.format(to)}`
    : `${dayMonth.format(from)} – ${dayMonth.format(to)}`;
}

function weekCaption(offset: number): string {
  if (offset === 0) return "This week";
  if (offset === -1) return "Last week";
  if (offset === 1) return "Next week";
  const n = Math.abs(offset);
  return offset < 0 ? `${n} weeks ago` : `In ${n} weeks`;
}
