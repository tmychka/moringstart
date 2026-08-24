import { useEffect, useState } from "react";

/**
 * The current time, re-read on an interval. Screens that show a clock, a
 * greeting or "today" need the day to roll over under them without a reload,
 * and half a minute is close enough for all three.
 */
export default function useNow(intervalMs = 30000): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);

  return now;
}
