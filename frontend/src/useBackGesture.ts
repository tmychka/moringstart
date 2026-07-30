import { useEffect, useRef } from "react";

const WHEEL_RESET_MS = 180;
const WHEEL_THRESHOLD = 60;

export const isTypingTarget = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  (target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT");

// While a popover or modal is open it owns the arrows and the trackpad, so
// leaving the page from under it would drop whatever is being edited there.
const hasOpenDialog = () =>
  document.querySelector('[role="dialog"]') !== null ||
  isTypingTarget(document.activeElement);

/**
 * Leaves a detail page with the same gestures the carousel uses to move between
 * slides: either arrow key, or a horizontal trackpad swipe in either direction.
 */
export function useBackGesture(onBack: () => void) {
  const onBackRef = useRef(onBack);
  const firedRef = useRef(false);
  const wheelAccRef = useRef(0);
  const wheelTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  );

  useEffect(() => {
    onBackRef.current = onBack;
  }, [onBack]);

  useEffect(() => {
    // The page keeps receiving events during the route change, so fire once.
    const back = () => {
      if (firedRef.current) return;
      firedRef.current = true;
      onBackRef.current();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      // Cmd/Ctrl/Alt + arrow belong to the browser and to text navigation.
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      // Rows and milestones reorder themselves with the arrows and call
      // preventDefault; that keypress was already spoken for.
      if (e.defaultPrevented) return;
      if (isTypingTarget(e.target) || hasOpenDialog()) return;
      back();
    };

    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
      // Nothing on a detail page scrolls sideways, and swallowing the gesture
      // keeps the browser's own swipe-back out of it.
      e.preventDefault();
      if (hasOpenDialog()) return;

      wheelAccRef.current += e.deltaX;
      clearTimeout(wheelTimerRef.current);
      wheelTimerRef.current = setTimeout(() => {
        wheelAccRef.current = 0;
      }, WHEEL_RESET_MS);

      if (Math.abs(wheelAccRef.current) < WHEEL_THRESHOLD) return;
      wheelAccRef.current = 0;
      back();
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("wheel", onWheel);
      clearTimeout(wheelTimerRef.current);
    };
  }, []);
}
