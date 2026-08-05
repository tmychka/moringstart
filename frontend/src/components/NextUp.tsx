import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { cardClass, labelClass } from "../theme";
import {
  chipsFor,
  dueLabel,
  isPlannable,
  rank,
  removeTodo,
  todayLoad,
  toggleTodo,
  useTodos,
} from "../todos";
import type { Theme } from "../types";

interface NextUpProps {
  t: Theme;
  /** The dashboard's clock, so this doesn't start a second timer of its own. */
  now: Date;
  className?: string;
}

/**
 * The todo page's headline task, on the dashboard: what to do next, and the one
 * control that matters — finishing it. Everything else about the task lives a
 * click away on /todos.
 */
export default function NextUp({ t, now, className = "" }: NextUpProps) {
  const navigate = useNavigate();
  const todos = useTodos();

  const ranked = useMemo(() => rank(todos, now), [todos, now]);
  const load = useMemo(() => todayLoad(todos, now), [todos, now]);
  const next = ranked[0];

  // The same step number the list shows, so the two never disagree about which
  // task is first — and only when the day has actually been ordered by hand.
  const step = useMemo(() => {
    if (!next || !isPlannable(next.bucket) || next.todo.position === null) {
      return null;
    }
    const queue = ranked.filter((r) => isPlannable(r.bucket));
    return { place: queue.indexOf(next) + 1, of: queue.length };
  }, [ranked, next]);

  const complete = () => {
    if (!next) return;
    const rolled = toggleTodo(next.todo.id, now);
    if (rolled) {
      toast.success(
        `${next.todo.title} — next ${dueLabel(rolled, next.todo.at, now)}`
      );
    }
  };

  const remove = () => {
    if (next) removeTodo(next.todo.id);
  };

  const hint = load.open
    ? `${load.open} left today`
    : todos.some((todo) => !todo.done)
      ? "today is clear"
      : "";

  const open = () => navigate("/todos");

  // The whole card opens the list, like every other card on the dashboard —
  // but those are one <button> each, and this one holds a control of its own.
  // So the card takes the click for the mouse and the title stays a real button
  // underneath it: nothing here is reachable only by pointing at it.
  return (
    <section
      onClick={open}
      className={`${cardClass(t)} ${className} group flex cursor-pointer flex-col justify-center transition-colors ${t.cardHover}`}
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className={labelClass(t)}>
          {step ? `Next up · step ${step.place} of ${step.of}` : "Next up"}
        </p>
        <p className={`m-0 text-[0.7rem] ${t.muted}`}>{hint}</p>
      </div>

      {!next ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            open();
          }}
          className={`mt-3 self-start text-left text-[0.82rem] ${t.muted}`}
        >
          Nothing on the list — add one
        </button>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              role="checkbox"
              aria-checked={false}
              aria-label={`Complete ${next.todo.title}`}
              title="Mark as done"
              // Stops here: finishing the task is not "open the list".
              onClick={(e) => {
                e.stopPropagation();
                complete();
              }}
              // Sized and coloured like the rows on the todo page, so the
              // gesture is the same one in both places.
              className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full border transition-colors hover:opacity-70"
              style={{
                borderColor: next.todo.priority ? t.accent : t.track,
                borderWidth: next.todo.priority === 2 ? 2 : 1,
              }}
            />
            <button
              type="button"
              title="Open todos"
              onClick={(e) => {
                e.stopPropagation();
                open();
              }}
              className="min-w-0 truncate text-left text-[1.15rem] font-extralight leading-tight tracking-[-0.02em]"
            >
              {next.todo.title}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            {chipsFor(next.todo, now).map((chip) => (
              <span
                key={chip.kind}
                className={`text-[0.7rem] ${t.muted}`}
                style={
                  (chip.kind === "due" && isPlannable(next.bucket)) ||
                  chip.kind === "priority"
                    ? { color: t.accent }
                    : undefined
                }
              >
                {chip.label}
              </span>
            ))}
          </div>

          {/* Same gesture as the rows on the todo page: the action stays out of
              the way until the card is under the pointer or holds focus. */}
          <div className="ml-auto shrink-0 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
            <button
              type="button"
              aria-label={`Delete ${next.todo.title}`}
              title="Delete"
              // Stops here too: deleting the task is not "open the list".
              onClick={(e) => {
                e.stopPropagation();
                remove();
              }}
              className={`rounded-lg px-2 py-1 text-[0.68rem] transition-colors ${t.iconBtn}`}
            >
              Delete
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
