/**
 * The readout around the body map: what the system has to say, which way the
 * body is being run, and the numbers behind both.
 *
 * What you are doing right now is no longer here — the day's status moved to the
 * top of the dashboard, where it has the width to be drawn as a day rather than
 * as a column. This panel is the body: the briefing, the figure, and the two
 * readings the figure stands for.
 *
 * Steps are not a copy of the steps area — this reads and writes the very cache
 * entry `/steps` and the quick panel use, so a number typed here is the same
 * number there, saved to the same row. The same goes for the notes and the
 * roadmap: they are read on the dashboard's keys, so the briefing costs no
 * extra request once either screen has been open.
 */
import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { getProfile, getSteps } from "../api";
import { activityRows, type ActivityRow } from "../activity";
import { STEPS } from "../areas";
import HumanFigure from "./HumanFigure";
import { observeAll, type Note as BriefNote } from "../briefing";
import { lastNWeeks } from "../dashboardStats";
import { fmt, toKey } from "../stepsUtil";
import { labelClass } from "../theme";
import { PROFILE_KEY, STEPS_KEY, useCommit, useSignals } from "../useTracking";
import { MODE_COPY, kg } from "../jarvis";
import { PROFILE_MODES, type ProfileMode, type Theme } from "../types";

/**
 * Calendar weeks the activity band covers, Monday to Sunday — not eight blocks
 * of seven counted back from today, which would put a different weekday in the
 * first column every day you opened it. Anchored to real weeks, every column is
 * one weekday all the way down, so skipping weekends shows up as a stripe.
 */
const BAND_WEEKS = 8;

