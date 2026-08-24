/**
 * A month of status log, read as a calendar of days and one tally over all of
 * them: what you were doing, and where the time actually went.
 *
 * The per-day arithmetic is the same `spansForDay` the strip beside the picker
 * uses, so a day in the calendar and that day on the strip can never disagree.
 */
import {
  spansForDay,
  statusTotals,
  type StatusRow,
  type StatusTotal,
} from "./jarvis";
import { toKey } from "./stepsUtil";

/** The first of the month `date` falls in. */
export const startOfMonth = (date: Date): Date =>
  new Date(date.getFullYear(), date.getMonth(), 1);

/** The last day of that month — day 0 of the next one. 28, 29, 30 or 31. */
export const endOfMonth = (date: Date): Date =>
  new Date(date.getFullYear(), date.getMonth() + 1, 0);

/** The same month shifted by `by`, anchored to its first. */
export const shiftMonth = (date: Date, by: number): Date =>
  new Date(date.getFullYear(), date.getMonth() + by, 1);

export const sameMonth = (a: Date, b: Date): boolean =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();

export interface DayCell {
  key: string;
  date: Date;
  /** That day's statuses, longest first. */
  totals: StatusTotal[];
  /** Minutes the day has any status against, at all. */
  tracked: number;
  /** A day of this month that has not happened yet. */
  future: boolean;
}

export interface MonthReport {
  /** "August 2026". */
  label: string;
  /** Every day of the month, the 1st through the 28th, 29th, 30th or 31st. */
  days: DayCell[];
  /** Across the month, longest first. */
  totals: StatusTotal[];
  tracked: number;
  /** Days with anything logged. */
  loggedDays: number;
  /** Days of the month that have happened — the denominator worth quoting. */
  elapsedDays: number;
}

/**
 * One calendar month, from its 1st to its last day. A month rather than a
 * rolling window because that is the unit a month's worth of effort is actually
 * judged in — "August" is a thing you can compare to July, where "the last 30
 * days" is a thing that means something different every time you open it.
 *
 * `anchor` is any date inside the month wanted.
 */
export function monthReport(
  log: StatusRow[],
  anchor: Date,
  now: Date
): MonthReport {
  const first = startOfMonth(anchor);
  const length = endOfMonth(anchor).getDate();

  const cells: DayCell[] = Array.from({ length }, (_, i) => {
    const date = new Date(first.getFullYear(), first.getMonth(), i + 1);
    const totals = statusTotals(spansForDay(log, date, now));
    return {
      key: toKey(date),
      date,
      totals,
      tracked: totals.reduce((sum, total) => sum + total.minutes, 0),
      // Compared against the day's own midnight, so today counts as elapsed
      // from the moment it starts rather than only once it is over.
      future: date.getTime() > now.getTime(),
    };
  });

  // Summed from the per-day tallies rather than from the raw log, so the month
  // total is by construction the sum of the squares above it.
  const byStatus = new Map<string, number>();
  for (const cell of cells) {
    for (const total of cell.totals) {
      byStatus.set(
        total.status,
        (byStatus.get(total.status) ?? 0) + total.minutes
      );
    }
  }

  return {
    label: first.toLocaleDateString("en-GB", {
      month: "long",
      year: "numeric",
    }),
    days: cells,
    totals: [...byStatus]
      .map(([status, minutes]) => ({ status, minutes }))
      .sort((a, b) => b.minutes - a.minutes),
    tracked: cells.reduce((sum, cell) => sum + cell.tracked, 0),
    loggedDays: cells.filter((cell) => cell.tracked > 0).length,
    elapsedDays: cells.filter((cell) => !cell.future).length,
  };
}

// --- colour ------------------------------------------------------------------

/**
 * How many statuses get a hue of their own. The status field takes free text,
 * so the number of them is unbounded — and a palette that grows to fit would be
 * generating hues, which is how a chart stops being readable. The month's
 * longest few are named in colour and the tail is one neutral "Other", so the
 * legend never runs past what the eye can hold.
 */
export const NAMED_STATUSES = 7;

/** Reserved for everything past the seventh. Never one of the hues. */
export const OTHER = "Other";

/**
 * Two selected sets of the same seven hues, stepped for the ground each sits on
 * rather than one set flipped. Both pass the categorical checks — lightness
 * band, chroma floor, CVD separation and the normal-vision floor. On the light
 * ground three of them sit under 3:1 against the surface, which is why every
 * segment carries a name in the legend and a label in its tooltip: identity
 * here is never colour alone.
 */
const SERIES: Record<"light" | "dark", string[]> = {
  light: [
    "#2a78d6",
    "#eb6834",
    "#1baf7a",
    "#eda100",
    "#e87ba4",
    "#008300",
    "#4a3aa7",
  ],
  dark: [
    "#3987e5",
    "#d95926",
    "#199e70",
    "#c98500",
    "#d55181",
    "#008300",
    "#9085e9",
  ],
};

/**
 * Status → colour, fixed for the whole month. Assigned by the month's ranking
 * rather than by each day's, so a status keeps its colour from square to square
 * — colour follows the thing, never its position in today's list.
 */
export function colourFor(
  totals: StatusTotal[],
  scheme: "light" | "dark",
  neutral: string
): Map<string, string> {
  const hues = SERIES[scheme];
  const map = new Map<string, string>();
  totals.slice(0, NAMED_STATUSES).forEach((total, i) => {
    map.set(total.status, hues[i]);
  });
  map.set(OTHER, neutral);
  return map;
}

/** The tally as it is shown: the named few, then everything else summed. */
export function legendOf(totals: StatusTotal[]): StatusTotal[] {
  if (totals.length <= NAMED_STATUSES) return totals;
  const rest = totals.slice(NAMED_STATUSES);
  return [
    ...totals.slice(0, NAMED_STATUSES),
    {
      status: OTHER,
      minutes: rest.reduce((sum, total) => sum + total.minutes, 0),
    },
  ];
}

/** Which key a status draws its colour under — its own, or the shared tail. */
export const colourKey = (
  status: string,
  colours: Map<string, string>
): string => (colours.has(status) ? status : OTHER);

/** Hours to one decimal, dropping the decimal when it is a whole number. */
export const hours = (minutes: number): string => {
  const h = minutes / 60;
  if (h < 1) return `${Math.round(minutes)}m`;
  return `${h % 1 < 0.05 ? h.toFixed(0) : h.toFixed(1)}h`;
};
