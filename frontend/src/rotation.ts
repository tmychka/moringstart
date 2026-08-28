/**
 * A handful of things drawn out of a longer list, redrawn every hour.
 *
 * This is what turns two archives you never reopen — the notes and the
 * vocabulary — into revision: a few of them are put in front of you, and an hour
 * later a few different ones are. The draw is deterministic for the hour it
 * belongs to rather than random per render, so the same three notes are still
 * there when you look back at the screen, and they change when the clock says
 * they should rather than when React happens to re-render.
 *
 * The hour comes from the caller's own `now`, which the dashboard already ticks;
 * nothing here starts a timer of its own.
 */
import { useMemo, useState } from "react";

export interface Rotation<T> {
  picked: T[];
  /** Draw another set now, rather than waiting for the hour to turn. */
  shuffle: () => void;
}

/** The hour a draw belongs to. Local, so it turns over when your clock does. */
const hourKey = (now: Date): string =>
  `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}`;

// FNV-1a: a string to a seed, in six lines and no dependency.
const hashOf = (value: string): number => {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

/** mulberry32 — small, seeded, and good enough to shuffle a list with. */
function randomFrom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * `count` items off `items`, held steady for the hour `now` falls in.
 *
 * A list no longer than the draw is handed back whole and in its own order —
 * shuffling three notes out of three would look like the card was broken.
 */
export function useHourly<T>(
  items: T[],
  count: number,
  now: Date
): Rotation<T> {
  // Bumped by hand to draw again inside the same hour. Part of the seed rather
  // than a separate pick, so a manual draw is as reproducible as an hourly one.
  const [nudge, setNudge] = useState(0);
  const hour = hourKey(now);

  const picked = useMemo(() => {
    if (items.length <= count) return items;

    const next = randomFrom(hashOf(`${hour}#${nudge}`));
    // Partial Fisher–Yates: draw from a copy so nothing comes out twice.
    const pool = [...items];
    const drawn: T[] = [];
    for (let i = 0; i < count; i++) {
      drawn.push(...pool.splice(Math.floor(next() * pool.length), 1));
    }
    return drawn;
  }, [items, count, hour, nudge]);

  return { picked, shuffle: () => setNudge((value) => value + 1) };
}
