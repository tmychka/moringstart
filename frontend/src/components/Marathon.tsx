/**
 * The marathon, whole, in one card.
 *
 * A run is two decisions: how long it is, and what it asks of you. The second
 * one is two things at once — the rules that hold every day, and whatever
 * belongs to a single day — so the day strip is the control the rest of the
 * card hangs off: pick a day and the list below is that day's, to tick off if
 * it has happened and to add to whether or not it has.
 *
 * All of it is one card, still, so nothing about a run is behind a second click
 * — but the card now has a page of its own in the sidebar rather than a slot at
 * the bottom of the dashboard, which is what a screen's worth of controls needs.
 */

import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import {
  addMarathonItem,
  deleteMarathon,
  deleteMarathonItem,
  getMarathon,
  startMarathon,
  tickMarathonItem,
  updateMarathon,
} from "../api";
import { noteFor, phraseFor } from "../encouragement";
import {
  dateOfDay,
  dayLabel,
  dayNow,
  dayTitle,
  isTicked,
  itemsForDay,
  loadOfDay,
  MARATHON_PRESETS,
  marathonNotes,
  progressOf,
  selectableDay,
  stateOfDay,
  tickSet,
  type DayLoad,
  type DayState,
  type MarathonProgress,
} from "../marathon";
import { s } from "../plural";
import { toKey } from "../stepsUtil";
import { cardClass, labelClass, numeralClass } from "../theme";
import {
  MARATHON_MAX_DAYS,
  MARATHON_MIN_DAYS,
  type Marathon,
  type MarathonItem,
  type Theme,
} from "../types";

const MARATHON_KEY = ["marathon"];

/**
 * The moment the day closes.
 *
 * Ticking the last box is what a marathon is actually for, and it used to pass
 * in silence. What gets said is read off the run rather than written: the streak
 * it just extended, or the run it just finished.
 *
 * A warm line is dealt in only on the days the number cannot carry on its own —
 * the first one or two, where "29 to go" is closer to a warning than a reward.
 * Once there is a streak, the streak is the whole message: a generic phrase
 * after it reads as filler, and the deck this borrows from can hand back "rest,
 * that's allowed" to someone who has just done the opposite.
 */
function celebrate(marathon: Marathon | null | undefined, now: Date) {
  if (!marathon) return;
  const ticks = tickSet(marathon);
  const { clean, streak, total, left } = progressOf(marathon, ticks, now);
  const day = Math.min(Math.max(dayNow(marathon, now), 1), total);

  if (left === 0) {
    toast.success(
      `That's the run — day ${day} of ${total}, ${clean} of them clean.`
    );
    return;
  }
  if (streak >= 2) {
    toast.success(
      `Day ${day} closed — ${streak} ${s(streak, "day")} in a row.`
    );
    return;
  }
  toast.success(
    `Day ${day} closed — ${left} ${s(left, "day")} to go. ${phraseFor(now).en}`
  );
}

interface MarathonProps {
  t: Theme;
  /** The dashboard's clock, so this doesn't start a second timer of its own. */
  now: Date;
  className?: string;
}

