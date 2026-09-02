/**
 * One day of training, as a four-millimetre square.
 *
 * Which routine a day held is an identity, not a quantity, so the kinds are
 * told apart by shape rather than tone — filled for strength, ringed for
 * simple, a dot for the plank, a bar for the rope. Shape survives any colour
 * vision, and it survives the palette too: every treatment in this app has
 * exactly one accent, so four invented hues would be four hues that belong to
 * nothing.
 *
 * It lives in its own file rather than on the training page because the
 * dashboard draws the current week with the same marks. Two copies of a visual
 * language is two copies that drift — and reaching into a page component for
 * twenty lines of it would pull the whole training screen into the dashboard's
 * bundle.
 */
import type { CSSProperties, ReactNode } from "react";
import type { Mark } from "../training";
import type { Theme } from "../types";

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

interface DayMarkProps {
  t: Theme;
  mark: Mark;
  /** What the day says on hover — see `dayTitle`. A legend swatch has none. */
  title?: string;
  /** Outlined, so a week always says where in it you are. */
  today?: boolean;
  /** Faded: a day that has not happened is not a day you skipped. */
  future?: boolean;
}

export default function DayMark({
  t,
  mark,
  title,
  today,
  future,
}: DayMarkProps) {
  return (
    <span
      title={title}
      className="grid h-4 w-4 shrink-0 place-items-center rounded-[3px]"
      style={{
        ...markStyle(t, mark),
        opacity: future ? 0.35 : 1,
        outline: today ? `1.5px solid ${t.accentSoft}` : "",
        outlineOffset: "1px",
      }}
    >
      {markInner(t, mark)}
    </span>
  );
}
