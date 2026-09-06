/**
 * What you are doing, and where the day has gone — across the top of the
 * dashboard.
 *
 * It used to be the right-hand column of the body map, where the day was drawn
 * as a vertical ruler because a tall narrow column is what it had. On the
 * dashboard the same block has the whole width and about a fifth of the height,
 * so the day is drawn the way a day is usually read: left to right, midnight to
 * midnight, with each status sitting over the hours it actually took.
 *
 * Nothing here is a second copy of the panel's numbers — the profile is read on
 * the key every other screen reads it on, and the writes go through the very
 * mutations the body map and the chat use.
 */
import { useCallback, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { getProfile } from "../api";
import StatusCalendar from "./StatusCalendar";
import {
  STATUS_PRESETS,
  lastEntryToday,
  minutesInDay,
  statusTotals,
  todaySpans,
  type Span,
  type StatusTotal,
} from "../jarvis";
import { colourFor, colourKey } from "../statusMonth";
import { cardClass, labelClass, numeralClass } from "../theme";
import { formatMinutes } from "../todos";
import { PROFILE_KEY, useCommit } from "../useTracking";
import type { Theme } from "../types";

/** Hours that get a number under them. Every third keeps the ruler readable at
 *  any width the card is given. */
const LABEL_EVERY = 3;
/**
 * The narrowest a block can be and still be worth writing a name in, as a share
 * of the day. Under this the name is only in the tooltip — a truncated word is
 * less use than none, and the block is still there to be hovered.
 */
const NAMED_SHARE = 0.055;

interface StatusBarProps {
  t: Theme;
  /** The dashboard's clock, so this doesn't start a second timer of its own. */
  now: Date;
  className?: string;
}

export default function StatusBar({ t, now, className = "" }: StatusBarProps) {
  const { data: profile } = useQuery({
    queryKey: PROFILE_KEY,
    queryFn: getProfile,
  });
  const commit = useCommit(now);

  const [calendarOpen, setCalendarOpen] = useState(false);
  // Stable, so the dialog's key handler and its opening focus are not torn down
  // and re-run every time the clock ticks a new `now` through this component.
  const closeCalendar = useCallback(() => setCalendarOpen(false), []);

  // Time first, because "when was that" is the question the log is kept for;
  // the totals are the summary you go to afterwards.
  const [view, setView] = useState<"time" | "totals">("time");

  const status = profile?.status ?? "";
  const log = profile?.log ?? [];

  const [draft, setDraft] = useState(status);
  const [seeded, setSeeded] = useState(status);
  // The field holds a draft of a value that also arrives from the server, so it
  // re-seeds whenever the saved status changes underneath it — adjusted during
  // the render that brings the new status in, rather than in an effect that
  // would paint the stale draft first.
  if (seeded !== status) {
    setSeeded(status);
    setDraft(status);
  }

  const spans = todaySpans(log, now);
  const totals = statusTotals(spans);
  // What can be taken back, and whether anything is running right now. A stop is
  // an entry like any other — it just draws no block — so both questions are
  // asked of the log rather than of the strip.
  const newest = lastEntryToday(log, now);
  const running = newest !== null && newest.status !== "";

  const date = now.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const time = now.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <section className={`${cardClass(t)} ${className}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <span className="flex min-w-0 items-baseline gap-2">
          <p className={labelClass(t)}>Status</p>
          {/* Which reading of the same day is showing below. Beside the label
              rather than over the content, because it names what the block is
              rather than acting on it. */}
          <span className="flex items-baseline gap-0.5">
            <ViewTab t={t} on={view === "time"} onClick={() => setView("time")}>
              Time
            </ViewTab>
            <ViewTab
              t={t}
              on={view === "totals"}
              onClick={() => setView("totals")}
            >
              Totals
            </ViewTab>
          </span>
        </span>

        <span className="flex shrink-0 items-baseline gap-3">
          {/* The greeting this block replaced said the date and the time. The
              date is what the ruler below is a day of, and the clock is what the
              marker on it is pointing at, so both stay — quietly, at the end of
              the row rather than as a headline. */}
          <p className={`m-0 hidden text-[0.65rem] sm:block ${t.faint}`}>
            {date}
          </p>
          <p className={`m-0 text-[1.05rem] leading-none ${numeralClass}`}>
            {time}
          </p>

          <span className="flex items-center gap-1 self-center">
            {/* Stops the clock: nothing is being done as of now, and whatever
                was running stops collecting time against it. Only while there is
                something to stop — on an idle day it would be a no-op. */}
            {running && (
              <button
                type="button"
                onClick={() => commit.status("")}
                title="Stop the clock"
                className={`cursor-pointer rounded-md border-none bg-transparent px-1.5 py-0.5 text-[0.65rem] transition-colors ${t.iconBtn}`}
              >
                Stop
              </button>
            )}
            {/* Only while there is something of today's to take back. Offered
                against an empty day it would reach into yesterday and quietly
                delete the last thing set there, which is never what undo on a
                fresh day is asking for. Read off the log, not the strip: a stop
                is takeable back too, and it draws nothing. */}
            {newest && (
              <button
                type="button"
                onClick={commit.undo}
                title={
                  newest.status ? `Undo "${newest.status}"` : "Undo the stop"
                }
                className={`cursor-pointer rounded-md border-none bg-transparent px-1.5 py-0.5 text-[0.65rem] transition-colors ${t.iconBtn}`}
              >
                Undo
              </button>
            )}
            <button
              type="button"
              onClick={() => setCalendarOpen(true)}
              title="Last 30 days"
              aria-label="Open the last 30 days"
              className={`flex h-6 w-6 cursor-pointer items-center justify-center rounded-md border-none bg-transparent transition-colors ${t.iconBtn}`}
            >
              <CalendarIcon />
            </button>
          </span>
        </span>
      </div>

      {/* The field and the one-click statuses on one line: at this width they
          fit side by side, and the day below gets the height that saves. */}
      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2">
        <form
          className="min-w-[11rem] flex-1"
          onSubmit={(event) => {
            event.preventDefault();
            commit.status(draft.trim());
          }}
        >
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value.slice(0, 60))}
            onBlur={() =>
              draft.trim() !== status && commit.status(draft.trim())
            }
            placeholder="What are you doing?"
            aria-label="Current status"
            className={`w-full rounded-xl border px-3 py-1.5 text-[0.9rem] outline-none transition-colors ${t.input}`}
          />
        </form>

        <div className="flex flex-wrap items-center gap-1">
          {STATUS_PRESETS.map((preset) => (
            <Chip
              key={preset}
              t={t}
              active={preset === status}
              onClick={() => commit.status(preset)}
            >
              {preset}
            </Chip>
          ))}
        </div>
      </div>

      <div className="mt-3">
        {view === "time" ? (
          <DayLine spans={spans} length={minutesInDay(now)} now={now} t={t} />
        ) : (
          <DayTally totals={totals} t={t} />
        )}
      </div>

      {calendarOpen && (
        <StatusCalendar t={t} now={now} onClose={closeCalendar} />
      )}
    </section>
  );
}

/**
 * The day, end to end, with each status over the hours it took.
 *
 * Hours are the axis and they are evenly spaced whether or not anything happened
 * in them: a gap is information — it is the part of the day that went
 * unrecorded — and a scale that skipped it would make an hour of work and eight
 * hours of nothing look the same width.
 */
function DayLine({
  spans,
  length,
  now,
  t,
}: {
  spans: Span[];
  /** The day's own length in minutes — not always 1440, see `minutesInDay`. */
  length: number;
  now: Date;
  t: Theme;
}) {
  const hours = Math.round(length / 60);
  const pct = (minutes: number) => (minutes / length) * 100;

  const minutesNow =
    (now.getTime() -
      new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) /
    60000;

  // The same hues the month calendar gives these statuses, ranked over the day
  // rather than the month — a status keeps one colour wherever it is drawn.
  const colours = colourFor(statusTotals(spans), t.scheme, t.accentSoft);

  const marks = Array.from({ length: hours + 1 }, (_, hour) => hour).filter(
    (hour) => hour % LABEL_EVERY === 0
  );

  // The ends are pinned rather than centred on their tick: half of "00" hangs
  // off the left edge of the card otherwise, and half of "24" off the right.
  const markStyle = (hour: number) =>
    hour === 0
      ? { left: 0 }
      : hour === hours
        ? { right: 0 }
        : { left: `${pct(hour * 60)}%`, transform: "translateX(-50%)" };

  return (
    <div className="select-none">
      <div className="relative h-3">
        {marks.map((hour) => (
          <span
            key={hour}
            className={`absolute top-0 text-[0.55rem] leading-none tabular-nums ${
              hour % 6 === 0 ? t.muted : t.faint
            }`}
            style={markStyle(hour)}
          >
            {String(hour).padStart(2, "0")}
          </span>
        ))}
      </div>

      <div
        className="relative h-8 w-full overflow-hidden rounded-lg"
        style={{ backgroundColor: t.track }}
      >
        {/* Hairlines under the numbered hours, so a block can be read back to a
            time without hovering it. Inside the rail rather than a grid drawn
            across the card: they belong to the day, not to the page. */}
        {marks.slice(1, -1).map((hour) => (
          <span
            key={hour}
            aria-hidden
            className="absolute inset-y-0 w-px"
            style={{
              left: `${pct(hour * 60)}%`,
              backgroundColor: t.track,
              opacity: 0.6,
            }}
          />
        ))}

        {spans.map((span) => {
          const share = (span.to - span.from) / length;
          return (
            <div
              key={span.id}
              title={`${span.status} — ${timeLabel(span.from)}–${timeLabel(span.to)} · ${
                formatMinutes(Math.round(span.to - span.from)) || "<1m"
              }`}
              className="absolute inset-y-0 flex items-center overflow-hidden px-1.5"
              style={{
                left: `${pct(span.from)}%`,
                // A one-minute status is still a thing that happened, and at
                // this scale one minute is a fifteenth of a pixel.
                width: `max(${pct(span.to - span.from)}%, 3px)`,
                backgroundColor: colours.get(colourKey(span.status, colours)),
              }}
            >
              {share >= NAMED_SHARE && (
                <span className="truncate text-[0.62rem] leading-none text-white">
                  {span.status}
                </span>
              )}
            </div>
          );
        })}

        {/* Where the day has got to. */}
        {minutesNow >= 0 && minutesNow <= length && (
          <div
            aria-hidden
            className="absolute inset-y-0 w-[2px]"
            style={{
              left: `${pct(minutesNow)}%`,
              backgroundColor: t.accent,
            }}
          />
        )}
      </div>

      {/* Under the block it names, at its own start, and never wider than it —
          so the labels cannot collide however crowded the morning was. */}
      <div className="relative mt-1 h-3">
        {spans
          .filter((span) => (span.to - span.from) / length >= NAMED_SHARE)
          .map((span) => (
            <span
              key={span.id}
              className={`absolute top-0 truncate text-[0.58rem] leading-none tabular-nums ${t.faint}`}
              style={{
                left: `${pct(span.from)}%`,
                maxWidth: `${pct(span.to - span.from)}%`,
              }}
            >
              {timeLabel(span.from)}
            </span>
          ))}
        {spans.length === 0 && (
          <span className={`text-[0.62rem] ${t.faint}`}>
            No status set today
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Where the day went. Live rather than held back until midnight: gated on the
 * day being over it would be invisible for the twenty-three hours you might act
 * on it, and at the end of the day it reads as the summary either way.
 *
 * Every status, not a top few — a status you cannot see is one you cannot
 * account for. In columns, because the block is wide and a long day would
 * otherwise push the cards below it off the screen.
 */
function DayTally({ totals, t }: { totals: StatusTotal[]; t: Theme }) {
  if (totals.length === 0) {
    return (
      <p className={`m-0 text-[0.62rem] ${t.faint}`}>Nothing logged today</p>
    );
  }

  const longest = totals[0].minutes;

  return (
    <ul className="m-0 grid list-none grid-cols-1 gap-x-3 gap-y-[3px] p-0 sm:grid-cols-2 lg:grid-cols-3">
      {totals.map((total) => (
        <li
          key={total.status}
          className="relative flex items-center justify-between gap-3 rounded-md px-3 py-1.5"
        >
          {/* The bar sits behind the row rather than beside it: at this size a
              separate track would cost a line each and say the same thing. */}
          <span
            aria-hidden
            className="absolute inset-y-0 left-0 rounded-md"
            style={{
              width: `${(total.minutes / longest) * 100}%`,
              backgroundColor: t.accent,
              opacity: 0.13,
            }}
          />
          <span className={`relative truncate text-[0.68rem] ${t.body}`}>
            {total.status}
          </span>
          <span
            className={`relative shrink-0 text-[0.68rem] tabular-nums ${t.muted}`}
          >
            {formatMinutes(total.minutes) || "<1m"}
          </span>
        </li>
      ))}
    </ul>
  );
}

function ViewTab({
  t,
  on,
  onClick,
  children,
}: {
  t: Theme;
  on: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`cursor-pointer rounded-md border-none bg-transparent px-1 py-0.5 text-[0.6rem] transition-colors ${
        on ? `font-medium ${t.body}` : `${t.faint} hover:${t.muted}`
      }`}
    >
      {children}
    </button>
  );
}

function Chip({
  t,
  active,
  onClick,
  children,
}: {
  t: Theme;
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`cursor-pointer rounded-lg border-none px-2 py-1 text-[0.68rem] transition-colors ${
        active ? `font-medium ${t.toggleOn}` : `${t.toggleOff} ${t.rowHover}`
      }`}
    >
      {children}
    </button>
  );
}

/** Four squares on a grid — the calendar the button opens, in miniature. */
const CalendarIcon = () => (
  <svg
    viewBox="0 0 16 16"
    className="h-3.5 w-3.5"
    fill="currentColor"
    aria-hidden="true"
  >
    <rect x="1.5" y="1.5" width="5.5" height="5.5" rx="1.4" />
    <rect x="9" y="1.5" width="5.5" height="5.5" rx="1.4" opacity="0.45" />
    <rect x="1.5" y="9" width="5.5" height="5.5" rx="1.4" opacity="0.45" />
    <rect x="9" y="9" width="5.5" height="5.5" rx="1.4" />
  </svg>
);

const timeLabel = (minutes: number): string =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(
    Math.floor(minutes % 60)
  ).padStart(2, "0")}`;