export default function MarathonCard({
  t,
  now,
  className = "",
}: MarathonProps) {
  const queryClient = useQueryClient();
  const { data: marathon, isLoading } = useQuery({
    queryKey: MARATHON_KEY,
    queryFn: getMarathon,
  });

  // Whether the start form is open on top of a finished run. A run that is over
  // stays on screen until another is started, so this is what asks for the next
  // one without throwing away how the last one went.
  const [starting, setStarting] = useState(false);

  const write = (updater: (prev: Marathon) => Marathon) =>
    queryClient.setQueryData<Marathon | null>(MARATHON_KEY, (prev) =>
      prev ? updater(prev) : prev
    );
  const fail = (error: Error) => {
    toast.error(error.message);
    void queryClient.invalidateQueries({ queryKey: MARATHON_KEY });
  };

  const begin = useMutation({
    mutationFn: (vars: { title: string; days: number }) =>
      startMarathon(vars.title, vars.days, toKey(now)),
    onSuccess: (next) => {
      queryClient.setQueryData<Marathon | null>(MARATHON_KEY, next);
      setStarting(false);
    },
    onError: fail,
  });

  const resize = useMutation({
    mutationFn: (vars: { id: number; days: number }) =>
      updateMarathon(vars.id, { days: vars.days }),
    onSuccess: (next) =>
      queryClient.setQueryData<Marathon | null>(MARATHON_KEY, next),
    onError: fail,
  });

  const abandon = useMutation({
    mutationFn: (id: number) => deleteMarathon(id),
    onSuccess: () =>
      queryClient.setQueryData<Marathon | null>(MARATHON_KEY, null),
    onError: fail,
  });

  const addItem = useMutation({
    mutationFn: (vars: { id: number; text: string; day: number | null }) =>
      addMarathonItem(vars.id, vars.text, vars.day),
    onSuccess: (item) =>
      write((prev) => ({ ...prev, items: [...prev.items, item] })),
    onError: fail,
  });

  const dropItem = useMutation({
    mutationFn: (itemId: number) => deleteMarathonItem(itemId),
    onSuccess: (_result, itemId) =>
      write((prev) => ({
        ...prev,
        items: prev.items.filter((item) => item.id !== itemId),
        ticks: prev.ticks.filter((tick) => tick.item_id !== itemId),
      })),
    onError: fail,
  });

  const tick = useMutation({
    mutationFn: (vars: {
      itemId: number;
      date: string;
      done: boolean;
      /** True when this tick is the one that closes the day — see below. */
      closesDay: boolean;
    }) => tickMarathonItem(vars.itemId, vars.date, vars.done),
    // The server answers with every tick that item now has, so its own rows are
    // replaced wholesale rather than the one date being patched in place.
    onSuccess: (ticks, vars) => {
      write((prev) => ({
        ...prev,
        ticks: [
          ...prev.ticks.filter((row) => row.item_id !== vars.itemId),
          ...ticks,
        ],
      }));
      if (vars.closesDay)
        celebrate(queryClient.getQueryData(MARATHON_KEY), now);
    },
    onError: fail,
  });

  if (isLoading) {
    return (
      <section className={`${cardClass(t)} ${className}`}>
        <p className={labelClass(t)}>Marathon</p>
        <p className={`m-0 mt-2 text-[0.78rem] ${t.muted}`}>Loading…</p>
      </section>
    );
  }

  if (!marathon || starting) {
    return (
      <section className={`${cardClass(t)} ${className}`}>
        <div className="flex items-baseline justify-between gap-3">
          <p className={labelClass(t)}>Marathon</p>
          {marathon && (
            <button
              type="button"
              onClick={() => setStarting(false)}
              className={`rounded-lg px-2 py-1 text-[0.68rem] transition-colors ${t.iconBtn}`}
            >
              Cancel
            </button>
          )}
        </div>
        {/* An empty card that only shows a form is a chore. This says what the
            thing is for first, so starting one is a decision rather than a
            field to fill in. */}
        <p className={`m-0 mt-2 text-[0.95rem] font-light leading-snug`}>
          Pick a stretch of days and commit to it.
        </p>
        <p className={`m-0 mt-1 text-[0.72rem] ${t.muted}`}>
          You can decide what it asks of you afterwards — and change it any day
          of the run.
        </p>
        <StartForm
          t={t}
          pending={begin.isPending}
          onStart={(title, days) => begin.mutate({ title, days })}
        />
      </section>
    );
  }

  return (
    <Run
      // A new run is a new set of choices — which day is selected, what is half
      // typed — so the state that holds them starts over with it.
      key={marathon.id}
      t={t}
      now={now}
      marathon={marathon}
      className={className}
      pending={{ tick: tick.isPending, add: addItem.isPending }}
      onTick={(itemId, date, done, closesDay) =>
        tick.mutate({ itemId, date, done, closesDay })
      }
      onAdd={(text, day) => addItem.mutate({ id: marathon.id, text, day })}
      onRemove={(itemId) => dropItem.mutate(itemId)}
      onResize={(days) => resize.mutate({ id: marathon.id, days })}
      onEnd={() => abandon.mutate(marathon.id)}
      onStartAnother={() => setStarting(true)}
    />
  );
}

