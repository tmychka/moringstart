/**
 * A month of days as squares, and one tally underneath saying where the time
 * went.
 *
 * Each square is that day's statuses stacked in proportion — the day is the
 * height of the column, so a lightly logged day is a short stack and a full one
 * reaches the top. Colour identifies the status and nothing else: it is fixed
 * for the whole month by the month's own ranking, so a status keeps its colour
 * from square to square, and every colour is named in the tally below and in
 * each segment's tooltip, never left to be read as colour alone.
 */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { getStatusHistory } from "../api";
import { addDays } from "../dashboardStats";
import { toKey } from "../stepsUtil";
import { labelClass, numeralClass } from "../theme";
import { formatMinutes } from "../todos";
import {
  colourFor,
  colourKey,
  endOfMonth,
  hours,
  legendOf,
  monthReport,
  sameMonth,
  shiftMonth,
  startOfMonth,
  type DayCell,
} from "../statusMonth";
import type { Theme } from "../types";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
/** Monday-first index for a JS day number, where Sunday is 0. */
const weekdayIndex = (date: Date) => (date.getDay() + 6) % 7;

interface StatusCalendarProps {
  t: Theme;
  now: Date;
  onClose: () => void;
}

export default function StatusCalendar({
  t,
  now,
  onClose,
}: StatusCalendarProps) {
  const closeRef = useRef<HTMLButtonElement>(null);

  // Escape closes it, and the close button takes focus on open so the keyboard
  // has somewhere to be inside the dialog rather than back on the page behind.
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Anchored to the first of a month; the arrows move it a month at a time and
  // stop at the current one, since there is nothing to show ahead of today.
  const [anchor, setAnchor] = useState(() => startOfMonth(now));
  const atCurrentMonth = sameMonth(anchor, now);

  // A day either side of the month: rows are stored in UTC and bucketed here by
  // local midnights, so an entry belonging to the 1st or the last can sit just
  // outside a range cut on UTC dates.
  const from = toKey(addDays(startOfMonth(anchor), -1));
  const to = toKey(addDays(endOfMonth(anchor), 1));

  const { data: log, isPending } = useQuery({
    queryKey: ["status-history", from, to],
    queryFn: () => getStatusHistory(from, to),
  });

  const report = monthReport(log ?? [], anchor, now);
  const legend = legendOf(report.totals);
  const colours = colourFor(report.totals, t.scheme, t.accentSoft);

  // Blanks before the first day, so every column is one weekday all the way
  // down and a weekend habit shows up as a stripe.
  const lead = weekdayIndex(report.days[0].date);

  // Rendered on the body rather than in place. `position: fixed` is measured
  // against the nearest ancestor carrying a transform or a filter, and this
  // dialog has two of them above it — the carousel slides its track with
  // `translate3d`, and the panel's own card is `backdrop-blur`. In place, the
  // dialog would be positioned against the panel and then clipped by its
  // `overflow-hidden`; a portal is what gets it back to the viewport.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 cursor-default border-none bg-black/40 p-0"
      />

      <section
        role="dialog"
        aria-modal="true"
        aria-label={`Status calendar, ${report.label}`}
        className={`relative flex max-h-full w-full max-w-[860px] flex-col overflow-hidden rounded-3xl border ${t.popover}`}
      >
        <header
          className={`flex shrink-0 items-center justify-between gap-4 border-b px-7 py-5 ${t.rule}`}
        >
          <div className="min-w-0">
            <p className={labelClass(t)}>Where the time went</p>
            <p className={`m-0 mt-1.5 text-[0.95rem] ${numeralClass}`}>
              {report.label}
            </p>
            <p className={`m-0 mt-1 text-[0.75rem] ${t.muted}`}>
              {report.tracked > 0
                ? `${hours(report.tracked)} logged across ${report.loggedDays} of ${report.elapsedDays} days`
                : "Nothing logged this month"}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <MonthStep
              t={t}
              label="Previous month"
              glyph="‹"
              onClick={() => setAnchor((month) => shiftMonth(month, -1))}
            />
            <MonthStep
              t={t}
              label="Next month"
              glyph="›"
              // Nothing ahead of today has happened, so this stops at the
              // current month rather than walking into empty grids.
              disabled={atCurrentMonth}
              onClick={() => setAnchor((month) => shiftMonth(month, 1))}
            />
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              className={`ml-2 cursor-pointer rounded-lg border-none bg-transparent px-2 py-1 text-[0.72rem] transition-colors ${t.iconBtn}`}
            >
              Close
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-7 py-6">
          {isPending ? (
            <p className={`m-0 text-[0.78rem] ${t.muted}`}>Reading the log…</p>
          ) : (
            <>
              {/* Capped rather than filling the dialog: seven squares across
                  860px would be 113px each, and five rows of that leaves no
                  room for the tally the calendar exists to lead up to. */}
              <div
                className="mx-auto grid max-w-[600px] gap-1.5"
                style={{ gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}
              >
                {WEEKDAYS.map((day) => (
                  <p
                    key={day}
                    className={`m-0 pb-1 text-center text-[0.6rem] uppercase tracking-[0.14em] ${t.faint}`}
                  >
                    {day}
                  </p>
                ))}

                {Array.from({ length: lead }, (_, i) => (
                  <div key={`lead-${i}`} aria-hidden />
                ))}

                {report.days.map((day) => (
                  <DaySquare key={day.key} day={day} colours={colours} t={t} />
                ))}
              </div>

              <div className={`mt-7 border-t pt-5 ${t.rule}`}>
                <p className={labelClass(t)}>Total · {report.label}</p>

                {legend.length === 0 ? (
                  <p className={`m-0 mt-3 text-[0.78rem] ${t.muted}`}>
                    Set a status through the day and this fills in on its own.
                  </p>
                ) : (
                  <ul className="m-0 mt-3 list-none p-0">
                    {legend.map((total) => (
                      <li
                        key={total.status}
                        className="mt-2 flex items-center gap-3 first:mt-0"
                      >
                        <span
                          aria-hidden
                          className="h-2.5 w-2.5 shrink-0 rounded-sm"
                          style={{
                            backgroundColor: colours.get(
                              colourKey(total.status, colours)
                            ),
                          }}
                        />
                        <span
                          className={`w-[7.5rem] shrink-0 truncate text-[0.8rem] ${t.body}`}
                        >
                          {total.status}
                        </span>
                        <span
                          className="h-2 min-w-0 flex-1 rounded-full"
                          style={{ backgroundColor: t.track }}
                        >
                          <span
                            className="block h-full rounded-full"
                            style={{
                              width: `${(total.minutes / legend[0].minutes) * 100}%`,
                              backgroundColor: colours.get(
                                colourKey(total.status, colours)
                              ),
                            }}
                          />
                        </span>
                        <span
                          className={`w-[4.5rem] shrink-0 text-right text-[0.8rem] ${numeralClass} ${t.body}`}
                        >
                          {formatMinutes(total.minutes)}
                        </span>
                        <span
                          className={`w-[3rem] shrink-0 text-right text-[0.72rem] ${t.muted}`}
                        >
                          {Math.round((total.minutes / report.tracked) * 100)}%
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>
      </section>
    </div>,
    document.body
  );
}

function MonthStep({
  t,
  label,
  glyph,
  disabled = false,
  onClick,
}: {
  t: Theme;
  label: string;
  glyph: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={`flex h-7 w-7 items-center justify-center rounded-lg border-none bg-transparent text-[1rem] leading-none transition-colors ${
        disabled ? `cursor-default ${t.faint}` : `cursor-pointer ${t.iconBtn}`
      }`}
    >
      {glyph}
    </button>
  );
}

/**
 * One day. The stack grows from the bottom and its height is the share of a
 * waking day accounted for; inside it, each segment is that status's share of
 * what was logged.
 *
 * Measured against a fixed day rather than against the busiest day in the
 * window: with a floating reference every square shifts the moment one long day
 * appears, and today — half an hour old — is squashed to nothing beside a day
 * that ran to midnight. A day you barely logged should look barely logged, not
 * blank, hence the floor.
 */
const WAKING_MINUTES = 16 * 60;
const MIN_VISIBLE_FILL = 0.08;

function DaySquare({
  day,
  colours,
  t,
}: {
  day: DayCell;
  colours: Map<string, string>;
  t: Theme;
}) {
  const share = Math.min(day.tracked / WAKING_MINUTES, 1);
  const fill = day.tracked > 0 ? Math.max(share, MIN_VISIBLE_FILL) : 0;

  return (
    // A day still to come is an outline rather than an empty box: it has no
    // reading because it has not happened, which is not the same as a day you
    // failed to log.
    <div
      className={`relative flex aspect-square flex-col justify-end overflow-hidden rounded-lg ${
        day.future ? `border border-dashed ${t.rule}` : ""
      }`}
      style={day.future ? undefined : { backgroundColor: t.track }}
      title={
        day.future
          ? `${day.key} — still to come`
          : day.tracked === 0
            ? `${day.key} — nothing logged`
            : `${day.key} — ${day.totals
                .map(
                  (total) => `${total.status} ${formatMinutes(total.minutes)}`
                )
                .join(", ")}`
      }
    >
      <div
        className="flex w-full flex-col-reverse"
        style={{ height: `${fill * 100}%` }}
      >
        {day.totals.map((total) => (
          <span
            key={total.status}
            className="w-full"
            style={{
              height: `${(total.minutes / day.tracked) * 100}%`,
              backgroundColor: colours.get(colourKey(total.status, colours)),
            }}
          />
        ))}
      </div>

      <span
        className={`pointer-events-none absolute left-1.5 top-1 text-[0.6rem] ${numeralClass} ${
          day.tracked > 0 ? t.body : t.faint
        }`}
      >
        {day.date.getDate()}
      </span>
    </div>
  );
}
