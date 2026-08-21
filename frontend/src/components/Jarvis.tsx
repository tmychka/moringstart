/**
 * The readout around the body map: what the system has to say, what you are
 * doing, which way the body is being run, and the numbers behind all of it.
 *
 * Steps are not a copy of the steps area — this reads and writes the very cache
 * entry `/steps` and the quick panel use, so a number typed here is the same
 * number there, saved to the same row. The same goes for the notes and the
 * roadmap: they are read on the dashboard's keys, so the briefing costs no
 * extra request once either screen has been open.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { getProfile, getSteps } from "../api";
import { activityRows, type ActivityRow } from "../activity";
import { STEPS } from "../areas";
import HumanFigure from "./HumanFigure";
import StatusCalendar from "./StatusCalendar";
import { observeAll, type Note as BriefNote } from "../briefing";
import { lastNWeeks } from "../dashboardStats";
import { fmt, toKey } from "../stepsUtil";
import { labelClass } from "../theme";
import { PROFILE_KEY, STEPS_KEY, useCommit, useSignals } from "../useTracking";
import {
  MODE_COPY,
  STATUS_PRESETS,
  kg,
  lastEntryToday,
  minutesInDay,
  statusTotals,
  todaySpans,
  type Span,
  type StatusTotal,
} from "../jarvis";
import { colourFor, colourKey } from "../statusMonth";
import { formatMinutes } from "../todos";
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
  const [calendarOpen, setCalendarOpen] = useState(false);
  // Closed to begin with. The band reports eight weeks, which is the question
  // you go looking for rather than the one you open the panel on — and the
  // height it costs is height the figure and the hour ruler both use.
  const [bandOpen, setBandOpen] = useState(false);
  // Stable, so the dialog's key handler and its opening focus are not torn down
  // and re-run every time the clock ticks a new `now` through this component.
  const closeCalendar = useCallback(
    () => setCalendarOpen(false),
    [setCalendarOpen]
  );

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
    // cards floating in gaps: words down the left, the figure through the
    // middle, the numbers down the right, and the fortnight along the base.
    // No border or corner radius — at full bleed there is nothing for the panel
    // to be an island in, so the only rules left are the ones that divide it.
    <section
      className={`absolute inset-0 flex flex-col overflow-hidden ${t.card}`}
    >
      <div className="flex min-h-0 flex-1">
        {/* Words on this side, and only words: the briefing reports everything
            it found, so it is given the whole column to do it in. */}
        <Column t={t} side="left">
          <Briefing notes={briefing} t={t} />
        </Column>

        {/* The middle of the panel holds two things now: the figure, and the
            readings that describe the body it stands for. They share the room
            rather than being stacked in the right-hand column, which is what
            frees that column to be nothing but the day's status.

            The figure is sized off the height it is given, not the width, so
            handing a fixed strip to the readings beside it costs it nothing —
            it stands exactly as tall as it did. */}
        <div className={`flex min-w-0 flex-1 border-x ${t.rule}`}>
          <div className="flex min-w-0 flex-1 items-end justify-center px-4 pt-5">
            <HumanFigure />
          </div>

          {/* Widest frame first: the regime the body is being run in, then the
              number it is judged by, then today's effort against it. */}
          <div className="flex w-[212px] shrink-0 flex-col overflow-y-auto py-6 pr-6">
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

        {/* The whole column, for the one block that grows through the day. The
            hour ruler wants every pixel of height it can have — it is a day
            drawn end to end, and a taller column is simply more of the day
            visible at once. */}
        <Column t={t} side="right">
          <StatusBlock
            t={t}
            now={now}
            status={profile?.status ?? ""}
            log={profile?.log ?? []}
            onStatus={commit.status}
            onUndo={commit.undo}
            onOpenCalendar={() => setCalendarOpen(true)}
          />
        </Column>
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

      {calendarOpen && (
        <StatusCalendar t={t} now={now} onClose={closeCalendar} />
      )}
    </section>
  );
}

/**
 * One of the two side columns. Proportional rather than fixed, so the figure
 * keeps the middle on a wide screen, with bounds either side: narrower than the
 * minimum and the chips wrap into a mess, wider than the maximum and a column
 * of short readouts starts to look like a page of its own.
 *
 * The outer edge is padded wider than the inner one. A hairline divider is a
 * neighbour and needs only a gutter; the edge of the screen is an edge, and
 * text set the same distance from it reads as crowded against the glass — which
 * is what going full-bleed cost, since the old card carried its own margin on
 * top of its padding.
 */
