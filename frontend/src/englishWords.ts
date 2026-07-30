// The vocabulary list lives in localStorage rather than the API, and both the
// dashboard tile and the vocabulary page read it, so the shape and the tolerant
// parser are defined once here.

export const ENGLISH_STORAGE_KEY = "english-words";

/** A vocabulary entry as persisted. */
export interface StoredWord {
  term: string;
  tr: string;
  /** ms epoch. Entries written before this field existed report 0. */
  added: number;
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;

// `added` arrived after the first release, so an entry only has to carry the two
// text fields to count as valid; the rest is filled in. Anything else an older
// build wrote (a since-removed `learned` flag, say) is dropped on the next save.
const parseWord = (value: unknown): StoredWord | null => {
  const w = asRecord(value);
  if (!w || typeof w.term !== "string" || typeof w.tr !== "string") return null;
  return {
    term: w.term,
    tr: w.tr,
    added:
      typeof w.added === "number" && Number.isFinite(w.added) ? w.added : 0,
  };
};

export function readWords(): StoredWord[] {
  try {
    const parsed: unknown = JSON.parse(
      localStorage.getItem(ENGLISH_STORAGE_KEY) ?? "[]"
    );
    if (!Array.isArray(parsed)) return [];
    return parsed.map(parseWord).filter((w): w is StoredWord => w !== null);
  } catch {
    return [];
  }
}

export function writeWords(words: StoredWord[]) {
  try {
    localStorage.setItem(ENGLISH_STORAGE_KEY, JSON.stringify(words));
  } catch {
    // Storage can be blocked or full; the list still works for this session.
  }
}
