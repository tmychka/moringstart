import {
  Children,
  isValidElement,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { isTypingTarget } from "../useBackGesture";

const TRANSITION_MS = 500;
const EASING = "cubic-bezier(.22,.61,.36,1)";
const LOCK_MS = 550;
const WHEEL_RESET_MS = 180;
const WHEEL_THRESHOLD = 60;
const TOUCH_THRESHOLD = 50;
const DOT_COLOR = "var(--carousel-dot, #7e8fa4)";

type Timer = ReturnType<typeof setTimeout>;

interface CarouselProps {
  children: ReactNode;
  initial?: number;
}

export default function Carousel({ children, initial = 0 }: CarouselProps) {
  const slides = Children.toArray(children);
  const count = slides.length;

  // Only element children carry a key; anything else falls back to its position.
  const keyFor = (slide: (typeof slides)[number], i: number) =>
    isValidElement(slide) ? (slide.key ?? i) : i;

  const clamp = useCallback(
    (i: number) => Math.min(Math.max(i, 0), Math.max(count - 1, 0)),
    [count]
  );

  const [index, setIndex] = useState(() => clamp(initial));

  const indexRef = useRef(index);
  const lockedRef = useRef(false);
  const lockTimerRef = useRef<Timer | undefined>(undefined);
  const wheelAccRef = useRef(0);
  const wheelTimerRef = useRef<Timer | undefined>(undefined);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  // Single entry point for every gesture: clamps, then blocks follow-up
  // gestures for LOCK_MS so one inertial trackpad flick moves exactly one slide.
  const goTo = useCallback(
    (next: number) => {
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
    const onWheel = (e: WheelEvent) => {
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
    const onKeyDown = (e: KeyboardEvent) => {
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
    const onTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      touchStartRef.current = { x: touch.clientX, y: touch.clientY };
    };

    const onTouchEnd = (e: TouchEvent) => {
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
            key={keyFor(slide, i)}
            className="relative w-screen h-full shrink-0 grow-0 basis-[100vw] overflow-hidden"
            aria-hidden={i !== index}
            inert={i === index ? undefined : ""}
          >
            {slide}
          </div>
        ))}
      </div>

      {/* The dots are gone from the page, not from the app. Swiping, the arrow
          keys and the trackpad were always the way this is driven; these
          buttons are what is left for a keyboard or a screen reader, so they
          stay in the tree and come back into view the moment one is focused
          rather than leaving that route with no visible target. */}
      <div className="fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2">
        {slides.map((slide, i) => (
          <button
            key={keyFor(slide, i)}
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
            className={`sr-only cursor-pointer rounded-full border p-0 transition-all duration-300 focus-visible:not-sr-only focus-visible:h-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${
              i === index ? "focus-visible:w-6" : "focus-visible:w-2"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