function Column({
  t,
  side,
  children,
}: {
  t: Theme;
  side: "left" | "right";
  children: ReactNode;
}) {
  return (
    // Scrolling belongs to whatever is inside, not to the column: the briefing
    // keeps its heading in place and scrolls only its notes.
    <aside
      className={`flex w-[21%] min-w-[240px] max-w-[330px] shrink-0 flex-col overflow-hidden py-6 ${
        side === "left" ? "pl-8 pr-6" : "pl-6 pr-8"
      } ${t.page}`}
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

interface StatusBlockProps {
  t: Theme;
  now: Date;
  status: string;
  log: { id: number; status: string; at: string }[];
  onStatus: (status: string) => void;
  onUndo: () => void;
  onOpenCalendar: () => void;
}

/** A speech bubble — the one control on the panel that talks back. */
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

function StatusBlock({
  t,
  now,
  status,
  log,
  onStatus,
  onUndo,
  onOpenCalendar,
}: StatusBlockProps) {
  const [draft, setDraft] = useState(status);
  const [seeded, setSeeded] = useState(status);
  // Time first, because "when was that" is the question the log is kept for;
  // the totals are the summary you go to afterwards.
  const [view, setView] = useState<"time" | "totals">("time");

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
  // What can be taken back, and whether anything is running right now. A stop
  // is an entry like any other — it just draws no block — so both questions are
  // asked of the log rather than of the strip.
  const newest = lastEntryToday(log, now);
  const running = newest !== null && newest.status !== "";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-3">
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
        <span className="flex shrink-0 items-center gap-1">
          {/* Only while there is something of today's to take back. Offered
              against an empty day it would reach into yesterday and quietly
              delete the last thing set there, which is never what undo on a
              fresh day is asking for. Read off the log, not the strip: a stop
              is takeable back too, and it draws nothing. */}
          {/* Stops the clock: nothing is being done as of now, and whatever
              was running stops collecting time against it. Only while there is
              something to stop — on an idle day it would be a no-op. */}
          {running && (
            <button
              type="button"
              onClick={() => onStatus("")}
              title="Stop the clock"
              className={`cursor-pointer rounded-md border-none bg-transparent px-1 py-0.5 text-[0.62rem] transition-colors ${t.iconBtn}`}
            >
              Stop
            </button>
          )}
          {newest && (
            // Takes back the entry, not just the readout — the block it drew on
            // the strip goes with it, which is what "I didn't mean that" means.
            <button
              type="button"
              onClick={onUndo}
              title={
                newest.status ? `Undo "${newest.status}"` : "Undo the stop"
              }
              className={`cursor-pointer rounded-md border-none bg-transparent px-1 py-0.5 text-[0.62rem] transition-colors ${t.iconBtn}`}
            >
              Undo
            </button>
          )}
          <button
            type="button"
            onClick={onOpenCalendar}
            title="Last 30 days"
            aria-label="Open the last 30 days"
            className={`flex h-6 w-6 cursor-pointer items-center justify-center rounded-md border-none bg-transparent transition-colors ${t.iconBtn}`}
          >
            <CalendarIcon />
          </button>
        </span>
      </div>

      <form
        className="mt-1.5 shrink-0"
        onSubmit={(event) => {
          event.preventDefault();
          onStatus(draft.trim());
        }}
      >
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value.slice(0, 60))}
          onBlur={() => draft.trim() !== status && onStatus(draft.trim())}
          placeholder="What are you doing?"
          aria-label="Current status"
          className={`w-full rounded-xl border px-2.5 py-1.5 text-[0.9rem] outline-none transition-colors ${t.input}`}
        />
      </form>

      <div className="mt-2 flex shrink-0 flex-wrap gap-1">
        {STATUS_PRESETS.map((preset) => (
          <Chip
            key={preset}
            t={t}
            active={preset === status}
            onClick={() => onStatus(preset)}
          >
            {preset}
          </Chip>
        ))}
      </div>

      <div className="shrink-0">
        <DayStrip spans={spans} length={minutesInDay(now)} t={t} />
      </div>

      {/* Whatever the blocks above leave. The ruler is a whole day drawn end to
          end, so height is not decoration here — it is how much of the day you
          can see without scrolling. */}
      <div className="mt-2.5 min-h-0 flex-1">
        {view === "time" ? (
          <DayTimeline
            spans={spans}
            length={minutesInDay(now)}
            now={now}
            t={t}
          />
        ) : (
          <div className="h-full overflow-y-auto">
            <DayTally totals={totals} t={t} />
          </div>
        )}
      </div>
    </div>
  );
}

