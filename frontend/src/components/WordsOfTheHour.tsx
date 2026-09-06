/**
 * Three words off the vocabulary list, changed every hour.
 *
 * Only the words. A translation printed beside a term turns recall into reading,
 * which is the one thing that makes a word list stop working — so the meaning is
 * a hover away, exactly as it is on the vocabulary page, and the answer arrives
 * after you have tried to remember it rather than instead of it.
 *
 * The pointer is not the only way in: a word is a button, and clicking or
 * tabbing to it holds its meaning open.
 */
import { useState } from "react";
import ShuffleButton from "./ShuffleButton";
import type { StoredWord } from "../englishWords";
import { useHourly } from "../rotation";
import { cardClass, labelClass } from "../theme";
import type { Theme } from "../types";

/** How many are shown at once — the same draw the notes card makes. */
const DRAW = 3;

interface WordsProps {
  t: Theme;
  /** The dashboard's clock — the hour it falls in is what picks the words. */
  now: Date;
  words: StoredWord[];
  onOpen: () => void;
  className?: string;
}

export default function WordsOfTheHour({
  t,
  now,
  words,
  onOpen,
  className = "",
}: WordsProps) {
  const { picked, shuffle } = useHourly(words, DRAW, now);
  // Hovering shows a meaning for as long as the pointer is there; clicking pins
  // it, which is the only way in on a touchscreen.
  const [hovered, setHovered] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);

  return (
    <section className={`${cardClass(t)} ${className} flex flex-col`}>
      <div className="flex items-baseline justify-between gap-3">
        <button
          type="button"
          onClick={onOpen}
          title="Open Learn English"
          className={`${labelClass(t)} cursor-pointer border-none bg-transparent p-0 text-left transition-opacity hover:opacity-70`}
        >
          English · recall
        </button>
        <span className="flex shrink-0 items-center gap-1.5">
          {words.length > 0 && (
            <p className={`m-0 text-[0.7rem] ${t.muted}`}>
              {picked.length} of {words.length}
            </p>
          )}
          <ShuffleButton t={t} label="Draw other words" onClick={shuffle} />
        </span>
      </div>

      {picked.length === 0 ? (
        <button
          type="button"
          onClick={onOpen}
          className={`mt-3 self-start text-left text-[0.82rem] ${t.muted}`}
        >
          No words saved yet — add some
        </button>
      ) : (
        <>
          <ul className="m-0 mt-3 flex min-h-0 flex-1 list-none flex-col justify-center gap-1 p-0">
            {picked.map((word) => (
              <Word
                key={word.term}
                t={t}
                word={word}
                open={hovered === word.term || pinned === word.term}
                onHover={(on) => setHovered(on ? word.term : null)}
                onToggle={() =>
                  setPinned((current) =>
                    current === word.term ? null : word.term
                  )
                }
              />
            ))}
          </ul>
          <p className={`m-0 mt-2 text-[0.62rem] ${t.faint}`}>
            Hover a word for its meaning
          </p>
        </>
      )}
    </section>
  );
}

interface WordProps {
  t: Theme;
  word: StoredWord;
  open: boolean;
  onHover: (on: boolean) => void;
  onToggle: () => void;
}

function Word({ t, word, open, onHover, onToggle }: WordProps) {
  return (
    <li
      className="relative"
      onPointerEnter={(e) => e.pointerType === "mouse" && onHover(true)}
      onPointerLeave={(e) => e.pointerType === "mouse" && onHover(false)}
      onFocusCapture={() => onHover(true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) onHover(false);
      }}
    >
      {open && (
        // Above the word rather than beside it: the row below has a word of its
        // own, and a meaning that opened downwards would cover the next thing
        // you were about to try to remember.
        <div
          className={`absolute bottom-full left-2 z-20 mb-1 w-max max-w-[calc(100%-1rem)] rounded-xl border px-3 py-1.5 text-[0.8rem] leading-snug ${t.popover}`}
        >
          {word.tr}
        </div>
      )}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        title="Show the meaning"
        className={`w-full cursor-pointer truncate rounded-lg border-none px-2 py-1 text-left text-[1.15rem] font-extralight leading-tight tracking-[-0.01em] outline-none transition-colors ${
          open ? t.sidebarCard : `bg-transparent ${t.rowHover}`
        }`}
      >
        {word.term}
      </button>
    </li>
  );
}
