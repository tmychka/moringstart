/**
 * Three notes off the developer pile, changed every hour.
 *
 * The notes page holds everything ever written and is therefore read about as
 * often as an archive is. This is the other half of that: a few of them put in
 * front of you unasked, on a screen you already have open, which is what makes
 * them revision rather than storage. The draw turns over on the hour, and the
 * button beside it turns it over now.
 */
import { useMemo } from "react";
import ShuffleButton from "./ShuffleButton";
import { timeAgo } from "../dashboardStats";
import { topicBySlug } from "../developerTopics";
import { useHourly } from "../rotation";
import { cardClass, labelClass } from "../theme";
import type { Note, Theme } from "../types";

/** How many are shown at once. Two or three is a glance; five is a page. */
const DRAW = 3;

interface DevNotesProps {
  t: Theme;
  /** The dashboard's clock — the hour it falls in is what picks the notes. */
  now: Date;
  notes: Note[] | undefined;
  onOpen: () => void;
  className?: string;
}

export default function DevNotes({
  t,
  now,
  notes,
  onOpen,
  className = "",
}: DevNotesProps) {
  // An empty note is a row in the database, not something to revise.
  const written = useMemo(
    () => (notes ?? []).filter((note) => note.content.trim() !== ""),
    [notes]
  );
  const { picked, shuffle } = useHourly(written, DRAW, now);

  return (
    <section className={`${cardClass(t)} ${className} flex flex-col`}>
      <div className="flex items-baseline justify-between gap-3">
        <button
          type="button"
          onClick={onOpen}
          title="Open Learn to code"
          className={`${labelClass(t)} cursor-pointer border-none bg-transparent p-0 text-left transition-opacity hover:opacity-70`}
        >
          Revision · Learn to code
        </button>
        <span className="flex shrink-0 items-center gap-1.5">
          {written.length > 0 && (
            <p className={`m-0 text-[0.7rem] ${t.muted}`}>
              {picked.length} of {written.length}
            </p>
          )}
          <ShuffleButton t={t} label="Draw other notes" onClick={shuffle} />
        </span>
      </div>

      {picked.length === 0 ? (
        <p className={`m-0 mt-3 text-[0.78rem] ${t.muted}`}>
          Nothing written yet — notes from Learn to code turn up here.
        </p>
      ) : (
        <ul className="m-0 mt-3 flex min-h-0 flex-1 list-none flex-col gap-3 p-0">
          {picked.map((note) => (
            <li
              key={note.id}
              // The rule down the side groups a note with where it came from,
              // the same way the briefing marks a claim with its source.
              className="border-l pl-3"
              style={{ borderColor: t.accentSoft }}
            >
              <p className="m-0 line-clamp-4 whitespace-pre-wrap text-[0.82rem] leading-snug">
                {note.content}
              </p>
              <p className={`m-0 mt-1 text-[0.62rem] ${t.faint}`}>
                {subjectOf(note)} · {timeAgo(note.updated_at, now)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** The subject a note was filed under; hub notes belong to none. */
const subjectOf = (note: Note): string =>
  note.topic ? (topicBySlug(note.topic)?.label ?? note.topic) : "General";