// --- starting one ------------------------------------------------------------

interface StartFormProps {
  t: Theme;
  pending: boolean;
  onStart: (title: string, days: number) => void;
}

/**
 * Naming the run and saying how long it is. The presets are the whole control
 * for almost every marathon — one click starts one — and the field beside them
 * is for the length that isn't a round number.
 */
function StartForm({ t, pending, onStart }: StartFormProps) {
  const [title, setTitle] = useState("");
  const [custom, setCustom] = useState("");

  const start = (days: number) => {
    if (pending) return;
    onStart(title.trim() || "Marathon", days);
  };

  const startCustom = (e: FormEvent) => {
    e.preventDefault();
    const days = Number(custom);
    if (!Number.isInteger(days) || days < MARATHON_MIN_DAYS) return;
    start(Math.min(days, MARATHON_MAX_DAYS));
  };

  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="What are you running?"
        maxLength={80}
        className={`min-w-[12rem] flex-1 rounded-xl border px-3 py-1.5 text-[0.82rem] outline-none transition-colors ${t.input}`}
      />
      <div className="flex flex-wrap items-center gap-2">
        {MARATHON_PRESETS.map((days) => (
          <button
            key={days}
            type="button"
            disabled={pending}
            onClick={() => start(days)}
            className={`rounded-full border px-3 py-1 text-[0.72rem] transition-colors disabled:opacity-50 ${t.outlineBtn}`}
          >
            {days} days
          </button>
        ))}
        <form onSubmit={startCustom} className="flex items-center gap-2">
          <input
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            inputMode="numeric"
            placeholder="…"
            aria-label="Custom length in days"
            className={`w-14 rounded-xl border px-2 py-1.5 text-center text-[0.78rem] outline-none transition-colors ${t.input} ${numeralClass}`}
          />
          <button
            type="submit"
            disabled={pending || !custom.trim()}
            className={`rounded-full px-3 py-1 text-[0.72rem] transition-colors disabled:opacity-40 ${t.toggleOn}`}
          >
            Start
          </button>
        </form>
      </div>
    </div>
  );
}

// --- a run in progress -------------------------------------------------------

interface RunProps {
  t: Theme;
  now: Date;
  marathon: Marathon;
  className: string;
  pending: { tick: boolean; add: boolean };
  onTick: (
    itemId: number,
    date: string,
    done: boolean,
    closesDay: boolean
  ) => void;
  onAdd: (text: string, day: number | null) => void;
  onRemove: (itemId: number) => void;
  onResize: (days: number) => void;
  onEnd: () => void;
  onStartAnother: () => void;
}

