import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "react-toastify";
import { addDays } from "../dashboardStats";
import { toKey } from "../stepsUtil";
import { cardClass, labelClass, numeralClass, useTheme } from "../theme";
import { isTypingTarget } from "../useBackGesture";
import {
  addTodo,
  chipsFor,
  clearDone,
  clearPlan,
  dayDiff,
  dueLabel,
  formatMinutes,
  isPlannable,
  parseCapture,
  patchTodo,
  planMove,
  planSet,
  rank,
  removeTodo,
  rollOverdue,
  snoozeTodo,
  todayLoad,
  toggleTodo,
  undo,
  useCanUndo,
  useTodos,
  type Bucket,
  type Chip,
  type Todo,
} from "../todos";
import type { Theme } from "../types";

const SECTIONS: { bucket: Bucket; label: string }[] = [
  { bucket: "overdue", label: "Overdue" },
  { bucket: "today", label: "Today" },
  { bucket: "tomorrow", label: "Tomorrow" },
  { bucket: "week", label: "This week" },
  { bucket: "later", label: "Later" },
  { bucket: "someday", label: "Someday" },
];

// The buckets whose dates have real urgency behind them; their date chip is
// painted in the accent rather than left in the muted meta line.
const HOT: Bucket[] = ["overdue", "today"];

const PLACEHOLDER = "pay rent tomorrow at 9 !! #home ~20m";

const EXAMPLES = [
  ["stretch every weekday ~10m", "repeats, and rolls itself forward"],
  ["call mum sunday 18:00", "a weekday name is the next one coming"],
  ["book flights in 3 days #travel", "relative dates, tags"],
  ["taxes 15 aug !!", "a date, and two marks for urgent"],
];

const HINTS = [
  ["today · tomorrow · fri · 15 aug · in 3 days", "when"],
  ["at 9 · 18:30", "time"],
  ["daily · every week · every monday", "repeat"],
  ["~25m · ~2h", "how long"],
  ["! · !!", "priority"],
  ["#tag", "group"],
];

// The ranking reads the clock: a task due at 09:00 outranks one due at 18:00,
// and today rolls into overdue at midnight without a reload.
function useNow(intervalMs = 60000): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);

  return now;
}

/**
 * The todo page: one capture bar that reads plain English, a list that sorts
 * itself by urgency, and a keyboard that never needs the mouse.
 */