/** Rows before the rest is rolled up, so the column can't be pushed off-screen. */
/**
 * Where the day went. Live rather than held back until midnight: gated on the
 * day being over it would be invisible for the twenty-three hours you might act
 * on it, and at the end of the day it reads as the summary either way.
 *
 * Every status, not a top few. The list used to roll its tail into "N more",
 * back when this block sat above the mode picker and a long day pushed it off
 * the panel; the mode moved up and the status block became the last thing in
 * the column, so the list has somewhere to grow and the column scrolls if it
 * has to. A status you cannot see is one you cannot account for.
 */
/**
 * The day as a vertical hour ruler, with each status where it actually sat.
 *
 * The point is the question "what was I doing at four" — which the tally under
 * it cannot answer at all, and the strip above it can only answer by hovering a
 * two-pixel block. Here the hours are the axis, so reading down the column and
 * reading down the day are the same motion.
 *
 * Hours are a fixed height rather than only the ones with something in them:
 * a gap is information — it is the part of the day that went unrecorded — and
 * collapsing it would make an hour of work and eight hours of nothing look the
 * same size.
 */
const HOUR_PX = 26;
/**
 * The least a label can be pushed down and still clear the one above it.
 *
 * Kept as small as the type allows on purpose. A label is moved only when it
 * would print on top of its neighbour, and every pixel it moves is a minute it
 * appears not to have happened at — at this scale the gap is worth about half
 * an hour of apparent drift, so the tighter it is, the closer a crowded run of
 * entries stays to the hours it really belongs to. The exact time is written on
 * every line for the same reason: the position can be nudged, the number can't.
 */
const LABEL_GAP = 12;

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

