import { useEffect, useMemo, useState } from "react";
import { noteFor, observe, phraseFor } from "../encouragement";
import { useTheme } from "../theme";
import { useCompletionLog, useTodos } from "../todos";

/**
 * The clock this block runs on. It ticks on the hour, which is when the phrase
 * would change; everything else it says comes from the todo store, which pushes
 * its own update the moment a task is closed.
 */
function useHourly(): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const next = new Date(now);
    // Five seconds past the hour, so `getHours()` has certainly rolled over by
    // the time it is read — firing on the boundary can land a millisecond early.
    next.setHours(now.getHours() + 1, 0, 5, 0);
    const timer = setTimeout(
      () => setNow(new Date()),
      Math.max(next.getTime() - Date.now(), 1000)
    );
    return () => clearTimeout(timer);
  }, [now]);

  return now;
}

/**
 * The sidebar's word for you: a plain warm line, and under it one true thing
 * read off your own list — how many days running you have closed something, how
 * this week compares to last, what you have been carrying longest.
 *
 * The two halves are on purpose. The phrase alone would be flattery, and the
 * number alone would be a dashboard; together the first is the sentiment and
 * the second is the evidence for it.
 */
export default function SidebarSupport() {
  const { t } = useTheme();
  const todos = useTodos();
  const log = useCompletionLog();
  const now = useHourly();

  // "Another one": steps along the rotation. Not persisted — it is a nudge,
  // not a setting, and the next hour brings its own line anyway.
  const [nudge, setNudge] = useState(0);

  const notes = useMemo(() => observe(todos, log, now), [todos, log, now]);
  const note = noteFor(notes, now, nudge);
  const phrase = phraseFor(now, nudge);

  return (
    // `shrink-0` so it keeps its own size and the nav above it does the
    // scrolling, rather than the two of them squeezing each other.
    <div className={`mx-3 mb-3 shrink-0 rounded-xl p-3 ${t.sidebarCard}`}>
      <div className="flex items-start gap-1">
        {/* A name rather than a label that describes the block. "Support"
            announces that you are being handled; a name just sits there, and the
            words underneath do the talking. */}
        {/* Full-strength accent rather than the muted `t.label` every other
            small-caps heading uses: those name a section and should recede,
            while this one is a name and has nothing to recede behind. */}
        <p
          className="m-0 flex-1 text-[0.6rem] font-medium uppercase tracking-[0.2em]"
          style={{ color: t.accent }}
        >
          Timy{" "}
          {/* The label type is deliberately tiny, and an emoji at 0.6rem is a
              smudge rather than a picture — so this one keeps its own size. */}
          <span className="align-middle text-[0.95rem] tracking-normal">
            🚀
          </span>
        </p>
        <button
          type="button"
          onClick={() => setNudge((n) => n + 1)}
          aria-label="Інша фраза"
          title="Інша фраза"
          className={`-mt-1 shrink-0 cursor-pointer rounded-lg border-none bg-transparent px-1 py-0.5 text-[0.7rem] leading-none transition-colors ${t.iconBtn}`}
        >
          ↻
        </button>
      </div>

      <p className="m-0 mt-2 text-[0.82rem] font-light leading-snug">
        {phrase.ua}
      </p>
      <p className={`m-0 mt-0.5 text-[0.68rem] leading-snug ${t.body}`}>
        {phrase.en}
      </p>

      {/* The evidence, kept quieter than the sentiment it backs up. */}
      <p className={`m-0 mt-2.5 text-[0.68rem] leading-snug ${t.muted}`}>
        {note.ua}
      </p>
    </div>
  );
}
