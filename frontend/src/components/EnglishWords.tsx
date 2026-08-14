import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import AppSidebar from "./AppSidebar";
import type { QuickLink } from "./Sidebar";
import { cardClass, labelClass, numeralClass, useTheme } from "../theme";
import { readWords, writeWords } from "../englishWords";
import { ENGLISH_SECTIONS } from "../englishSections";
import type { MetricId, Theme } from "../types";

const FLASH_MS = 1800;
const VIEW_STORAGE_KEY = "english-view";

// Room a popover needs above a word before it flips underneath it, and half its
// widest size, which decides whether it can stay centred on the word.
const POPOVER_SPACE = 200;
const POPOVER_HALF = 140;

// The word grid sizes its own columns: as many as fit at this width, capped so a
// wide screen still reads as a page of words rather than a stripe of them.
const MIN_COLUMN_WIDTH = 175;
const MAX_COLUMNS = 6;

const columnsFor = (width: number) =>
  Math.max(1, Math.min(MAX_COLUMNS, Math.floor(width / MIN_COLUMN_WIDTH)));

const SPEECH_SUPPORTED =
  typeof window !== "undefined" && "speechSynthesis" in window;

type ViewName = "grid" | "list";

const VIEWS: { id: ViewName; label: string }[] = [
  { id: "grid", label: "Grid" },
  { id: "list", label: "List" },
];

/** A vocabulary entry. `id` is runtime-only; the rest is persisted. */
interface Word {
  id: number;
  term: string;
  tr: string;
  /** ms epoch, or 0 for entries saved before the field existed. */
  added: number;
}

/** Where a word's popover ended up, once the word's position was measured. */
interface Placement {
  below: boolean;
  align: "center" | "start" | "end";
}

// Entries are keyed by a runtime-only id so adding one doesn't remount (and
// re-animate) the rest of the list.
let idSeq = 0;
const nextId = () => ++idSeq;

const loadWords = (): Word[] =>
  readWords().map((w) => ({ id: nextId(), ...w }));

const readView = (): ViewName => {
  try {
    return localStorage.getItem(VIEW_STORAGE_KEY) === "list" ? "list" : "grid";
  } catch {
    return "grid";
  }
};

const normalize = (value: string) => value.trim().toLowerCase();

// "маленький, малий, трохи" is one stored string but three meanings; the popover
// stacks them so a glance separates them.
const translationLines = (tr: string): string[] => {
  const parts = tr
    .split(/[,;/•]/)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length ? parts : [tr];
};

const sinceLabel = (added: number, now: number): string => {
  if (!added) return "";
  const days = Math.floor((now - added) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
};

// "Added 3d ago" only shifts with the clock, so it reads it from a slow tick
// rather than from render.
function useNow(intervalMs = 60000): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);

  return now;
}

// Reads the term aloud. The browser picks the voice; asking for en-US keeps a
// Ukrainian-locale browser from pronouncing English words as Cyrillic.
const speakTerm = (text: string, onDone: () => void) => {
  if (!SPEECH_SUPPORTED) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-US";
  utterance.rate = 0.9;
  utterance.onend = onDone;
  utterance.onerror = onDone;
  synth.speak(utterance);
};

interface EnglishWordsProps {
  /** The metric this page is behind, so its sections can be linked by URL. */
  id: MetricId;
}

// Built from the section list so the sidebar can never drift from the routes.
const sectionLinksFor = (id: MetricId): QuickLink[] =>
  ENGLISH_SECTIONS.map((section) => ({
    icon: section.icon,
    label: section.label,
    to: `/metric/${id}/${section.slug}`,
  }));