function DayTimeline({
  spans,
  length,
  now,
  t,
}: {
  spans: Span[];
  length: number;
  now: Date;
  t: Theme;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const hours = Math.round(length / 60);
  const height = hours * HOUR_PX;
  const y = (minutes: number) => (minutes / length) * height;

  const minutesNow =
    (now.getTime() -
      new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) /
    60000;

  // The same hues the month calendar gives these statuses, ranked over the day
  // rather than the month — a status keeps one colour wherever it is drawn.
  const colours = colourFor(statusTotals(spans), t.scheme, t.accentSoft);

  // Labels are placed at their span's start and then pushed down only as far as
  // it takes to clear the one before. Two statuses a minute apart still get a
  // line each, in order, instead of printing on top of each other.
  // Never above the top of the ruler either: a status set a minute after
  // midnight sits at y≈0, and a label centred on that would hang off the edge
  // and be clipped in half.
  const labels: number[] = [];
  for (const span of spans) {
    const lowest = labels.length > 0 ? labels[labels.length - 1] : 0;
    labels.push(Math.max(y(span.from), lowest + LABEL_GAP));
  }

  // Opens on the current hour rather than at midnight: the part of the day you
  // are in is the part you are looking for.
  useEffect(() => {
    const box = scrollRef.current;
    if (!box) return;
    box.scrollTop = Math.max(
      0,
      (minutesNow / length) * height - box.clientHeight * 0.6
    );
    // Only on mount — re-running it every half minute would yank the view back
    // while you were reading the morning.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (spans.length === 0) {
    return (
      <p className={`m-0 text-[0.62rem] ${t.faint}`}>No status set today</p>
    );
  }

  return (
    <div ref={scrollRef} className="h-full overflow-y-auto pr-0.5">
      <div className="relative" style={{ height }}>
        {/* The hours themselves: a number and a tick each. The tick is short
            rather than a rule across the block — a line running under the
            entries would have every status name sitting on top of one. Every
            sixth hour reads a shade stronger, which is enough to find noon by
            without drawing four coloured groups around it. */}
        {Array.from({ length: hours }, (_, hour) => (
          <div
            key={hour}
            className="absolute left-0 right-0 flex items-start gap-2"
            style={{ top: hour * HOUR_PX }}
          >
            <span
              className={`w-[22px] shrink-0 text-right text-[0.56rem] leading-none tabular-nums ${
                hour % 6 === 0 ? t.muted : t.faint
              }`}
            >
              {String(hour).padStart(2, "0")}
            </span>
            <span
              aria-hidden
              className="mt-[3px] h-px w-[4px] shrink-0"
              style={{
                backgroundColor: t.track,
                opacity: hour % 6 === 0 ? 1 : 0.5,
              }}
            />
          </div>
        ))}

        {/* The rail, and on it one band per status, at its own minute and its
            own length. */}
        <div
          aria-hidden
          className="absolute w-[3px] rounded-full"
          style={{ left: 30, top: 0, height, backgroundColor: t.track }}
        />
        {spans.map((span) => (
          <div
            key={span.id}
            title={`${span.status} — ${timeLabel(span.from)}`}
            className="absolute w-[3px] rounded-full"
            style={{
              left: 30,
              top: y(span.from),
              // A one-minute status is still a thing that happened.
              height: Math.max(y(span.to) - y(span.from), 3),
              backgroundColor: colours.get(colourKey(span.status, colours)),
            }}
          />
        ))}

        {spans.map((span, i) => (
          <div
            key={span.id}
            className="absolute right-0 flex items-baseline gap-1.5"
            style={{ left: 40, top: labels[i] }}
          >
            <span
              className={`shrink-0 text-[0.58rem] leading-none tabular-nums ${t.faint}`}
            >
              {timeLabel(span.from)}
            </span>
            <span className={`truncate text-[0.66rem] leading-none ${t.body}`}>
              {span.status}
            </span>
          </div>
        ))}

        {/* Where the day has got to. */}
        {minutesNow >= 0 && minutesNow <= length && (
          <div
            aria-hidden
            className="absolute left-[27px] h-px w-[9px]"
            style={{
              top: y(minutesNow),
              backgroundColor: t.accent,
            }}
          />
        )}
      </div>
    </div>
  );
}

function DayTally({ totals, t }: { totals: StatusTotal[]; t: Theme }) {
  if (totals.length === 0) return null;

  const longest = totals[0].minutes;

  return (
    // Sits inside the column rather than being pulled out over its padding: the
    // negative margin that did that pushed the widest bar past the edge of the
    // panel, which cost the row its right-hand padding exactly when the bar was
    // full. Now the bar runs the width of the day strip above it, and the text
    // is inset within the bar.
    <ul className="m-0 mt-2.5 list-none p-0">
      {totals.map((total) => (
        <li
          key={total.status}
          className="relative mt-[3px] flex items-center justify-between gap-3 rounded-md px-4 py-1.5 first:mt-0"
        >
          {/* The bar sits behind the row rather than beside it: at this size a
              separate track would cost a line each and say the same thing. The
              padding is on the row, not on the text, so the bar fills the whole
              of it and the label sits inset from its rounded corner rather than
              butting against it. */}
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
 * Today as one bar from midnight to midnight, with a block for every status
 * that has been set. The newest block runs to now, so how far into the day you
 * are is where the blocks stop — no second "elapsed" tint, which would be the
 * same colour as the blocks and swallow them.
 */
function DayStrip({
  spans,
  length,
  t,
}: {
  spans: { id: number; status: string; from: number; to: number }[];
  /** The day's own length in minutes — not always 1440, see `minutesInDay`. */
  length: number;
  t: Theme;
}) {
  const pct = (minutes: number) => (minutes / length) * 100;

  return (
    <div className="mt-2.5">
      <div
        className="relative h-1.5 w-full overflow-hidden rounded-full"
        style={{ backgroundColor: t.track }}
      >
        {spans.map((span, i) => (
          <div
            key={span.id}
            title={`${span.status} — ${timeLabel(span.from)}`}
            className="absolute inset-y-0 rounded-full"
            style={{
              left: `${pct(span.from)}%`,
              // A minute-long status still has to be findable, and the 2px gap
              // keeps neighbouring blocks from reading as one run.
              width: `calc(${Math.max(pct(span.to - span.from), 1.5)}% - 2px)`,
              backgroundColor: i === spans.length - 1 ? t.accent : t.accentSoft,
            }}
          />
        ))}
      </div>
      {spans.length === 0 && (
        <p className={`m-0 mt-1.5 text-[0.62rem] ${t.faint}`}>
          No status set today
        </p>
      )}
    </div>
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

const timeLabel = (minutes: number): string =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(
    Math.floor(minutes % 60)
  ).padStart(2, "0")}`;