function Run({
  t,
  now,
  marathon,
  className,
  pending,
  onTick,
  onAdd,
  onRemove,
  onResize,
  onEnd,
  onStartAnother,
}: RunProps) {
  // Null follows today, which is what the card should show every morning
  // without being told. Picking a day off the strip pins it until the card is
  // rebuilt, so looking ahead doesn't quietly become where you live.
  const [picked, setPicked] = useState<number | null>(null);
  const day = picked ?? selectableDay(marathon, now);

  const ticks = useMemo(() => tickSet(marathon), [marathon]);
  const progress = useMemo(
    () => progressOf(marathon, ticks, now),
    [marathon, ticks, now]
  );

  const items = itemsForDay(marathon, day);
  const date = dateOfDay(marathon, day);
  const load = loadOfDay(marathon, day, ticks);
  // A day that has not happened can be planned but not ticked off: a checkbox
  // you can tick in advance is a checkbox that means nothing.
  const canTick = day <= dayNow(marathon, now);
  const over = dayNow(marathon, now) > marathon.days;

  // The hero always speaks about today, whatever day the strip is parked on:
  // browsing next week should not change what the card says you owe right now.
  const todayLoad = loadOfDay(marathon, selectableDay(marathon, now), ticks);
  const note = noteFor(marathonNotes(marathon, ticks, now), now);

  return (
    <section className={`${cardClass(t)} ${className} group`}>
      <div className="flex items-baseline justify-between gap-3">
        <p className={labelClass(t)}>Marathon · {dayLabel(marathon, now)}</p>
        <div className="flex shrink-0 items-center gap-3">
          {progress.streak > 1 && (
            <p className={`m-0 text-[0.7rem] ${t.muted}`}>
              {progress.streak} {s(progress.streak, "day")} in a row
            </p>
          )}
          <EndButton t={t} onEnd={onEnd} />
        </div>
      </div>

      <Hero
        t={t}
        marathon={marathon}
        progress={progress}
        today={todayLoad}
        started={dayNow(marathon, now) >= 1}
        over={over}
      />

      <DayStrip
        t={t}
        now={now}
        marathon={marathon}
        ticks={ticks}
        selected={day}
        onSelect={setPicked}
      />

      {/* The evidence, kept quieter than the hero it backs up — the same
          arrangement the sidebar uses, and for the same reason. */}
      <p className={`m-0 mt-2.5 text-[0.7rem] leading-snug ${t.muted}`}>
        {note.en}
      </p>

      <LengthField t={t} marathon={marathon} onResize={onResize} />

      <div className={`mt-3 border-t pt-3 ${t.rule}`}>
        <div className="flex items-baseline justify-between gap-3">
          <p className={`m-0 text-[0.72rem] ${t.body}`}>
            Day {day} · {dayTitle(marathon, day, now)}
          </p>
          {load.total > 0 && (
            <p className={`m-0 text-[0.7rem] ${t.muted} ${numeralClass}`}>
              {load.done} of {load.total}
            </p>
          )}
        </div>

        {items.length === 0 ? (
          <p className={`m-0 mt-2 text-[0.78rem] ${t.muted}`}>
            {marathon.items.length === 0
              ? "Add one thing the run asks of you every day — that is the whole marathon."
              : "Nothing extra on this day."}
          </p>
        ) : (
          <ul className="m-0 mt-2 flex list-none flex-col gap-0.5 p-0">
            {items.map((item) => (
              <ItemRow
                key={item.id}
                t={t}
                item={item}
                done={isTicked(ticks, item.id, date)}
                canTick={canTick && !pending.tick}
                // Whether this is the tick that closes the day has to be worked
                // out here, where the day's whole list is in hand — the mutation
                // only ever sees the one item it is toggling.
                onToggle={(done) =>
                  onTick(
                    item.id,
                    date,
                    done,
                    done && load.done + 1 === load.total
                  )
                }
                onRemove={() => onRemove(item.id)}
              />
            ))}
          </ul>
        )}

        <AddRow
          t={t}
          day={day}
          pending={pending.add}
          onAdd={(text, scope) => onAdd(text, scope === "daily" ? null : day)}
        />
      </div>

      {over && (
        <button
          type="button"
          onClick={onStartAnother}
          className={`mt-3 self-start rounded-full border px-3 py-1 text-[0.72rem] transition-colors ${t.outlineBtn}`}
        >
          Start another
        </button>
      )}
    </section>
  );
}

// --- the hero ----------------------------------------------------------------

interface HeroProps {
  t: Theme;
  marathon: Marathon;
  progress: MarathonProgress;
  today: DayLoad;
  started: boolean;
  over: boolean;
}

/**
 * What the card is for, in one glance: how much of today is left, and what is
 * riding on it.
 *
 * The big slot holds a number that moves. It used to hold the run's title,
 * which never changes — so the card could never reward anything, and a card
 * that cannot reward is a card you stop opening. Now it counts down what today
 * still asks of you and turns into a tick when the day is closed, which is the
 * one state worth drawing differently from every other.
 *
 * The line underneath is the stake. A streak is only motivating if you are told
 * what it is about to become, so it says the number today would make it rather
 * than the number it already is.
 */
