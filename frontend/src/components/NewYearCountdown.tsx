/**
 * The rest of the year, one square a day.
 *
 * A square stands for a day not yet lived, today included — this morning's is
 * still on the card, and tomorrow the grid opens one short. The number above
 * says the same thing for the mornings a grid is too much to read.
 *
 * Months alternate in tone so the squares can be counted in chunks rather than
 * one by one, and today's is the accent: it is the one about to go.
 */
import { useMemo } from "react";
import { s } from "../plural";
import { cardClass, labelClass, numeralClass } from "../theme";
import type { Theme } from "../types";

const DAY_MS = 86400000;

const dateLabel = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

interface NewYearCountdownProps {
  t: Theme;
  /** The dashboard's clock, so this doesn't start a second timer of its own. */
  now: Date;
  className?: string;
}

export default function NewYearCountdown({
  t,
  now,
  className = "",
}: NewYearCountdownProps) {
  const year = now.getFullYear();
  // Local calendar dates, counted in UTC: a daylight-saving day is 23 or 25
  // hours long locally, and would otherwise round the count a day either side.
  const today = Date.UTC(year, now.getMonth(), now.getDate());
  const newYear = Date.UTC(year + 1, 0, 1);
  const left = Math.round((newYear - today) / DAY_MS);
  const length = Math.round((newYear - Date.UTC(year, 0, 1)) / DAY_MS);
  const share = Math.round((left / length) * 100);

  const squares = useMemo(
    () =>
      Array.from({ length: left }, (_, i) => {
        const day = new Date(today + i * DAY_MS);
        return {
          key: day.getTime(),
          title: dateLabel.format(day),
          odd: day.getUTCMonth() % 2 === 1,
        };
      }),
    [today, left]
  );

  return (
    <section className={`${cardClass(t)} ${className} flex flex-col`}>
      <div className="flex items-baseline justify-between gap-3">
        <p className={labelClass(t)}>New Year · {year + 1}</p>
        <p className={`m-0 text-[0.7rem] ${t.muted}`}>
          {share}% of {year} left
        </p>
      </div>

      <p
        className={`m-0 mt-2 flex items-baseline gap-2 text-[1.8rem] leading-none ${numeralClass}`}
      >
        {left}
        <span
          className={`text-[0.78rem] font-normal tracking-normal ${t.muted}`}
        >
          {s(left, "day")} to go
        </span>
      </p>

      <div
        role="img"
        aria-label={`${left} ${s(left, "day")} left until New Year`}
        className="mt-3 flex flex-wrap gap-[3px]"
      >
        {squares.map((square, i) => (
          <i
            key={square.key}
            title={square.title}
            className="block h-2.5 w-2.5 rounded-[2px]"
            style={{
              backgroundColor: i === 0 ? t.accent : t.track,
              opacity: i > 0 && square.odd ? 0.55 : 1,
            }}
          />
        ))}
      </div>
    </section>
  );
}