export default function EnglishWords({ id }: EnglishWordsProps) {
  const { t } = useTheme();

  const [words, setWords] = useState<Word[]>(loadWords);
  const [term, setTerm] = useState("");
  const [translation, setTranslation] = useState("");
  const termInput = useRef<HTMLInputElement>(null);

  const [editId, setEditId] = useState<number | null>(null);
  const [editTerm, setEditTerm] = useState("");
  const [editTr, setEditTr] = useState("");

  const [query, setQuery] = useState("");
  const [view, setView] = useState<ViewName>(readView);

  // Which word is showing its translation. Hover is transient, a pinned word
  // survives the pointer leaving — that is what makes the grid work on touch.
  const [hoverId, setHoverId] = useState<number | null>(null);
  const [pinnedId, setPinnedId] = useState<number | null>(null);

  // Practice mode hides every translation; a word can be revealed on its own so
  // the page doubles as a self-test.
  const [practice, setPractice] = useState(false);
  const [revealed, setRevealed] = useState<ReadonlySet<number>>(new Set());
  const [speakingId, setSpeakingId] = useState<number | null>(null);
  const [flashId, setFlashId] = useState<number | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const wordRefs = useRef(new Map<number, HTMLLIElement>());

  // CSS multi-column would fill the grid top-to-bottom for free, but Chrome
  // positions absolute children of a fragmented box against the wrong origin,
  // which throws every popover across the page. An explicit row count with
  // column flow gives the same reading order and keeps positioning honest.
  // The element lives in state rather than a ref so the observer below is set up
  // and torn down with it.
  const [gridEl, setGridEl] = useState<HTMLUListElement | null>(null);
  const [columns, setColumns] = useState(1);

  useEffect(() => {
    if (!gridEl) return;
    const measure = () => setColumns(columnsFor(gridEl.clientWidth));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(gridEl);
    return () => observer.disconnect();
  }, [gridEl]);

  useEffect(() => {
    writeWords(words.map((w) => ({ term: w.term, tr: w.tr, added: w.added })));
  }, [words]);

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, view);
    } catch {
      // Persisting is best-effort; the choice still applies for this session.
    }
  }, [view]);

  const now = useNow();

  const visible = useMemo(() => {
    const needle = normalize(query);
    const matched = needle
      ? words.filter(
          (w) =>
            w.term.toLowerCase().includes(needle) ||
            w.tr.toLowerCase().includes(needle)
        )
      : words;
    return [...matched].sort((a, b) => a.term.localeCompare(b.term, "en"));
  }, [words, query]);

  const searching = query.trim() !== "";
  const openId = editId ?? pinnedId ?? hoverId;

  const closePopover = () => {
    setPinnedId(null);
    setHoverId(null);
  };

  // A pinned word stays open until something else is chosen, so tapping the page
  // (or pressing Escape) has to be the way out.
  useEffect(() => {
    if (pinnedId === null) return;

    const onDown = (e: Event) => {
      if (e.target instanceof Element && e.target.closest("[data-word-cell]")) {
        return;
      }
      setPinnedId(null);
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setPinnedId(null);
      setEditId(null);
    };

    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [pinnedId]);

  const focusWord = (id: number) => {
    setFlashId(id);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlashId(null), FLASH_MS);
    wordRefs.current
      .get(id)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  useEffect(
    () => () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
    },
    []
  );

  // Typing a word that already exists is nearly always a mistake, so the form
  // says so before the button is pressed.
  const duplicate = useMemo(() => {
    const needle = normalize(term);
    if (!needle) return null;
    return words.find((w) => normalize(w.term) === needle) ?? null;
  }, [words, term]);

  const add = (e: FormEvent) => {
    e.preventDefault();
    const nextTerm = term.trim();
    const nextTr = translation.trim();
    if (!nextTerm || !nextTr) return;

    if (duplicate) {
      focusWord(duplicate.id);
      return;
    }

    setWords((prev) => [
      { id: nextId(), term: nextTerm, tr: nextTr, added: Date.now() },
      ...prev,
    ]);
    setTerm("");
    setTranslation("");
    termInput.current?.focus();
  };

  const remove = (id: number) => {
    if (editId === id) setEditId(null);
    if (pinnedId === id) setPinnedId(null);
    setWords((prev) => prev.filter((w) => w.id !== id));
  };

  const speak = (word: Word) => {
    setSpeakingId(word.id);
    speakTerm(word.term, () =>
      setSpeakingId((current) => (current === word.id ? null : current))
    );
  };

  const toggleReveal = (id: number) => {
    setRevealed((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  };

  const togglePractice = () => {
    setPractice((on) => !on);
    setRevealed(new Set());
  };

  // Speech outlives the component otherwise: leaving the page mid-word would
  // keep talking over the dashboard.
  useEffect(
    () => () => {
      if (SPEECH_SUPPORTED) window.speechSynthesis.cancel();
    },
    []
  );

  // ----- editing -----
  const startEdit = (word: Word) => {
    setEditId(word.id);
    setEditTerm(word.term);
    setEditTr(word.tr);
    // Keeps the popover up once the pointer wanders off the word being edited.
    if (view === "grid") setPinnedId(word.id);
  };

  const cancelEdit = () => setEditId(null);

  const saveEdit = () => {
    const nextTerm = editTerm.trim();
    const nextTr = editTr.trim();
    if (!nextTerm || !nextTr) return;
    setWords((prev) =>
      prev.map((w) =>
        w.id === editId ? { ...w, term: nextTerm, tr: nextTr } : w
      )
    );
    setEditId(null);
  };

  // Shared by both views: whichever element holds the word takes the same keys.
  const onWordKeyDown = (e: KeyboardEvent<Element>, word: Word) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      remove(word.id);
    } else if (e.key.toLowerCase() === "s") {
      e.preventDefault();
      speak(word);
    } else if (e.key.toLowerCase() === "e") {
      e.preventDefault();
      startEdit(word);
    } else if (e.key === " " && practice) {
      e.preventDefault();
      toggleReveal(word.id);
    }
  };

  const onRowKeyDown = (e: KeyboardEvent<HTMLLIElement>, word: Word) => {
    // In the list a row is not a button, so Enter has nothing else to do.
    if (e.target === e.currentTarget && e.key === "Enter") {
      e.preventDefault();
      startEdit(word);
      return;
    }
    onWordKeyDown(e, word);
  };

  return (
    // The sidebar owns the way back and the theme switch, so the shell is the
    // same one Dashboard and Todos use: rail, then the page's own scroll column.
    <div
      className={`relative flex h-screen w-screen overflow-hidden transition-colors duration-300 ${t.page}`}
    >
      <AppSidebar variant="minimal" links={sectionLinksFor(id)} />

      <div className="h-full flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[1440px] px-5 pb-24 pt-6 sm:px-8">
          {/* Everything that acts on the whole page lives in one header row; below
            the sm breakpoint the search drops to a line of its own. */}
          <header className="flex flex-wrap items-center gap-x-3 gap-y-2.5">
            {words.length > 0 && (
              <label className="relative order-last w-full sm:order-none sm:w-auto sm:min-w-[220px] sm:max-w-[420px] sm:flex-1">
                <span
                  className={`pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 ${t.faint}`}
                >
                  <Icon name="search" className="h-4 w-4" />
                </span>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search word or translation…"
                  aria-label="Search vocabulary"
                  className={`w-full rounded-2xl border py-2 pl-11 pr-10 text-[0.88rem] outline-none transition-all ${t.input}`}
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    aria-label="Clear search"
                    className={`absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 cursor-pointer place-items-center rounded-full border-none bg-transparent transition-colors ${t.iconBtn}`}
                  >
                    <Icon name="close" className="h-3.5 w-3.5" />
                  </button>
                )}
              </label>
            )}

            <div className="ml-auto flex items-center gap-2.5">
              {words.length > 0 && (
                <>
                  {/* The count belongs with the control that changes it. */}
                  <p
                    className={`m-0 hidden text-[0.75rem] sm:block ${t.muted}`}
                  >
                    <span className={numeralClass}>
                      {searching
                        ? `${visible.length} of ${words.length}`
                        : words.length}
                    </span>{" "}
                    words
                  </p>
                  <Segmented
                    t={t}
                    options={VIEWS}
                    value={view}
                    onChange={(next) => {
                      closePopover();
                      setView(next);
                    }}
                  />
                </>
              )}
              <Chip
                t={t}
                active={practice}
                onClick={togglePractice}
                title="Keep translations hidden until you reveal them one by one"
              >
                <Icon
                  name={practice ? "eyeOff" : "eye"}
                  className="h-[15px] w-[15px]"
                />
                Practice
              </Chip>
            </div>
          </header>

          <form onSubmit={add} className={`${cardClass(t)} mt-5 p-4 sm:p-5`}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <label className="min-w-0 flex-1">
                <span className={labelClass(t)}>Word / text</span>
                <input
                  ref={termInput}
                  value={term}
                  onChange={(e) => setTerm(e.target.value)}
                  placeholder="to look forward to"
                  className={`mt-1.5 w-full rounded-2xl border px-4 py-2.5 text-[0.95rem] outline-none transition-all ${t.input}`}
                />
              </label>
              <label className="min-w-0 flex-1">
                <span className={labelClass(t)}>Translation</span>
                <input
                  value={translation}
                  onChange={(e) => setTranslation(e.target.value)}
                  placeholder="з нетерпінням чекати, очікувати"
                  className={`mt-1.5 w-full rounded-2xl border px-4 py-2.5 text-[0.95rem] outline-none transition-all ${t.input}`}
                />
              </label>
              <button
                type="submit"
                className={`shrink-0 cursor-pointer rounded-2xl border-none px-6 py-[11px] text-[0.66rem] uppercase tracking-[0.18em] transition-all hover:-translate-y-px active:translate-y-0 ${t.toggleOn}`}
              >
                {duplicate ? "Show" : "Add"}
              </button>
            </div>

            {duplicate && (
              <p
                className="m-0 mt-3 text-[0.72rem]"
                style={{ color: t.accent }}
              >
                «{duplicate.term}» вже у списку — покажу де
              </p>
            )}
          </form>

          {words.length === 0 ? (
            <p
              className={`mt-6 rounded-3xl border border-dashed px-5 py-10 text-center text-[0.85rem] ${t.rule} ${t.muted}`}
            >
              Ще нічого немає — додай перше слово ✎
            </p>
          ) : visible.length === 0 ? (
            <div
              className={`mt-3 rounded-3xl border border-dashed px-5 py-10 text-center ${t.rule}`}
            >
              <p className={`m-0 text-[0.85rem] ${t.muted}`}>
                Нічого не знайдено
              </p>
              <button
                type="button"
                onClick={() => setQuery("")}
                className={`mt-3 cursor-pointer rounded-xl border bg-transparent px-4 py-2 text-[0.66rem] uppercase tracking-[0.18em] transition-colors ${t.outlineBtn}`}
              >
                Reset
              </button>
            </div>
          ) : view === "grid" ? (
            // Column flow rather than row flow: words read top-to-bottom down each
            // column, the way a dictionary page does.
            <ul
              ref={setGridEl}
              className="mt-6 grid list-none gap-x-6 p-0"
              style={{
                gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                gridTemplateRows: `repeat(${Math.ceil(visible.length / columns)}, auto)`,
                gridAutoFlow: "column",
              }}
            >
              {visible.map((word) => (
                <WordCell
                  key={word.id}
                  t={t}
                  word={word}
                  query={query}
                  now={now}
                  open={openId === word.id}
                  pinned={pinnedId === word.id}
                  isEditing={editId === word.id}
                  editTerm={editTerm}
                  editTr={editTr}
                  onEditTermChange={setEditTerm}
                  onEditTrChange={setEditTr}
                  onStartEdit={() => startEdit(word)}
                  onSaveEdit={saveEdit}
                  onCancelEdit={cancelEdit}
                  onRemove={() => remove(word.id)}
                  onSpeak={() => speak(word)}
                  isSpeaking={speakingId === word.id}
                  hidden={practice && !revealed.has(word.id)}
                  practice={practice}
                  onToggleReveal={() => toggleReveal(word.id)}
                  flash={flashId === word.id}
                  cellRef={(el) => {
                    if (el) wordRefs.current.set(word.id, el);
                    else wordRefs.current.delete(word.id);
                  }}
                  onHover={(on) =>
                    setHoverId((current) =>
                      on ? word.id : current === word.id ? null : current
                    )
                  }
                  onTogglePin={() =>
                    setPinnedId((current) =>
                      current === word.id ? null : word.id
                    )
                  }
                  onKeyDown={(e) => onWordKeyDown(e, word)}
                />
              ))}
            </ul>
          ) : (
            <ul className="mt-6 flex list-none flex-col gap-2 p-0">
              {visible.map((word) => (
                <WordRow
                  key={word.id}
                  t={t}
                  word={word}
                  query={query}
                  now={now}
                  rowRef={(el) => {
                    if (el) wordRefs.current.set(word.id, el);
                    else wordRefs.current.delete(word.id);
                  }}
                  isEditing={editId === word.id}
                  editTerm={editTerm}
                  editTr={editTr}
                  onEditTermChange={setEditTerm}
                  onEditTrChange={setEditTr}
                  onStartEdit={() => startEdit(word)}
                  onSaveEdit={saveEdit}
                  onCancelEdit={cancelEdit}
                  onRemove={() => remove(word.id)}
                  onSpeak={() => speak(word)}
                  isSpeaking={speakingId === word.id}
                  hidden={practice && !revealed.has(word.id)}
                  practice={practice}
                  onToggleReveal={() => toggleReveal(word.id)}
                  flash={flashId === word.id}
                  onKeyDown={(e) => onRowKeyDown(e, word)}
                />
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

interface WordCellProps {
  t: Theme;
  word: Word;
  query: string;
  now: number;
  open: boolean;
  pinned: boolean;
  isEditing: boolean;
  editTerm: string;
  editTr: string;
  onEditTermChange: (value: string) => void;
  onEditTrChange: (value: string) => void;
  onStartEdit: () => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onRemove: () => void;
  onSpeak: () => void;
  isSpeaking: boolean;
  hidden: boolean;
  practice: boolean;
  onToggleReveal: () => void;
  flash: boolean;
  cellRef: (el: HTMLLIElement | null) => void;
  onHover: (open: boolean) => void;
  onTogglePin: () => void;
  onKeyDown: (e: KeyboardEvent<Element>) => void;
}

/** One word in the grid: just the term, with its meaning a hover away. */
function WordCell({
  t,
  word,
  query,
  now,
  open,
  pinned,
  isEditing,
  editTerm,
  editTr,
  onEditTermChange,
  onEditTrChange,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onRemove,
  onSpeak,
  isSpeaking,
  hidden,
  practice,
  onToggleReveal,
  flash,
  cellRef,
  onHover,
  onTogglePin,
  onKeyDown,
}: WordCellProps) {
  const wordRef = useRef<HTMLButtonElement>(null);
  const [placement, setPlacement] = useState<Placement>({
    below: false,
    align: "center",
  });

  // Measured before the popover opens, so it appears where it fits instead of
  // flipping into place a frame later.
  const measure = () => {
    const rect = wordRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPlacement({
      below: rect.top < POPOVER_SPACE,
      align:
        rect.left < POPOVER_HALF
          ? "start"
          : window.innerWidth - rect.right < POPOVER_HALF
            ? "end"
            : "center",
    });
  };

  const onFieldKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") onSaveEdit();
    if (e.key === "Escape") onCancelEdit();
  };

  const editInputClass = `w-full min-w-0 rounded-lg border px-2.5 py-1.5 text-[0.85rem] outline-none transition-all ${t.input}`;

  return (
    <li
      ref={cellRef}
      data-word-cell=""
      className="relative mb-0.5 break-inside-avoid list-none"
      onPointerEnter={(e) => {
        if (e.pointerType !== "mouse") return;
        measure();
        onHover(true);
      }}
      onPointerLeave={(e) => {
        if (e.pointerType !== "mouse") return;
        onHover(false);
      }}
      onFocusCapture={() => {
        measure();
        onHover(true);
      }}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) onHover(false);
      }}
    >
      <button
        ref={wordRef}
        type="button"
        onClick={() => {
          measure();
          onTogglePin();
        }}
        onKeyDown={onKeyDown}
        aria-expanded={open}
        style={
          flash
            ? { boxShadow: `0 0 0 2px ${t.accent}`, color: t.accent }
            : undefined
        }
        className={`w-full cursor-pointer rounded-lg border-none px-3 py-[7px] text-left text-[1.02rem] outline-none transition-colors ${
          open || pinned ? t.sidebarCard : `bg-transparent ${t.rowHover}`
        }`}
      >
        <Highlight text={word.term} query={query} t={t} />
      </button>

      {open && (
        // The wrapper carries the offset as padding rather than margin, so the
        // gap under the popover is still part of the cell — the pointer can
        // travel from the word to the buttons without leaving (and closing) it.
        <div
          className={`absolute z-30 ${
            placement.below ? "top-full pt-1.5" : "bottom-full pb-1.5"
          } ${
            placement.align === "center"
              ? "left-1/2 -translate-x-1/2"
              : placement.align === "start"
                ? "left-0"
                : "right-0"
          }`}
        >
          <div
            className={`w-max min-w-[9.5rem] max-w-[16rem] rounded-2xl border p-3 ${t.popover}`}
          >
            {isEditing ? (
              <div className="flex w-[13rem] flex-col gap-1.5">
                <input
                  value={editTerm}
                  onChange={(e) => onEditTermChange(e.target.value)}
                  onKeyDown={onFieldKeyDown}
                  aria-label="Word / text"
                  autoFocus
                  className={editInputClass}
                />
                <input
                  value={editTr}
                  onChange={(e) => onEditTrChange(e.target.value)}
                  onKeyDown={onFieldKeyDown}
                  aria-label="Translation"
                  className={editInputClass}
                />
                <div className="mt-0.5 flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={onSaveEdit}
                    className={`flex-1 cursor-pointer rounded-lg border-none px-2 py-1.5 text-[0.62rem] uppercase tracking-[0.14em] ${t.toggleOn}`}
                  >
                    Save
                  </button>
                  <RowButton
                    t={t}
                    icon="close"
                    label="Cancel editing"
                    onClick={onCancelEdit}
                    strong
                  />
                </div>
              </div>
            ) : (
              <>
                <div
                  className={`flex flex-col items-center gap-0.5 text-center transition-all ${
                    hidden ? "select-none blur-[5px]" : ""
                  }`}
                >
                  {translationLines(word.tr).map((line, i) => (
                    <span
                      key={line + i}
                      className={
                        i === 0 ? "text-[0.95rem]" : `text-[0.88rem] ${t.body}`
                      }
                    >
                      {line}
                    </span>
                  ))}
                </div>

                {word.added > 0 && (
                  <p
                    className={`m-0 mt-1.5 text-center text-[0.6rem] ${t.faint}`}
                  >
                    {sinceLabel(word.added, now)}
                  </p>
                )}

                <div
                  className={`mt-2 flex items-center justify-center gap-0.5 border-t pt-2 ${t.rule}`}
                >
                  {practice && (
                    <RowButton
                      t={t}
                      icon={hidden ? "eye" : "eyeOff"}
                      label={
                        hidden
                          ? `Reveal translation of ${word.term}`
                          : `Hide translation of ${word.term}`
                      }
                      onClick={onToggleReveal}
                      strong
                    />
                  )}
                  {SPEECH_SUPPORTED && (
                    <RowButton
                      t={t}
                      icon="sound"
                      label={`Pronounce ${word.term}`}
                      onClick={onSpeak}
                      active={isSpeaking}
                      strong
                    />
                  )}
                  <RowButton
                    t={t}
                    icon="pencil"
                    label={`Edit ${word.term}`}
                    onClick={onStartEdit}
                    strong
                  />
                  <RowButton
                    t={t}
                    icon="trash"
                    label={`Delete ${word.term}`}
                    onClick={onRemove}
                    strong
                  />
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </li>
  );
}

interface WordRowProps {
  t: Theme;
  word: Word;
  query: string;
  now: number;
  rowRef: (el: HTMLLIElement | null) => void;
  isEditing: boolean;
  editTerm: string;
  editTr: string;
  onEditTermChange: (value: string) => void;
  onEditTrChange: (value: string) => void;
  onStartEdit: () => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onRemove: () => void;
  onSpeak: () => void;
  isSpeaking: boolean;
  hidden: boolean;
  practice: boolean;
  onToggleReveal: () => void;
  flash: boolean;
  onKeyDown: (e: KeyboardEvent<HTMLLIElement>) => void;
}

function WordRow({
  t,
  word,
  query,
  now,
  rowRef,
  isEditing,
  editTerm,
  editTr,
  onEditTermChange,
  onEditTrChange,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onRemove,
  onSpeak,
  isSpeaking,
  hidden,
  practice,
  onToggleReveal,
  flash,
  onKeyDown,
}: WordRowProps) {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const onFieldKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") onSaveEdit();
    if (e.key === "Escape") onCancelEdit();
  };

  const editInputClass = `w-full min-w-0 rounded-xl border px-3 py-1.5 text-[0.95rem] outline-none transition-all ${t.input}`;

  return (
    <li
      ref={rowRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      style={
        flash
          ? { borderColor: t.accent, boxShadow: `0 0 0 4px ${t.accentSoft}` }
          : undefined
      }
      className={`group flex items-center gap-3 rounded-2xl border px-4 py-2.5 outline-none transition-all duration-300 ease-out ${t.card} ${t.cardHover} ${
        shown ? "translate-y-0 opacity-100" : "-translate-y-1.5 opacity-0"
      }`}
    >
      {isEditing ? (
        <>
          <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:gap-2.5">
            <input
              value={editTerm}
              onChange={(e) => onEditTermChange(e.target.value)}
              onKeyDown={onFieldKeyDown}
              aria-label="Word / text"
              autoFocus
              className={editInputClass}
            />
            <input
              value={editTr}
              onChange={(e) => onEditTrChange(e.target.value)}
              onKeyDown={onFieldKeyDown}
              aria-label="Translation"
              className={editInputClass}
            />
          </div>
          <button
            onClick={onSaveEdit}
            className={`shrink-0 cursor-pointer rounded-lg border-none px-2.5 py-1.5 text-[0.66rem] uppercase tracking-[0.14em] transition-all ${t.toggleOn}`}
          >
            Save
          </button>
          <RowButton
            t={t}
            icon="close"
            label="Cancel editing"
            onClick={onCancelEdit}
          />
        </>
      ) : (
        <>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-3">
            <span className="min-w-0 break-words text-[0.95rem]">
              <Highlight text={word.term} query={query} t={t} />
            </span>
            <span
              className={`hidden shrink-0 text-[0.8rem] sm:inline ${t.faint}`}
            >
              →
            </span>
            {hidden ? (
              <button
                type="button"
                onClick={onToggleReveal}
                className={`min-w-0 cursor-pointer rounded-lg border-none bg-transparent p-0 text-left text-[0.95rem] blur-[5px] transition-all hover:blur-[3px] ${t.body}`}
                aria-label={`Reveal translation of ${word.term}`}
              >
                {word.tr}
              </button>
            ) : (
              <span className={`min-w-0 break-words text-[0.95rem] ${t.body}`}>
                <Highlight text={word.tr} query={query} t={t} />
              </span>
            )}
          </div>

          {word.added > 0 && (
            <span
              className={`hidden shrink-0 text-[0.65rem] sm:block ${t.faint}`}
            >
              {sinceLabel(word.added, now)}
            </span>
          )}

          {practice && (
            <RowButton
              t={t}
              icon={hidden ? "eye" : "eyeOff"}
              label={
                hidden
                  ? `Reveal translation of ${word.term}`
                  : `Hide translation of ${word.term}`
              }
              onClick={onToggleReveal}
            />
          )}
          {SPEECH_SUPPORTED && (
            <RowButton
              t={t}
              icon="sound"
              label={`Pronounce ${word.term}`}
              onClick={onSpeak}
              active={isSpeaking}
            />
          )}
          <RowButton
            t={t}
            icon="pencil"
            label={`Edit ${word.term}`}
            onClick={onStartEdit}
          />
          <RowButton
            t={t}
            icon="trash"
            label={`Delete ${word.term}`}
            onClick={onRemove}
          />
        </>
      )}
    </li>
  );
}

/** Wraps every case-insensitive hit on `query` so a search says *why* a word matched. */
function Highlight({
  text,
  query,
  t,
}: {
  text: string;
  query: string;
  t: Theme;
}) {
  const needle = query.trim().toLowerCase();
  if (!needle) return <>{text}</>;

  const haystack = text.toLowerCase();
  const parts: ReactNode[] = [];
  let cursor = 0;
  let key = 0;

  for (;;) {
    const at = haystack.indexOf(needle, cursor);
    if (at === -1) {
      parts.push(text.slice(cursor));
      break;
    }
    if (at > cursor) parts.push(text.slice(cursor, at));
    parts.push(
      <mark
        key={key++}
        className="rounded-[3px] px-0.5 text-inherit"
        style={{ backgroundColor: t.accentSoft }}
      >
        {text.slice(at, at + needle.length)}
      </mark>
    );
    cursor = at + needle.length;
  }

  return <>{parts}</>;
}

/** A pill group where exactly one option is active. */
function Segmented<T extends string>({
  t,
  options,
  value,
  onChange,
}: {
  t: Theme;
  options: { id: T; label: string }[];
  value: T;
  onChange: (next: T) => void;
}) {
  return (
    <div className={`flex gap-1 rounded-full p-1 ${t.sidebarCard}`}>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          onClick={() => onChange(option.id)}
          aria-pressed={value === option.id}
          className={`cursor-pointer rounded-full border-none px-3.5 py-1.5 text-[0.72rem] transition-colors ${
            value === option.id ? t.toggleOn : t.toggleOff
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function Chip({
  t,
  active,
  onClick,
  title,
  children,
}: {
  t: Theme;
  active: boolean;
  onClick: () => void;
  title?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={`flex cursor-pointer items-center gap-1.5 rounded-full border-none px-3.5 py-2 text-[0.72rem] transition-colors ${
        active ? t.toggleOn : `${t.sidebarCard} ${t.toggleOff}`
      }`}
    >
      {children}
    </button>
  );
}

function RowButton({
  t,
  icon,
  label,
  onClick,
  active,
  strong,
}: {
  t: Theme;
  icon: IconName;
  label: string;
  onClick: () => void;
  active?: boolean;
  /** For popovers, where the buttons are the point rather than row furniture. */
  strong?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      style={active ? { color: t.accent } : undefined}
      className={`grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-full border-none bg-transparent p-0 transition-colors ${
        strong ? t.sidebarItem : t.iconBtn
      }`}
    >
      <Icon name={icon} className="h-[16px] w-[16px]" />
    </button>
  );
}

// 24×24 stroke icons drawn inline, matching the sidebar's set — no icon
// dependency, and they inherit the row's colour.
const ICONS = {
  sound: (
    <>
      <path d="M4.6 9.3h3.1L12 5.6v12.8l-4.3-3.7H4.6z" />
      <path d="M15.4 9.6a3.4 3.4 0 0 1 0 4.8M17.9 7a7 7 0 0 1 0 10" />
    </>
  ),
  eye: (
    <>
      <path d="M2.7 12S6.1 6.5 12 6.5 21.3 12 21.3 12 17.9 17.5 12 17.5 2.7 12 2.7 12Z" />
      <circle cx="12" cy="12" r="2.7" />
    </>
  ),
  eyeOff: (
    <>
      <path d="M4.2 4.4 19.8 19.6" />
      <path d="M9.8 7A9.6 9.6 0 0 1 12 6.7c5.9 0 9.3 5.5 9.3 5.5a17.4 17.4 0 0 1-3.6 4M6.6 8.6A17 17 0 0 0 2.7 12.2s3.4 5.5 9.3 5.5a9.5 9.5 0 0 0 2.9-.4" />
      <path d="M10.1 10.3a2.7 2.7 0 0 0 3.8 3.8" />
    </>
  ),
  pencil: (
    <>
      <path d="M16.3 4.7 19.3 7.7 8.9 18.1H5.9v-3z" />
      <path d="m14.3 6.7 3 3" />
    </>
  ),
  trash: (
    <>
      <path d="M4.9 6.9h14.2M9.7 6.9V5h4.6v1.9" />
      <path d="M6.8 6.9 7.8 19.2h8.4l1-12.3" />
      <path d="M10.4 10.2v5.6M13.6 10.2v5.6" />
    </>
  ),
  close: <path d="M6.6 6.6 17.4 17.4M17.4 6.6 6.6 17.4" />,
  search: (
    <>
      <circle cx="10.9" cy="10.9" r="6.2" />
      <path d="m15.5 15.5 4 4" />
    </>
  ),
} satisfies Record<string, ReactNode>;

type IconName = keyof typeof ICONS;

function Icon({
  name,
  className = "h-[18px] w-[18px]",
}: {
  name: IconName;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
      aria-hidden="true"
    >
      {ICONS[name]}
    </svg>
  );
}