function Hero({ t, marathon, progress, today, started, over }: HeroProps) {
  const { streak, clean, elapsed, total, left } = progress;
  const done = today.total > 0 && today.done === today.total;

  const stake = !started
    ? `starts ${dayLabel(marathon, new Date()).replace("starts ", "")}`
    : over
      ? `${clean} of ${total} ${s(total, "day")} clean`
      : done
        ? streak >= 2
          ? `${streak} ${s(streak, "day")} in a row · ${left} to go`
          : `${clean} of ${elapsed} ${s(elapsed, "day")} clean · ${left} to go`
        : streak >= 1
          ? `finish today to make it ${streak + 1} in a row`
          : today.total === 0
            ? "nothing on today yet"
            : `${clean} of ${elapsed} ${s(elapsed, "day")} clean so far`;

  return (
    <div className="mt-3 flex items-center gap-4">
      <DayRing t={t} done={today.done} total={today.total} complete={done} />
      <div className="min-w-0 flex-1">
        <h2
          className={`m-0 min-w-0 truncate text-[1.35rem] leading-none ${numeralClass}`}
        >
          {marathon.title}
        </h2>
        <p className={`m-0 mt-1.5 truncate text-[0.72rem] ${t.body}`}>
          {stake}
        </p>
      </div>
    </div>
  );
}

/**
 * Today, as a ring with what is left inside it.
 *
 * A thin arc rather than a bar: the bar under the roadmap measures a long road,
 * and this measures one day, which is a thing you close rather than a thing you
 * advance along. The arc animates as it fills, and that half-second is the only
 * reward the app gives for ticking a box — small, but it is the difference
 * between a checkbox and a moment.
 */
function DayRing({
  t,
  done,
  total,
  complete,
}: {
  t: Theme;
  done: number;
  total: number;
  complete: boolean;
}) {
  const size = 54;
  const stroke = 3;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const ratio = total > 0 ? done / total : 0;

  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={t.track}
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={t.accent}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - ratio)}
          className="transition-[stroke-dashoffset] duration-500 ease-out"
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        {complete ? (
          <Tick t={t} />
        ) : (
          <span className={`text-[1.4rem] leading-none ${numeralClass}`}>
            {total > 0 ? total - done : "–"}
          </span>
        )}
      </div>
    </div>
  );
}

/** The one stroke this file needs; the dashboard draws its own for the same
 * reason — no icon dependency for a tick. */
function Tick({ t }: { t: Theme }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke={t.accent}
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="h-6 w-6"
    >
      <path d="m5 12.6 4.4 4.4L19 7" />
    </svg>
  );
}

/**
 * Ending a run in two clicks rather than one. A marathon is weeks of ticked
 * boxes and there is no undo behind this button, so the first press only asks.
 */
function EndButton({ t, onEnd }: { t: Theme; onEnd: () => void }) {
  const [asking, setAsking] = useState(false);

  if (asking) {
    return (
      <span className="flex items-center gap-1">
        <button
          type="button"
          onClick={onEnd}
          className={`rounded-lg px-2 py-1 text-[0.68rem] transition-colors ${t.iconBtn}`}
          style={{ color: t.accent }}
        >
          Delete it
        </button>
        <button
          type="button"
          onClick={() => setAsking(false)}
          className={`rounded-lg px-2 py-1 text-[0.68rem] transition-colors ${t.iconBtn}`}
        >
          Keep
        </button>
      </span>
    );
  }

  // Out of the way until the card is under the pointer or holds focus, like the
  // delete on the todo rows.
  return (
    <button
      type="button"
      onClick={() => setAsking(true)}
      className={`rounded-lg px-2 py-1 text-[0.68rem] opacity-0 transition-opacity focus:opacity-100 group-hover:opacity-100 ${t.iconBtn}`}
    >
      End run
    </button>
  );
}

// --- the day strip -----------------------------------------------------------

interface DayStripProps {
  t: Theme;
  now: Date;
  marathon: Marathon;
  ticks: Set<string>;
  selected: number;
  onSelect: (day: number) => void;
}

/**
 * The run as ground covered. Grouped in sevens with a wider gap between the
 * blocks: thirty identical squares in one line is a number you have to count,
 * while four blocks and a bit is a distance you can see — and a week is the
 * unit people already plan in.
 */
