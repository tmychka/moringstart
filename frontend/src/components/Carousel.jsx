import { Children, useCallback, useEffect, useRef, useState } from "react";

const TRANSITION_MS = 500;
const EASING = "cubic-bezier(.22,.61,.36,1)";
const LOCK_MS = 550;
const WHEEL_RESET_MS = 180;
const WHEEL_THRESHOLD = 60;
const TOUCH_THRESHOLD = 50;
const DOT_COLOR = "var(--carousel-dot, #134e4a)";

const isTypingTarget = (target) =>
  target instanceof HTMLElement &&
  (target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT");

export default function Carousel({ children, initial = 0 }) {
  const slides = Children.toArray(children);
  const count = slides.length;

  const clamp = useCallback(
    (i) => Math.min(Math.max(i, 0), Math.max(count - 1, 0)),
    [count]
  );

  const [index, setIndex] = useState(() => clamp(initial));

  const indexRef = useRef(index);
  const lockedRef = useRef(false);
  const lockTimerRef = useRef(null);
  const wheelAccRef = useRef(0);
  const wheelTimerRef = useRef(null);
  const touchStartRef = useRef(null);

  // Single entry point for every gesture: clamps, then blocks follow-up
  // gestures for LOCK_MS so one inertial trackpad flick moves exactly one slide.
  const goTo = useCallback(
    (next) => {
      const target = clamp(next);
      if (target === indexRef.current) return;
      indexRef.current = target;
      lockedRef.current = true;
      clearTimeout(lockTimerRef.current);
      lockTimerRef.current = setTimeout(() => {
        lockedRef.current = false;
      }, LOCK_MS);
      setIndex(target);
    },
    [clamp]
  );

  // Keep the index valid when slides are added or removed.
  useEffect(() => {
    const clamped = clamp(indexRef.current);
    if (clamped !== indexRef.current) {
      indexRef.current = clamped;
      setIndex(clamped);
    }
  }, [clamp]);

  // Trackpad: horizontal two/three-finger swipe.
  useEffect(() => {
    const onWheel = (e) => {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
      e.preventDefault();

      if (lockedRef.current) {
        wheelAccRef.current = 0;
        return;
      }

      wheelAccRef.current += e.deltaX;
      clearTimeout(wheelTimerRef.current);
      wheelTimerRef.current = setTimeout(() => {
        wheelAccRef.current = 0;
      }, WHEEL_RESET_MS);

      if (Math.abs(wheelAccRef.current) < WHEEL_THRESHOLD) return;
      goTo(indexRef.current + (wheelAccRef.current > 0 ? 1 : -1));
      wheelAccRef.current = 0;
    };

    window.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      window.removeEventListener("wheel", onWheel);
      clearTimeout(wheelTimerRef.current);
    };
  }, [goTo]);

  // Keyboard arrows.
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      if (isTypingTarget(e.target)) return;
      if (lockedRef.current) return;
      goTo(indexRef.current + (e.key === "ArrowRight" ? 1 : -1));
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [goTo]);

  // Touch swipe.
  useEffect(() => {
    const onTouchStart = (e) => {
      const touch = e.touches[0];
      touchStartRef.current = { x: touch.clientX, y: touch.clientY };
    };

    const onTouchEnd = (e) => {
      const start = touchStartRef.current;
      touchStartRef.current = null;
      if (!start || lockedRef.current) return;

      const touch = e.changedTouches[0];
      const dx = touch.clientX - start.x;
      const dy = touch.clientY - start.y;
      if (Math.abs(dx) < TOUCH_THRESHOLD || Math.abs(dx) <= Math.abs(dy))
        return;
      goTo(indexRef.current + (dx < 0 ? 1 : -1));
    };

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, [goTo]);

  // Clear the lock timer on unmount.
  useEffect(() => () => clearTimeout(lockTimerRef.current), []);

  return (
    <div className="fixed inset-0 overflow-hidden">
      <div
        className="flex h-full will-change-transform"
        style={{
          width: `${count * 100}vw`,
          transform: `translate3d(${-index * 100}vw, 0, 0)`,
          transition: `transform ${TRANSITION_MS}ms ${EASING}`,
        }}
      >
        {slides.map((slide, i) => (
          <div
            key={slide.key ?? i}
            className="relative w-screen h-full shrink-0 grow-0 basis-[100vw] overflow-hidden"
            aria-hidden={i !== index}
            inert={i === index ? undefined : ""}
          >
            {slide}
          </div>
        ))}
      </div>

      <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2">
        {slides.map((slide, i) => (
          <button
            key={slide.key ?? i}
            type="button"
            onClick={() => goTo(i)}
            aria-label={`Go to slide ${i + 1} of ${count}`}
            aria-current={i === index}
            // Slides can theme themselves, so the dot colour comes from a custom
            // property they can override rather than being fixed here.
            style={{
              borderColor: DOT_COLOR,
              backgroundColor: i === index ? DOT_COLOR : "transparent",
            }}
            className={`h-2 rounded-full border cursor-pointer p-0 transition-all duration-300 ${
              i === index ? "w-6" : "w-2"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