export default function Jarvis({ t, now }: { t: Theme; now: Date }) {
  const todayKey = toKey(now);
  // Closed to begin with. The band reports eight weeks, which is the question
  // you go looking for rather than the one you open the panel on — and the
  // height it costs is height the figure uses.
  const [bandOpen, setBandOpen] = useState(false);

  const { data: profile } = useQuery({
    queryKey: PROFILE_KEY,
    queryFn: getProfile,
  });
  // Same key as the steps area, so the cache is the sync: whichever screen
  // writes, every mounted screen repaints.
  const { data: steps } = useQuery({
    queryKey: STEPS_KEY,
    queryFn: () => getSteps(STEPS.metricId),
  });

  // Every area gathered once, and every way of writing back — shared with the
  // chat, which answers off the same numbers this panel draws.
  const signals = useSignals(now);
  const commit = useCommit(now);

  const mode: ProfileMode = profile?.mode ?? "maintain";
  const weights = profile?.weights ?? {};
  const weightGoal = profile?.weightGoal ?? 0;

  const goal = typeof steps?.goal === "number" ? steps.goal : 0;
  const stepsToday = steps?.entries?.[todayKey] ?? 0;
  const weightToday = weights[todayKey] ?? 0;

  // The last reading on or before today, so the panel keeps showing a weight on
  // a day you have not stepped on the scale yet.
  const latestWeight = lastReading(weights, todayKey);
  const gap =
    latestWeight > 0 && weightGoal > 0 ? latestWeight - weightGoal : 0;

  // Two readings of the same gathered signals: one in words, one as a matrix.
  const briefing = useMemo(() => observeAll(signals), [signals]);
  const bandDays = useMemo(() => lastNWeeks(BAND_WEEKS, now), [now]);
  const rows = useMemo(
    () => activityRows(signals, bandDays),
    [signals, bandDays]
  );

  // One sentence rather than a stack of grey lines each carrying a fragment of
  // it: the target sits next to the label above, so this only has to say how far
  // off it is.
  const gapLabel =
    latestWeight <= 0
      ? "Tap the number to log today's weight"
      : weightGoal <= 0
        ? "Set a target to read the gap"
        : gap > 0.05
          ? `${kg(gap)} kg above target`
          : gap < -0.05
            ? `${kg(-gap)} kg below target`
            : "At target";

  return (
    // One panel, edge to edge, divided by hairlines rather than broken into
    // cards floating in gaps: words down the left, the figure and its numbers
    // through the rest, and the fortnight along the base. No border or corner
    // radius — at full bleed there is nothing for the panel to be an island in,
    // so the only rules left are the ones that divide it.
    <section
      className={`absolute inset-0 flex flex-col overflow-hidden ${t.card}`}
    >
      <div className="flex min-h-0 flex-1">
        {/* Words on this side, and only words: the briefing reports everything
            it found, so it is given the whole column to do it in. */}
        <Column t={t}>
          <Briefing notes={briefing} t={t} />
        </Column>

        {/* The rest of the panel holds two things: the figure, and the readings
            that describe the body it stands for.

            The figure is sized off the height it is given, not the width, so
            handing a fixed strip to the readings beside it costs it nothing —
            it stands exactly as tall as it did. */}
        <div className={`flex min-w-0 flex-1 border-l ${t.rule}`}>
          <div className="flex min-w-0 flex-1 items-end justify-center px-4 pt-5">
            <HumanFigure />
          </div>

          {/* Widest frame first: the regime the body is being run in, then the
              number it is judged by, then today's effort against it. */}
          <div className="flex w-[212px] shrink-0 flex-col overflow-y-auto py-6 pr-8">
            <ModeBlock t={t} mode={mode} onMode={commit.mode} />

            <Divider t={t} />

            {/* Under the mode that decides which way it is supposed to go. */}
            <Reading
              t={t}
              label="Weight"
              aside={
                <>
                  target{" "}
                  <EditableNumber
                    value={weightGoal}
                    display={weightGoal > 0 ? kg(weightGoal) : "—"}
                    ariaLabel="Target weight in kilograms"
                    decimal
                    small
                    onCommit={commit.target}
                  />
                </>
              }
            >
              <EditableNumber
                value={weightToday || latestWeight}
                display={latestWeight > 0 ? kg(latestWeight) : "—"}
                ariaLabel="Weight today in kilograms"
                decimal
                onCommit={commit.weight}
              />
              <span className={`text-[0.72rem] ${t.muted}`}>kg</span>
            </Reading>
            <p className={`m-0 mt-2 text-[0.72rem] ${t.body}`}>{gapLabel}</p>

            {/* At the foot of the column. The mode and the weight are the frame
                the day is judged in and sit at the top with it; the steps are
                the day's own running total, and a total belongs at the end of
                what it totals rather than wedged under two settings. */}
            <div className="mt-auto shrink-0">
              <Divider t={t} />

              <Reading
                t={t}
                label="Steps today"
                aside={goal > 0 ? `goal ${fmt(goal)}` : undefined}
              >
                <EditableNumber
                  value={stepsToday}
                  display={fmt(stepsToday)}
                  ariaLabel="Steps logged today"
                  onCommit={commit.steps}
                />
              </Reading>
              <Meter
                ratio={goal > 0 ? Math.min(stepsToday / goal, 1) : 0}
                t={t}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Padded to the same edge as the columns above, so the band's ends line
          up with the text either side of the figure rather than reaching past
          it. */}
      <div
        className={`relative shrink-0 border-t ${t.rule} ${
          bandOpen ? "px-8 py-5" : "h-3"
        }`}
      >
        {/* On the rule itself, halfway along it — the handle of the thing it
            opens rather than another control in a corner. The panel's own
            colour behind it is what lets the line pass under without showing
            through. */}
        <button
          type="button"
          onClick={() => setBandOpen((open) => !open)}
          aria-expanded={bandOpen}
          aria-label={bandOpen ? "Hide activity" : "Show activity"}
          title={bandOpen ? "Hide activity" : "Show activity"}
          className={`absolute -top-3 left-1/2 z-10 flex h-6 w-12 -translate-x-1/2 cursor-pointer items-center justify-center rounded-full border-none transition-colors ${t.card} ${t.iconBtn}`}
        >
          <Chevron up={!bandOpen} />
        </button>

        {bandOpen && (
          <ActivityBand rows={rows} days={bandDays} now={now} t={t} />
        )}
      </div>
    </section>
  );
}

