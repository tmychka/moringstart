/**
 * Everything today asks of you, on the dashboard, tickable where it stands.
 *
 * The same two buckets the todo page calls a plan — what ran late and what is
 * due today — in the same order it puts them in, because a second ranking would
 * be a second opinion about which task is first. Everything else about a task
 * lives a click away on /todos.
 */
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { cardClass, labelClass, numeralClass } from "../theme";
import {
  dueLabel,
  isLate,
  isPlannable,
  rank,
  removeTodo,
  todayLoad,
  toggleTodo,
  useTodos,
  type Ranked,
} from "../todos";
import { s } from "../plural";
import type { Theme } from "../types";

interface TodayTodosProps {
  t: Theme;
  /** The dashboard's clock, so this doesn't start a second timer of its own. */
  now: Date;
  className?: string;
}

export default function TodayTodos({
  t,
  now,
  className = "",
}: TodayTodosProps) {
  const navigate = useNavigate();
  const todos = useTodos();

  const due = useMemo(
    () => rank(todos, now).filter((entry) => isPlannable(entry.bucket)),
    [todos, now]
  );
  const load = useMemo(() => todayLoad(todos, now), [todos, now]);

  const open = () => navigate("/todos");

  const complete = (entry: Ranked) => {
    const rolled = toggleTodo(entry.todo.id, now);
    if (rolled) {
      toast.success(
        `${entry.todo.title} — next ${dueLabel(rolled, entry.todo.at, now)}`
      );
    }
  };

  return (
    <section className={`${cardClass(t)} ${className} flex flex-col`}>
      <div className="flex items-baseline justify-between gap-3">
        <button
          type="button"
          onClick={open}
          title="Open todos"
          className={`${labelClass(t)} cursor-pointer border-none bg-transparent p-0 text-left transition-opacity hover:opacity-70`}
        >
          Todos · today
        </button>
        <p className={`m-0 shrink-0 text-[0.7rem] ${t.muted}`}>
          {load.done > 0 && `${load.done} done · `}
          {due.length > 0 ? `${due.length} left` : "all clear"}
        </p>
      </div>

      {due.length === 0 ? (
        <button
          type="button"
          onClick={open}
          className={`mt-3 self-start text-left text-[0.82rem] ${t.muted}`}
        >
          {load.done > 0
            ? `Everything for today is done — ${load.done} ${s(load.done, "task")} closed.`
            : "Nothing due today — add one"}
        </button>
      ) : (
        <>
          {/* The list scrolls inside the card rather than stretching it: four
              cards on a grid have to keep their shape however long one day's
              list gets. */}
          <ul className="m-0 mt-2 flex max-h-[15rem] min-h-0 flex-1 list-none flex-col gap-0.5 overflow-y-auto p-0">
            {due.map((entry) => (
              <Row
                key={entry.todo.id}
                t={t}
                entry={entry}
                now={now}
                onComplete={() => complete(entry)}
                onRemove={() => removeTodo(entry.todo.id)}
                onOpen={open}
              />
            ))}
          </ul>

          {load.minutes > 0 && (
            <p className={`m-0 mt-2 text-[0.65rem] ${t.faint}`}>
              about{" "}
              <span className={numeralClass}>
                {Math.round(load.minutes / 60)}h
              </span>{" "}
              of work planned
            </p>
          )}
        </>
      )}
    </section>
  );
}

interface RowProps {
  t: Theme;
  entry: Ranked;
  now: Date;
  onComplete: () => void;
  onRemove: () => void;
  onOpen: () => void;
}

function Row({ t, entry, now, onComplete, onRemove, onOpen }: RowProps) {
  const { todo } = entry;
  const late = isLate(todo.due, todo.at, now);

  return (
    <li
      className={`group/row flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors ${t.rowHover}`}
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={false}
        aria-label={`Complete ${todo.title}`}
        title="Mark as done"
        onClick={onComplete}
        // The same mark as the todo rows and the marathon's, so ticking
        // something off is one gesture across the app rather than one per
        // screen.
        className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full border transition-colors hover:opacity-70"
        style={{
          borderColor: todo.priority ? t.accent : t.track,
          borderWidth: todo.priority === 2 ? 2 : 1,
        }}
      />
      <button
        type="button"
        onClick={onOpen}
        title="Open todos"
        className="min-w-0 flex-1 truncate text-left text-[0.85rem]"
      >
        {todo.title}
      </button>
      <span
        className={`shrink-0 text-[0.66rem] tabular-nums ${t.muted}`}
        style={late ? { color: t.accent } : undefined}
      >
        {dueLabel(todo.due, todo.at, now)}
      </span>
      {/* Out of the way until the row is under the pointer or holds focus, like
          the delete on the todo page's own rows. */}
      <button
        type="button"
        aria-label={`Delete ${todo.title}`}
        title="Delete"
        onClick={onRemove}
        className={`shrink-0 rounded-lg px-1.5 py-0.5 text-[0.66rem] opacity-0 transition-opacity focus:opacity-100 group-hover/row:opacity-100 ${t.iconBtn}`}
      >
        Delete
      </button>
    </li>
  );
}
