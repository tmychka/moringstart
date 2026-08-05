import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import AppSidebar from "../components/AppSidebar";
import SuperTodo from "../components/SuperTodo";
import { labelClass, numeralClass, useTheme } from "../theme";
import { useBackGesture } from "../useBackGesture";
import { useTodos } from "../todos";

export default function Todos() {
  const navigate = useNavigate();
  const { t } = useTheme();
  const todos = useTodos();
  const open = todos.filter((todo) => !todo.done).length;

  // Same as every other page off the carousel: either arrow key or a sideways
  // trackpad swipe goes back to the dashboard.
  useBackGesture(useCallback(() => navigate("/"), [navigate]));

  // A route of its own rather than a carousel slide, so it sizes itself to the
  // viewport and scrolls inside — `body` has overflow hidden.
  return (
    <div
      className={`relative flex h-screen w-screen overflow-hidden transition-colors duration-300 ${t.page}`}
    >
      <AppSidebar />

      <div className="h-full flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-3 px-6 pb-16 pt-8 sm:px-8">
          <header className={`border-b pb-4 ${t.rule}`}>
            <p className={labelClass(t)}>Todos</p>
            <h1
              className={`m-0 mt-2 text-[1.7rem] leading-none ${numeralClass}`}
            >
              {open || "All clear"}
              {open > 0 && (
                <span className={`ml-2 text-[0.8rem] ${t.muted}`}> open</span>
              )}
            </h1>
          </header>

          <SuperTodo />
        </div>
      </div>
    </div>
  );
}