/**
 * The column the briefing sits in. Proportional rather than fixed, so the figure
 * keeps the middle on a wide screen, with bounds either side: narrower than the
 * minimum and the notes shear into slivers, wider than the maximum and a column
 * of short paragraphs starts to look like a page of its own.
 *
 * The outer edge is padded wider than the inner one. A hairline divider is a
 * neighbour and needs only a gutter; the edge of the screen is an edge, and
 * text set the same distance from it reads as crowded against the glass — which
 * is what going full-bleed cost, since the old card carried its own margin on
 * top of its padding.
 */
function Column({ t, children }: { t: Theme; children: ReactNode }) {
  return (
    // Scrolling belongs to whatever is inside, not to the column: the briefing
    // keeps its heading in place and scrolls only its notes.
    <aside
      className={`flex w-[21%] min-w-[240px] max-w-[330px] shrink-0 flex-col overflow-hidden py-6 pl-8 pr-6 ${t.page}`}
    >
      {children}
    </aside>
  );
}

/** The most recent logged value at or before `upTo`; 0 when there is none. */
function lastReading(entries: Record<string, number>, upTo: string): number {
  const key = Object.keys(entries)
    .filter((date) => date <= upTo && entries[date] > 0)
    .sort()
    .pop();
  return key ? entries[key] : 0;
}

const Divider = ({ t }: { t: Theme }) => (
  <div className={`my-3 border-t ${t.rule}`} />
);

/**
 * What the system has to say. Every line carries the area it was read from, so
 * a claim about you can be checked against the screen that holds the numbers
 * rather than taken on trust — the same bargain `encouragement.ts` makes.
 */