function DayStrip({
  t,
  now,
  marathon,
  ticks,
  selected,
  onSelect,
}: DayStripProps) {
  const today = dayNow(marathon, now);
  const weeks: number[][] = [];
  for (let day = 1; day <= marathon.days; day++) {
    if ((day - 1) % 7 === 0) weeks.push([]);
    weeks[weeks.length - 1].push(day);
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
      {weeks.map((week) => (
        <div key={week[0]} className="flex gap-1">
          {week.map((day) => (
            <DayCell
              key={day}
              t={t}
              day={day}
              state={stateOfDay(marathon, day, ticks, now)}
              selected={day === selected}
              today={day === today}
              label={dayTitle(marathon, day, now)}
              onSelect={() => onSelect(day)}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

interface DayCellProps {
  t: Theme;
  day: number;
  state: DayState;
  selected: boolean;
  today: boolean;
  label: string;
  onSelect: () => void;
}

/**
 * One day of the run. The states are told apart by shape rather than by hue,
 * for the reason the training marks are: every treatment in this app has
 * exactly one accent, so invented colours would belong to nothing.
 *
 * A day with nothing on it and a day whose list went untouched are deliberately
 * different marks — an unplanned day is not a failed one, and drawing them the
 * same would make an empty marathon look like a lost one.
 */
function DayCell({
  t,
  day,
  state,
  selected,
  today,
  label,
  onSelect,
}: DayCellProps) {
  const fill =
    state === "done"
      ? { backgroundColor: t.accent }
      : state === "partial"
        ? { boxShadow: `inset 0 0 0 2px ${t.accent}` }
        : { backgroundColor: t.track };

  return (
    <button
      type="button"
      onClick={onSelect}
      title={`Day ${day} · ${label}`}
      aria-label={`Day ${day}, ${label}`}
      aria-pressed={selected}
      aria-current={today ? "date" : undefined}
      // Today is drawn a size larger than the days either side of it, so the
      // strip says where you are standing before it says how anything went.
      className={`grid shrink-0 place-items-center rounded-[3px] transition-transform hover:scale-125 ${
        today ? "h-5 w-5" : "h-4 w-4"
      }`}
      style={{
        ...fill,
        opacity: state === "future" ? 0.35 : 1,
        outline: selected
          ? `1.5px solid ${t.accent}`
          : today
            ? `1.5px solid ${t.accentSoft}`
            : "",
        outlineOffset: "1px",
      }}
    >
      {/* A day that asked for something and got none of it, struck through. */}
      {state === "missed" && (
        <i
          className="h-[2px] w-2.5 rounded-full"
          style={{ backgroundColor: t.accentSoft }}
        />
      )}
    </button>
  );
}

// --- changing the length -----------------------------------------------------

/**
 * How long the run is, after it has started. Shortening one drops the days it
 * loses along with anything pinned to them, which is why the field says so
 * rather than only taking the number.
 */
function LengthField({
  t,
  marathon,
  onResize,
}: {
  t: Theme;
  marathon: Marathon;
  onResize: (days: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(marathon.days));

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setValue(String(marathon.days));
          setEditing(true);
        }}
        className={`mt-2 self-start text-left text-[0.68rem] opacity-0 transition-opacity focus:opacity-100 group-hover:opacity-100 ${t.muted}`}
      >
        Change length
      </button>
    );
  }

  const commit = (e: FormEvent) => {
    e.preventDefault();
    const days = Number(value);
    if (Number.isInteger(days) && days >= MARATHON_MIN_DAYS) {
      onResize(Math.min(days, MARATHON_MAX_DAYS));
    }
    setEditing(false);
  };

  const shorter = Number(value) > 0 && Number(value) < marathon.days;

  return (
    <form onSubmit={commit} className="mt-2 flex items-center gap-2">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        inputMode="numeric"
        autoFocus
        aria-label="Length in days"
        className={`w-14 rounded-xl border px-2 py-1 text-center text-[0.75rem] outline-none transition-colors ${t.input} ${numeralClass}`}
      />
      <button
        type="submit"
        className={`rounded-full px-3 py-1 text-[0.7rem] transition-colors ${t.toggleOn}`}
      >
        Set length
      </button>
      <button
        type="button"
        onClick={() => setEditing(false)}
        className={`rounded-lg px-2 py-1 text-[0.68rem] transition-colors ${t.iconBtn}`}
      >
        Cancel
      </button>
      {shorter && (
        <span className={`text-[0.68rem] ${t.muted}`}>
          drops days {Number(value) + 1}–{marathon.days}
        </span>
      )}
    </form>
  );
}

// --- the day's list ----------------------------------------------------------

interface ItemRowProps {
  t: Theme;
  item: MarathonItem;
  done: boolean;
  canTick: boolean;
  onToggle: (done: boolean) => void;
  onRemove: () => void;
}

function ItemRow({ t, item, done, canTick, onToggle, onRemove }: ItemRowProps) {
  return (
    <li
      className={`flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors ${t.rowHover}`}
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={done}
        aria-label={done ? `Undo ${item.text}` : `Mark ${item.text} done`}
        title={canTick ? "Mark as done" : "This day hasn't come yet"}
        disabled={!canTick}
        onClick={() => onToggle(!done)}
        // The same mark as the todo rows, so ticking something off is one
        // gesture across the app rather than one per screen.
        className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full border transition-colors hover:opacity-70 disabled:cursor-not-allowed disabled:opacity-40"
        style={{
          borderColor: done ? t.accent : t.track,
          backgroundColor: done ? t.accent : "transparent",
        }}
      />
      <span
        className={`min-w-0 flex-1 truncate text-[0.82rem] ${done ? t.faint : t.body}`}
        style={done ? { textDecoration: "line-through" } : undefined}
      >
        {item.text}
      </span>
      <span className={`shrink-0 text-[0.68rem] ${t.muted}`}>
        {item.day === null ? "every day" : `day ${item.day}`}
      </span>
      <button
        type="button"
        aria-label={`Delete ${item.text}`}
        title="Delete"
        onClick={onRemove}
        className={`shrink-0 rounded-lg px-2 py-1 text-[0.68rem] transition-colors ${t.iconBtn}`}
      >
        Delete
      </button>
    </li>
  );
}

type Scope = "daily" | "day";

interface AddRowProps {
  t: Theme;
  day: number;
  pending: boolean;
  onAdd: (text: string, scope: Scope) => void;
}

/**
 * Adding something to the run. The scope switch is the whole difference between
 * the two kinds of item, so it sits next to the field rather than behind a menu
 * — and it holds its setting, because a run is usually written one kind at a
 * time.
 */
function AddRow({ t, day, pending, onAdd }: AddRowProps) {
  const [text, setText] = useState("");
  const [scope, setScope] = useState<Scope>("daily");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const clean = text.trim();
    if (!clean || pending) return;
    onAdd(clean, scope);
    setText("");
  };

  return (
    <form onSubmit={submit} className="mt-2 flex flex-wrap items-center gap-2">
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={
          scope === "daily" ? "Every day of the run…" : `Just day ${day}…`
        }
        maxLength={200}
        className={`min-w-[10rem] flex-1 rounded-xl border px-3 py-1.5 text-[0.8rem] outline-none transition-colors ${t.input}`}
      />
      <div className="flex shrink-0 items-center gap-1">
        {(["daily", "day"] as const).map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={scope === option}
            onClick={() => setScope(option)}
            className={`rounded-full px-3 py-1 text-[0.7rem] transition-colors ${
              scope === option ? t.toggleOn : t.toggleOff
            }`}
          >
            {option === "daily" ? "Every day" : `Day ${day}`}
          </button>
        ))}
        <button
          type="submit"
          disabled={pending || !text.trim()}
          className={`rounded-lg px-2 py-1 text-[0.7rem] transition-colors disabled:opacity-40 ${t.iconBtn}`}
        >
          Add
        </button>
      </div>
    </form>
  );
}