export default function SuperTodo() {
  const { t } = useTheme();
  const todos = useTodos();
  const canUndo = useCanUndo();
  const now = useNow();

  const [draft, setDraft] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);

  const captureRef = useRef<HTMLInputElement>(null);

  // What the capture bar understood so far, shown under it as you type.
  const preview = useMemo(
    () => (draft.trim() ? parseCapture(draft, now) : null),
    [draft, now]
  );

  const ranked = useMemo(() => rank(todos, now), [todos, now]);
  const visible = useMemo(
    () => (tagFilter ? ranked.filter((r) => r.todo.tag === tagFilter) : ranked),
    [ranked, tagFilter]
  );

  const done = useMemo(
    () =>
      todos
        .filter((todo) => todo.done)
        .sort((a, b) => (b.completed ?? 0) - (a.completed ?? 0)),
    [todos]
  );

  const tags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const { todo } of ranked) {
      if (todo.tag) counts.set(todo.tag, (counts.get(todo.tag) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [ranked]);

  // Only work left over from an earlier day can be moved to today; a task that
  // is an hour late is already here.
  const leftOver = ranked.filter(
    (r) => r.todo.due !== null && dayDiff(r.todo.due, now) < 0
  ).length;
  const focus = visible[0];

  // Step numbers for the day's queue, once any of it has been ordered by hand.
  // They count what is still open rather than echoing the stored positions, so
  // finishing step 1 makes the next one step 1 instead of leaving a gap. Built
  // off `ranked`, not `visible`, so a tag filter doesn't renumber the day.
  const steps = useMemo(() => {
    const queue = ranked.filter((r) => isPlannable(r.bucket));
    if (!queue.some((r) => r.todo.position !== null)) return null;
    return new Map(queue.map((r, i) => [r.todo.id, i + 1]));
  }, [ranked]);

  const focusStep = focus ? (steps?.get(focus.todo.id) ?? null) : null;

  // Today's shape: what is still open (late work included — it is today's
  // problem now) against what has already been finished today.
  const load = useMemo(() => todayLoad(todos, now), [todos, now]);

  // Every row on screen, top to bottom — the order the keyboard walks.
  const order = useMemo(
    () => [
      ...visible.map((r) => r.todo.id),
      ...(showDone ? done.map((todo) => todo.id) : []),
    ],
    [visible, done, showDone]
  );

  const submit = () => {
    const capture = parseCapture(draft, now);
    if (!capture.title) return;
    const todo = addTodo(capture);
    setDraft("");
    setSelectedId(todo.id);
  };

  const startEditing = (todo: Todo) => {
    setEditingId(todo.id);
    setEditDraft(todo.title);
    setSelectedId(todo.id);
  };

  // Editing runs the line back through the parser, so "buy milk" can become
  // "buy milk friday !!" without leaving the row. Only the fields the new line
  // actually names are replaced — retyping a title never silently unschedules.
  const commitEdit = (todo: Todo) => {
    const text = editDraft.trim();
    setEditingId(null);
    if (!text || text === todo.title) return;

    const parsed = parseCapture(text, now);
    patchTodo(todo.id, {
      title: parsed.title,
      // Naming a date is a reschedule, so it gives up its seat in the day's
      // order the same way the snooze buttons do.
      ...(parsed.due ? { due: parsed.due, at: parsed.at, position: null } : {}),
      ...(parsed.priority ? { priority: parsed.priority } : {}),
      ...(parsed.tag ? { tag: parsed.tag } : {}),
      ...(parsed.estimate ? { estimate: parsed.estimate } : {}),
      ...(parsed.repeat ? { repeat: parsed.repeat } : {}),
    });
  };

  const complete = (todo: Todo) => {
    const rolled = toggleTodo(todo.id, now);
    if (rolled) {
      toast.success(`${todo.title} — next ${dueLabel(rolled, todo.at, now)}`);
    }
  };

  const remove = (id: string) => {
    removeTodo(id);
    if (selectedId === id) setSelectedId(null);
    if (editingId === id) setEditingId(null);
  };

  const rollLate = () => {
    const moved = rollOverdue(now);
    if (moved) toast.info(`${moved} moved to today`);
  };

  const sweepDone = () => {
    const cleared = clearDone();
    if (cleared) toast.info(`${cleared} cleared — press U to undo`);
  };

  // Keyboard first: the mouse is optional on this page. Arrow left/right are
  // left alone — they belong to the back gesture that leaves the page.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;

      const key = e.key.toLowerCase();

      // A focused button is about to be pressed by the browser; completing the
      // selected task on the same keystroke would be one action too many.
      if (
        (key === " " || key === "enter") &&
        e.target instanceof HTMLElement &&
        (e.target.tagName === "BUTTON" || e.target.tagName === "A")
      ) {
        return;
      }

      if (key === "/" || key === "n") {
        e.preventDefault();
        captureRef.current?.focus();
        return;
      }
      if (key === "u") {
        e.preventDefault();
        if (undo()) toast.info("Undone");
        return;
      }
      if (key === "escape") {
        setSelectedId(null);
        return;
      }
      if (!order.length) return;

      const index = selectedId ? order.indexOf(selectedId) : -1;
      const at = (i: number) => setSelectedId(order[i] ?? order[0]);

      // Everything below acts on the selected row; with nothing selected the
      // first press picks the top one so the next press already has a target.
      const todo = todos.find((item) => item.id === selectedId);

      const up = key === "arrowup" || key === "k";
      const down = key === "arrowdown" || key === "j";

      // Shift turns the same two keys from "go there" into "move it": the task
      // walks up or down today's queue and the day is renumbered around it.
      if (e.shiftKey && (up || down) && todo) {
        e.preventDefault();
        planMove(todo.id, up ? -1 : 1, now);
        return;
      }
      if (down) {
        e.preventDefault();
        at(Math.min(index + 1, order.length - 1));
        return;
      }
      if (up) {
        e.preventDefault();
        at(index <= 0 ? 0 : index - 1);
        return;
      }

      if (!todo) {
        if (key === " " || key === "enter") {
          e.preventDefault();
          at(0);
        }
        return;
      }

      if (key === " " || key === "enter") {
        e.preventDefault();
        complete(todo);
      } else if (key === "e") {
        e.preventDefault();
        startEditing(todo);
      } else if (key === "backspace" || key === "delete") {
        e.preventDefault();
        remove(todo.id);
      } else if (key === "p") {
        e.preventDefault();
        patchTodo(todo.id, {
          priority: ((todo.priority + 1) % 3) as 0 | 1 | 2,
        });
      } else if (key === "1") {
        snoozeTodo(todo.id, toKey(now));
      } else if (key === "2") {
        snoozeTodo(todo.id, toKey(addDays(now, 1)));
      } else if (key === "3") {
        snoozeTodo(todo.id, toKey(addDays(now, 7)));
      } else if (key === "0") {
        snoozeTodo(todo.id, null);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // `complete`, `remove` and friends close over this render's values; the
    // listener is rebound whenever any of them would go stale.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order, selectedId, todos, now]);

  const empty = todos.length === 0;

  return (
    <>
      <section className={`${cardClass(t)} p-3`}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="flex items-center gap-2">
            <input
              ref={captureRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") e.currentTarget.blur();
              }}
              placeholder={PLACEHOLDER}
              aria-label="Add a task"
              className={`w-full rounded-2xl border px-4 py-3 text-[0.92rem] outline-none transition ${t.input}`}
            />
            <button
              type="submit"
              disabled={!preview?.title}
              className={`shrink-0 rounded-2xl border px-4 py-3 text-[0.78rem] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${t.outlineBtn}`}
            >
              Add
            </button>
          </div>

          {/* What the line will become, before it becomes it. */}
          <div className="mt-2.5 flex min-h-[1.5rem] flex-wrap items-center gap-1.5 px-1">
            {preview?.chips.length ? (
              <>
                <span className={`text-[0.72rem] ${t.body}`}>
                  {preview.title}
                </span>
                {preview.chips.map((chip) => (
                  <ChipTag key={chip.kind} chip={chip} t={t} lit />
                ))}
              </>
            ) : (
              HINTS.map(([syntax, meaning]) => (
                <span
                  key={meaning}
                  className={`text-[0.68rem] ${t.faint}`}
                  title={meaning}
                >
                  {syntax}
                  <span className="px-2 opacity-50">·</span>
                </span>
              ))
            )}
          </div>
        </form>
      </section>

      {focus && (
        <section className={`${cardClass(t)} overflow-hidden`}>
          <div className="flex flex-wrap items-center gap-5">
            <div className="min-w-0 flex-1">
              <p className={labelClass(t)}>
                {focusStep && steps
                  ? `Next up · step ${focusStep} of ${steps.size}`
                  : "Next up"}
              </p>
              <button
                type="button"
                onClick={() => complete(focus.todo)}
                className="mt-2 block max-w-full truncate text-left text-[1.45rem] font-extralight leading-tight tracking-[-0.02em] transition-opacity hover:opacity-60"
                title="Click to complete"
              >
                {focus.todo.title}
              </button>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {chipsFor(focus.todo, now).map((chip) => (
                  <ChipTag
                    key={chip.kind}
                    chip={chip}
                    t={t}
                    lit={chip.kind !== "due" || HOT.includes(focus.bucket)}
                  />
                ))}
              </div>
            </div>

            <div
              className={`w-full shrink-0 sm:ml-auto sm:w-[210px] sm:border-l sm:pl-5 ${t.rule}`}
            >
              <div className="flex items-baseline justify-between gap-3">
                <p className={labelClass(t)}>Today</p>
                <p className={`m-0 text-[0.7rem] ${t.muted}`}>
                  {load.minutes
                    ? `≈ ${formatMinutes(load.minutes)} left`
                    : "clear"}
                </p>
              </div>
              <p
                className={`m-0 mt-2 text-[1.8rem] leading-none ${numeralClass}`}
              >
                {load.done}
                <span className={`ml-2 text-[0.8rem] ${t.muted}`}>
                  of {load.done + load.open} done
                </span>
              </p>
              <div
                className="mt-3 h-1 w-full overflow-hidden rounded-full"
                style={{ backgroundColor: t.track }}
              >
                <div
                  className="h-full rounded-full transition-[width] duration-700 ease-out"
                  style={{
                    width: `${(load.done / Math.max(load.done + load.open, 1)) * 100}%`,
                    backgroundColor: t.accent,
                  }}
                />
              </div>
            </div>
          </div>
        </section>
      )}

      {!empty && (
        <div className="flex flex-wrap items-center gap-1.5 px-1 pt-1">
          {tags.length > 0 && (
            <>
              <FilterButton
                t={t}
                active={tagFilter === null}
                onClick={() => setTagFilter(null)}
              >
                All
              </FilterButton>
              {tags.map(([tag, count]) => (
                <FilterButton
                  key={tag}
                  t={t}
                  active={tagFilter === tag}
                  onClick={() => setTagFilter(tagFilter === tag ? null : tag)}
                >
                  #{tag}
                  <span className="ml-1.5 opacity-50">{count}</span>
                </FilterButton>
              ))}
            </>
          )}

          <div className="ml-auto flex items-center gap-1.5">
            {steps && (
              <FilterButton
                t={t}
                onClick={() => {
                  if (clearPlan()) toast.info("Order cleared — ranking again");
                }}
              >
                Clear order
              </FilterButton>
            )}
            {leftOver > 0 && (
              <FilterButton t={t} onClick={rollLate}>
                Move {leftOver} to today
              </FilterButton>
            )}
            {canUndo && (
              <FilterButton
                t={t}
                onClick={() => {
                  undo();
                  toast.info("Undone");
                }}
              >
                Undo
              </FilterButton>
            )}
            {done.length > 0 && (
              <FilterButton
                t={t}
                active={showDone}
                onClick={() => setShowDone(!showDone)}
              >
                Done
                <span className="ml-1.5 opacity-50">{done.length}</span>
              </FilterButton>
            )}
          </div>
        </div>
      )}

      {empty ? (
        <section className={`${cardClass(t)} mt-1`}>
          <p className={labelClass(t)}>Type a line, get a task</p>
          <ul className="m-0 mt-4 list-none space-y-3 p-0">
            {EXAMPLES.map(([example, meaning]) => (
              <li key={example} className="flex flex-wrap items-baseline gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setDraft(example);
                    captureRef.current?.focus();
                  }}
                  className={`rounded-lg px-2 py-1 text-[0.82rem] transition-colors ${t.body} ${t.rowHover}`}
                >
                  {example}
                </button>
                <span className={`text-[0.7rem] ${t.faint}`}>{meaning}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        SECTIONS.map(({ bucket, label }) => {
          const rows = visible.filter((r) => r.bucket === bucket);
          if (!rows.length) return null;

          return (
            <section key={bucket} className="mt-2">
              <div
                className={`flex items-baseline gap-3 border-b pb-2 ${t.rule}`}
              >
                <p className={labelClass(t)}>{label}</p>
                <p className={`m-0 text-[0.68rem] ${t.faint}`}>{rows.length}</p>
              </div>
              <ul className="m-0 list-none p-0">
                {rows.map(({ todo, bucket: b }) => (
                  <Row
                    key={todo.id}
                    todo={todo}
                    bucket={b}
                    now={now}
                    t={t}
                    step={steps?.get(todo.id) ?? null}
                    onPlace={(place) => planSet(todo.id, place, now)}
                    selected={selectedId === todo.id}
                    editing={editingId === todo.id}
                    editDraft={editDraft}
                    onEditDraft={setEditDraft}
                    onSelect={() => setSelectedId(todo.id)}
                    onToggle={() => complete(todo)}
                    onEdit={() => startEditing(todo)}
                    onCommitEdit={() => commitEdit(todo)}
                    onCancelEdit={() => setEditingId(null)}
                    onSnooze={(due) => snoozeTodo(todo.id, due)}
                    onRemove={() => remove(todo.id)}
                  />
                ))}
              </ul>
            </section>
          );
        })
      )}

      {showDone && done.length > 0 && (
        <section className="mt-2">
          <div className={`flex items-baseline gap-3 border-b pb-2 ${t.rule}`}>
            <p className={labelClass(t)}>Done</p>
            <button
              type="button"
              onClick={sweepDone}
              className={`ml-auto rounded-lg px-2 py-1 text-[0.68rem] transition-colors ${t.muted} ${t.rowHover}`}
            >
              Clear
            </button>
          </div>
          <ul className="m-0 list-none p-0">
            {done.map((todo) => (
              <Row
                key={todo.id}
                todo={todo}
                bucket="someday"
                now={now}
                t={t}
                step={null}
                onPlace={() => {}}
                selected={selectedId === todo.id}
                editing={false}
                editDraft={editDraft}
                onEditDraft={setEditDraft}
                onSelect={() => setSelectedId(todo.id)}
                onToggle={() => complete(todo)}
                onEdit={() => startEditing(todo)}
                onCommitEdit={() => commitEdit(todo)}
                onCancelEdit={() => setEditingId(null)}
                onSnooze={(due) => snoozeTodo(todo.id, due)}
                onRemove={() => remove(todo.id)}
              />
            ))}
          </ul>
        </section>
      )}

      <p className={`m-0 mt-4 text-[0.66rem] ${t.faint}`}>
        / capture · j k move · space done · e edit · p priority · 1 2 3 today
        tomorrow next week · 0 someday · ⌫ delete · u undo · click a row number
        or shift+j k to order the day
      </p>
    </>
  );
}

interface RowProps {
  todo: Todo;
  bucket: Bucket;
  now: Date;
  t: Theme;
  /** Place in today's hand-made order, or null when the ranking still decides. */
  step: number | null;
  onPlace: (place: number) => void;
  selected: boolean;
  editing: boolean;
  editDraft: string;
  onEditDraft: (value: string) => void;
  onSelect: () => void;
  onToggle: () => void;
  onEdit: () => void;
  onCommitEdit: () => void;
  onCancelEdit: () => void;
  onSnooze: (due: string | null) => void;
  onRemove: () => void;
}

function Row({
  todo,
  bucket,
  now,
  t,
  step,
  onPlace,
  selected,
  editing,
  editDraft,
  onEditDraft,
  onSelect,
  onToggle,
  onEdit,
  onCommitEdit,
  onCancelEdit,
  onSnooze,
  onRemove,
}: RowProps) {
  const chips = chipsFor(todo, now);

  return (
    <li>
      <div
        onClick={onSelect}
        className={`group flex items-center gap-3 rounded-2xl px-3 py-2.5 transition-colors ${t.rowHover}`}
        style={
          selected
            ? { boxShadow: `inset 0 0 0 1px ${t.accentSoft}` }
            : undefined
        }
      >
        {/* Every row keeps the same gutter so the checkboxes stay in one line;
            only today's open work can be given a place in it. */}
        {isPlannable(bucket) && !todo.done ? (
          <PlanSlot step={step} title={todo.title} t={t} onPlace={onPlace} />
        ) : (
          <span className="w-4 shrink-0" aria-hidden />
        )}

        <button
          type="button"
          role="checkbox"
          aria-checked={todo.done}
          aria-label={`Complete ${todo.title}`}
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full border transition-colors"
          style={{
            borderColor: todo.done
              ? t.accent
              : todo.priority
                ? t.accent
                : t.track,
            backgroundColor: todo.done ? t.accent : "transparent",
            borderWidth: todo.priority === 2 && !todo.done ? 2 : 1,
          }}
        >
          {todo.done && (
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-white"
              aria-hidden="true"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
        </button>

        <div className="min-w-0 flex-1">
          {editing ? (
            <input
              autoFocus
              value={editDraft}
              onChange={(e) => onEditDraft(e.target.value)}
              onBlur={onCommitEdit}
              onKeyDown={(e) => {
                if (e.key === "Enter") onCommitEdit();
                if (e.key === "Escape") onCancelEdit();
              }}
              aria-label="Edit task"
              className={`w-full rounded-lg border px-2 py-1 text-[0.88rem] outline-none ${t.input}`}
            />
          ) : (
            <p
              onDoubleClick={onEdit}
              className={`m-0 truncate text-[0.88rem] ${
                todo.done ? `line-through ${t.faint}` : ""
              }`}
            >
              {todo.title}
            </p>
          )}

          {!editing && chips.length > 0 && (
            <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1">
              {chips.map((chip) => (
                <span
                  key={chip.kind}
                  className={`text-[0.68rem] ${t.muted}`}
                  style={
                    !todo.done &&
                    ((chip.kind === "due" && HOT.includes(bucket)) ||
                      chip.kind === "priority")
                      ? { color: t.accent }
                      : undefined
                  }
                >
                  {chip.label}
                </span>
              ))}
              {todo.runs > 0 && (
                <span className={`text-[0.68rem] ${t.faint}`}>
                  ×{todo.runs} done
                </span>
              )}
            </div>
          )}
        </div>

        {/* Reschedule without opening anything: the three moves that cover
            almost every case, plus a way out. */}
        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
          {!todo.done && (
            <>
              <RowAction t={t} onClick={() => onSnooze(toKey(now))}>
                Today
              </RowAction>
              <RowAction t={t} onClick={() => onSnooze(toKey(addDays(now, 1)))}>
                Tomorrow
              </RowAction>
              <RowAction t={t} onClick={() => onSnooze(toKey(addDays(now, 7)))}>
                +1w
              </RowAction>
              <RowAction t={t} onClick={onEdit}>
                Edit
              </RowAction>
            </>
          )}
          <RowAction t={t} onClick={onRemove}>
            Delete
          </RowAction>
        </div>
      </div>
    </li>
  );
}

/**
 * The row's place in today's order — a number that reads as one and edits as
 * one: click it, type where the task belongs, Enter. An unplanned row shows a
 * dot on hover, so the first number you type is also what starts the plan.
 */
function PlanSlot({
  step,
  title,
  t,
  onPlace,
}: {
  step: number | null;
  title: string;
  t: Theme;
  onPlace: (place: number) => void;
}) {
  // Null means "not editing"; an empty string is a slot waiting for its digits.
  const [draft, setDraft] = useState<string | null>(null);

  const slotClass = `w-4 shrink-0 text-right text-[0.7rem] ${numeralClass}`;

  if (draft === null) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setDraft(step === null ? "" : String(step));
        }}
        aria-label={`Place ${title} in today's order`}
        title="Set the place in today's order"
        className={`${slotClass} transition-opacity ${step === 1 ? "" : t.faint} ${
          step === null
            ? "opacity-0 focus-visible:opacity-100 group-hover:opacity-60"
            : "hover:opacity-60"
        }`}
        style={step === 1 ? { color: t.accent } : undefined}
      >
        {step ?? "·"}
      </button>
    );
  }

  const commit = () => {
    const place = Number(draft);
    setDraft(null);
    if (draft !== "" && Number.isFinite(place) && place > 0) onPlace(place);
  };

  return (
    <input
      autoFocus
      value={draft}
      inputMode="numeric"
      aria-label={`Place ${title} in today's order`}
      // Opening a slot that already holds a number means replacing it, not
      // typing after it — "4" then "2" is place two, not place forty-two.
      onFocus={(e) => e.currentTarget.select()}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setDraft(e.target.value.replace(/\D/g, "").slice(0, 2))}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") setDraft(null);
      }}
      className={`${slotClass} border-0 bg-transparent p-0 outline-none`}
      style={{ color: t.accent }}
    />
  );
}

function RowAction({
  t,
  onClick,
  label,
  children,
}: {
  t: Theme;
  onClick: () => void;
  /** Spoken name, for the actions whose face is an arrow rather than a word. */
  label?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`rounded-lg px-2 py-1 text-[0.68rem] transition-colors ${t.iconBtn}`}
    >
      {children}
    </button>
  );
}

function FilterButton({
  t,
  active = false,
  onClick,
  children,
}: {
  t: Theme;
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full px-3 py-1.5 text-[0.7rem] transition-colors ${
        active ? t.toggleOn : `${t.sidebarBadge}`
      }`}
    >
      {children}
    </button>
  );
}

function ChipTag({ chip, t, lit }: { chip: Chip; t: Theme; lit: boolean }) {
  return (
    <span
      className="rounded-full border px-2 py-[3px] text-[0.66rem]"
      style={
        lit
          ? { borderColor: t.accentSoft, color: t.accent }
          : { borderColor: t.track }
      }
    >
      {chip.label}
    </span>
  );
}