function Briefing({ notes, t }: { notes: BriefNote[]; t: Theme }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* The acronym and what it stands for sit together, once, on the column
          that does the talking. Pinned, so scrolling the notes never scrolls
          away whose voice they are. */}
      <div className="shrink-0">
        <p className="m-0 text-[0.72rem] uppercase tracking-[0.34em]">
          J.A.R.V.I.S.
        </p>
        <p
          className={`m-0 mt-1.5 text-[0.52rem] uppercase tracking-[0.16em] ${t.faint}`}
        >
          Just A Rather Very Intelligent System
        </p>
        <div className={`mt-3 border-t ${t.rule}`} />
      </div>

      {notes.length === 0 ? (
        <p className={`m-0 mt-3 text-[0.78rem] leading-snug ${t.muted}`}>
          Поки нема чого зводити. Запиши кроки, вагу чи задачу — і я почну
          бачити зв’язки.
        </p>
      ) : (
        <ul className="m-0 min-h-0 flex-1 list-none overflow-y-auto p-0 pt-3">
          {notes.map((note) => (
            <li key={note.ua} className="mt-3 first:mt-0">
              {/* The rule down the side groups a claim with its source and
                  makes three notes read as three, not as six loose lines. */}
              <div
                className="border-l pl-2.5"
                style={{ borderColor: t.accentSoft }}
              >
                <p className="m-0 text-[0.78rem] leading-snug">{note.ua}</p>
                <p
                  className={`m-0 mt-1 text-[0.62rem] ${t.faint}`}
                  title={note.en}
                >
                  {note.source}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * A big number under its label, with the figure it is measured against on the
 * same line as the label rather than in a note below it — so the readout is two
 * lines instead of four, and the number stays the only large thing.
 */
function Reading({
  t,
  label,
  aside,
  children,
}: {
  t: Theme;
  label: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <div className="flex items-baseline justify-between gap-3">
        <p className={labelClass(t)}>{label}</p>
        {aside !== undefined && (
          <p
            className={`m-0 flex items-baseline gap-1 text-[0.65rem] ${t.muted}`}
          >
            {aside}
          </p>
        )}
      </div>
      <div className="mt-1.5 flex items-baseline gap-2">{children}</div>
    </>
  );
}

function Meter({ ratio, t }: { ratio: number; t: Theme }) {
  return (
    <div
      className="mt-2 h-1 w-full overflow-hidden rounded-full"
      style={{ backgroundColor: t.track }}
    >
      <div
        className="h-full rounded-full transition-[width] duration-700 ease-out"
        style={{ width: `${ratio * 100}%`, backgroundColor: t.accent }}
      />
    </div>
  );
}

interface EditableNumberProps {
  value: number;
  /** What is shown when not editing — already formatted, and "—" when unset. */
  display: string;
  ariaLabel: string;
  decimal?: boolean;
  small?: boolean;
  onCommit: (value: number) => void;
}

/**
 * A number that is its own input: click it, type, Enter. Both states share one
 * class list and one line height, so switching between them doesn't shift the
 * panel under the pointer. It carries no colour of its own — it inherits the
 * ink of whatever readout it sits in.
 */
function EditableNumber({
  value,
  display,
  ariaLabel,
  decimal = false,
  small = false,
  onCommit,
}: EditableNumberProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const size = small ? "text-[0.72rem]" : "text-[1.45rem]";
  // The height is stated rather than left to each element's own idea of it. A
  // button is as tall as its line box; an input is as tall as the font's own
  // ascent and descent, which is taller — so clicking the number to edit it
  // grew the row by a few pixels and nudged everything under it down. One box
  // of exactly one line, for both.
  const shared = `m-0 h-[1em] w-auto border-0 bg-transparent p-0 font-sans ${size} font-extralight leading-none tracking-[-0.02em] tabular-nums text-current outline-none`;

  const start = () => {
    setDraft(value > 0 ? String(value) : "");
    setEditing(true);
  };

  const commit = () => {
    setEditing(false);
    if (draft === "") return onCommit(0);
    const next = Number(draft);
    if (!Number.isFinite(next) || next === value) return;
    onCommit(next);
  };

  if (!editing) {
    return (
      <button
        type="button"
        onClick={start}
        title="Click to edit"
        className={`${shared} cursor-text text-left transition-opacity hover:opacity-60`}
      >
        {display}
      </button>
    );
  }

  return (
    <input
      autoFocus
      type="text"
      inputMode="decimal"
      value={draft}
      aria-label={ariaLabel}
      onChange={(event) =>
        setDraft(
          event.target.value
            .replace(decimal ? /[^\d.]/g : /\D/g, "")
            .slice(0, 7)
        )
      }
      onKeyDown={(event) => {
        if (event.key === "Enter") commit();
        if (event.key === "Escape") setEditing(false);
      }}
      onBlur={commit}
      style={{ width: `${Math.max(draft.length, 1) + 0.6}ch` }}
      className={`${shared} select-text caret-current`}
    />
  );
}

/** Points at what the click will do: down to put the band away, up to bring
 *  it back. */
const Chevron = ({ up }: { up: boolean }) => (
  <svg
    viewBox="0 0 24 24"
    className="h-3.5 w-3.5"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d={up ? "M6 15l6-6 6 6" : "M6 9l6 6 6-6"} />
  </svg>
);

function ModeBlock({
  t,
  mode,
  onMode,
}: {
  t: Theme;
  mode: ProfileMode;
  onMode: (mode: ProfileMode) => void;
}) {
  return (
    <>
      <div className="flex items-baseline justify-between gap-3">
        <p className={labelClass(t)}>Mode</p>
        <p className={`m-0 text-[0.65rem] ${t.muted}`}>
          {MODE_COPY[mode].hint}
        </p>
      </div>
      <div className="mt-1.5 flex gap-1">
        {PROFILE_MODES.map((option) => (
          <Chip
            key={option}
            t={t}
            active={option === mode}
            grow
            onClick={() => onMode(option)}
          >
            {MODE_COPY[option].label}
          </Chip>
        ))}
      </div>
    </>
  );
}

function Chip({
  t,
  active,
  grow = false,
  onClick,
  children,
}: {
  t: Theme;
  active: boolean;
  grow?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`cursor-pointer rounded-lg border-none px-2 py-1 text-[0.68rem] transition-colors ${
        grow ? "flex-1" : ""
      } ${active ? `font-medium ${t.toggleOn}` : `${t.toggleOff} ${t.rowHover}`}`}
    >
      {children}
    </button>
  );
}

/**
 * The activity band: areas down the side, days across, one cell each.
 *
 * A single hue at rising strength, because this encodes magnitude — one colour
 * per row would be encoding identity, which the labels already do, and a second
 * meaning on the same ink is how a chart starts lying. An unlogged day is the
 * track colour rather than the palest step of the ramp, so "nothing" never
 * reads as "a little".
 */
function ActivityBand({
  rows,
  days,
  now,
  t,
}: {
  rows: ActivityRow[];
  days: Date[];
  now: Date;
  t: Theme;
}) {
  const keys = days.map(toKey);
  const todayKey = toKey(now);
  // The run ends on the current week's Sunday, so its last days may not have
  // happened. They hold their column open and show nothing — a day still to
  // come is not a day you left blank.
  const future = days.map((day) => toKey(day) > todayKey);

  return (
    <>
      <div className="flex items-baseline justify-between gap-3">
        <p className={labelClass(t)}>Activity</p>
        <p className={`m-0 text-[0.65rem] ${t.muted}`}>
          {BAND_WEEKS} weeks · Mon–Sun
        </p>
      </div>

      <div className="mt-3 flex flex-col gap-[3px]">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center gap-3">
            <span
              className={`w-[4rem] shrink-0 truncate text-[0.65rem] ${t.body}`}
            >
              {row.label}
            </span>
            {/* A wider gap between blocks than within one, so the eye reads
                weeks without a single rule being drawn. */}
            <div className="flex min-w-0 flex-1 gap-[7px]">
              {chunk(row.values, 7).map((week, w) => (
                <div key={w} className="flex min-w-0 flex-1 gap-[2px]">
                  {week.map((value, d) => {
                    const i = w * 7 + d;
                    const lit = value > 0;
                    const strength = lit ? Math.min(value / row.scale, 1) : 0;
                    return (
                      <span
                        key={keys[i]}
                        // Native titles are what the rest of this app uses for
                        // a per-mark tooltip, so the band behaves like its
                        // neighbours.
                        title={
                          future[i]
                            ? `${keys[i]} · still to come`
                            : `${keys[i]} · ${row.label} — ${
                                lit ? row.describe(value) : "nothing logged"
                              }`
                        }
                        className="h-[11px] min-w-0 flex-1 rounded-[2px]"
                        style={{
                          backgroundColor: lit ? t.accent : t.track,
                          // Floored well clear of the empty cell: the faintest
                          // real reading still has to look like a reading.
                          opacity: lit ? 0.3 + 0.7 * strength : 1,
                          visibility: future[i] ? "hidden" : undefined,
                        }}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div
        className={`mt-3 flex items-center gap-1.5 text-[0.6rem] ${t.faint}`}
      >
        <span>none</span>
        <span
          className="h-[7px] w-3 rounded-[2px]"
          style={{ backgroundColor: t.track }}
        />
        {[0.3, 0.55, 0.8, 1].map((step) => (
          <span
            key={step}
            className="h-[7px] w-3 rounded-[2px]"
            style={{ backgroundColor: t.accent, opacity: step }}
          />
        ))}
        <span>full day</span>
      </div>
    </>
  );
}

/** Splits a series into fixed-size blocks, oldest first. */
const chunk = <T,>(values: T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(values.length / size) }, (_, i) =>
    values.slice(i * size, i * size + size)
  );
