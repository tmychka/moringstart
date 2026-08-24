/**
 * The conversation with JARVIS.
 *
 * Answers are computed, not generated — see `chat.ts`. What this file owns is
 * the exchange: the transcript, the confirmation step before anything is
 * written, and saying plainly when a question wasn't understood.
 *
 * Writes always ask first. The app already has `Undo` on the status because a
 * mistaken entry is a real cost; a chat that silently wrote whatever it thought
 * it heard would be strictly worse than the field it replaces.
 */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ask, type PendingAction, type Reply } from "../chat";
import { labelClass } from "../theme";
import type { Signals } from "../briefing";
import type { Theme } from "../types";

/** One line of the transcript. */
interface Turn {
  id: number;
  from: "you" | "jarvis";
  text: string;
  /** Where a computed answer came from, shown the way the briefing shows it. */
  source?: string;
  /** Present while a write is waiting to be confirmed. */
  action?: PendingAction;
  /** Set once the offer has been answered, which retires the buttons. */
  settled?: "done" | "cancelled";
}

interface ChatProps {
  t: Theme;
  signals: Signals;
  onClose: () => void;
  /** Performs a confirmed write. Resolves when it has actually been saved. */
  onCommit: (action: PendingAction) => Promise<void>;
}

/**
 * A question worth one click.
 *
 * Two kinds, and the difference is the point: a prompt that is already a whole
 * question sends on click, and one that needs a period, a number or a name lands
 * in the field with the caret after it, so the click does the typing and you do
 * the deciding. The trailing ellipsis in the label is what tells the two apart
 * before you click — it means "this one will want more".
 *
 * Every `text` here is phrased the way `ask` reads it, so these double as the
 * worked examples the opening paragraph used to spell out.
 */
interface Prompt {
  label: string;
  text: string;
  /** Goes to the field to be finished instead of being sent. */
  fill?: true;
}

/**
 * The questions worth a click, grouped by what they read.
 *
 * Not everything `ask` can answer — a menu of every combination of topic and
 * period would be a wall you have to read rather than a shortcut you can reach
 * for. This is the shortlist; the rest is still there for anyone who types it,
 * and `HELP` in `chat.ts` is what states the full shape.
 *
 * Each `text` is phrased the way `ask` reads it — a question word where a
 * question is meant, none where an entry is.
 */
const GROUPS: { title: string; prompts: Prompt[] }[] = [
  {
    title: "Підсумок",
    prompts: [{ label: "Як справи", text: "як справи" }],
  },
  {
    title: "Кроки",
    prompts: [
      { label: "Сьогодні", text: "скільки кроків сьогодні" },
      { label: "Вчора", text: "скільки кроків вчора" },
      { label: "Цього тижня", text: "скільки кроків цього тижня" },
      {
        label: "Середнє за 30 днів",
        text: "скільки в середньому кроків за 30 днів",
      },
    ],
  },
  {
    title: "Вага",
    prompts: [
      { label: "Яка зараз", text: "яка вага" },
      { label: "Коли важився", text: "коли я востаннє важився" },
    ],
  },
  {
    title: "Англійська",
    prompts: [
      { label: "Слова цього тижня", text: "скільки слів цього тижня" },
      { label: "Слова цього місяця", text: "скільки слів цього місяця" },
    ],
  },
  {
    title: "Розробка",
    prompts: [
      { label: "Нотатки", text: "скільки нотаток" },
      { label: "Roadmap", text: "що по roadmap" },
    ],
  },
];

/**
 * The writes, kept out of the list on the left and put behind the + beside the
 * field instead.
 *
 * They belong there rather than among the questions: everything in the sidebar
 * only ever reads, and these are the only three that change anything. Sitting
 * next to the field also matches what they do — each one is a sentence you are
 * about to finish typing, not an answer you are about to be given.
 */
const ENTRIES: Prompt[] = [
  { label: "Кроки…", text: "кроки ", fill: true },
  { label: "Статус…", text: "статус ", fill: true },
  { label: "Зняти статус", text: "стоп" },
];

export default function Chat({ t, signals, onClose, onCommit }: ChatProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const tailRef = useRef<HTMLDivElement>(null);
  const nextId = useRef(1);

  const [draft, setDraft] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [entriesOpen, setEntriesOpen] = useState(false);
  /** Set when a prompt has just been dropped in the field, cleared on use. */
  const caretPending = useRef(false);

  useEffect(() => {
    inputRef.current?.focus();
    // Escape backs out one layer at a time: the menu first if it is open, and
    // only then the whole conversation. Closing both at once would make the key
    // feel like it overshot.
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (entriesOpen) setEntriesOpen(false);
      else onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, entriesOpen]);

  // Follow the tail as it grows, so the newest exchange is always in view.
  useEffect(() => {
    tailRef.current?.scrollIntoView({ block: "end" });
  }, [turns]);

  // A dropped-in prompt leaves the caret after its last character, ready to be
  // finished. Done once the new value has been committed to the DOM rather than
  // in the click handler, where the field is still showing the old one.
  useEffect(() => {
    if (!caretPending.current) return;
    caretPending.current = false;
    const field = inputRef.current;
    if (!field) return;
    field.focus();
    field.setSelectionRange(field.value.length, field.value.length);
  }, [draft]);

  const say = (turn: Omit<Turn, "id">) =>
    setTurns((prev) => [...prev, { ...turn, id: nextId.current++ }]);

  const send = (input: string) => {
    const text = input.trim();
    if (!text) return;
    setDraft("");
    say({ from: "you", text });

    const reply: Reply = ask(text, signals);
    say(
      reply.kind === "confirm"
        ? { from: "jarvis", text: reply.text, action: reply.action }
        : {
            from: "jarvis",
            text: reply.text,
            source: reply.kind === "answer" ? reply.source : undefined,
          }
    );
  };

  const take = (prompt: Prompt) => {
    setEntriesOpen(false);
    if (prompt.fill) {
      caretPending.current = true;
      setDraft(prompt.text);
      return;
    }
    send(prompt.text);
  };

  const settle = async (turn: Turn, agreed: boolean) => {
    if (!turn.action) return;
    // Retired first, so a second click can't fire the same write twice.
    setTurns((prev) =>
      prev.map((t0) =>
        t0.id === turn.id
          ? { ...t0, settled: agreed ? "done" : "cancelled" }
          : t0
      )
    );
    if (!agreed) {
      say({ from: "jarvis", text: "Гаразд, не записую." });
      return;
    }
    try {
      await onCommit(turn.action);
      say({ from: "jarvis", text: "Записав." });
    } catch {
      say({ from: "jarvis", text: "Не вдалося записати — спробуй ще раз." });
    }
  };

  // On the body, past the carousel's transform and the panel's backdrop-blur,
  // either of which would otherwise capture this dialog's fixed positioning.
  //
  // Two columns, the whole width of the screen: the menu of what can be asked
  // down the left, and the conversation taking everything left over. The list is
  // long enough that a row of chips could only ever show a slice of it, and a
  // slice is exactly the wrong thing to show about a chat whose limits are the
  // thing worth knowing.
  return createPortal(
    <section
      role="dialog"
      aria-modal="true"
      aria-label="Chat with J.A.R.V.I.S."
      className={`fixed inset-0 z-50 flex ${t.surface}`}
    >
      <aside className={`flex w-[228px] shrink-0 flex-col border-r ${t.rule}`}>
        <div className={`shrink-0 border-b px-5 py-4 ${t.rule}`}>
          <p className={labelClass(t)}>J.A.R.V.I.S.</p>
          <p className={`m-0 mt-1 text-[0.7rem] ${t.faint}`}>
            рахує по твоїх записах
          </p>
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
          {GROUPS.map((group) => (
            <div key={group.title} className="mt-4 first:mt-0">
              <p
                className={`m-0 px-2 text-[0.52rem] uppercase tracking-[0.16em] ${t.faint}`}
              >
                {group.title}
              </p>
              <ul className="m-0 mt-1 list-none p-0">
                {group.prompts.map((prompt) => (
                  <li key={prompt.label}>
                    <button
                      type="button"
                      onClick={() => take(prompt)}
                      title={prompt.text.trim()}
                      className={`w-full cursor-pointer truncate rounded-lg border-none bg-transparent px-2 py-1 text-left text-[0.72rem] transition-colors ${t.toggleOff} ${t.rowHover}`}
                    >
                      {prompt.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header
          className={`flex shrink-0 items-center justify-end border-b px-8 py-4 ${t.rule}`}
        >
          <button
            type="button"
            onClick={onClose}
            className={`cursor-pointer rounded-lg border-none bg-transparent px-2 py-1 text-[0.72rem] transition-colors ${t.iconBtn}`}
          >
            Close
          </button>
        </header>

        {/* Takes the height whether or not it has anything in it, which is what
            keeps the field at the foot of the screen instead of floating under
            the header until the first question is asked. */}
        <div
          className={`min-h-0 flex-1 overflow-y-auto px-8 ${turns.length ? "py-5" : ""}`}
        >
          <ul className="m-0 list-none p-0">
            {turns.map((turn) => (
              <li key={turn.id} className="mt-4 first:mt-0">
                {turn.from === "you" ? (
                  <p
                    className={`m-0 whitespace-pre-wrap text-right text-[0.82rem] ${t.muted}`}
                  >
                    {turn.text}
                  </p>
                ) : (
                  <div
                    className="border-l pl-3"
                    style={{ borderColor: t.accentSoft }}
                  >
                    <p className="m-0 whitespace-pre-wrap text-[0.82rem] leading-snug">
                      {turn.text}
                    </p>
                    {turn.source && (
                      <p className={`m-0 mt-1 text-[0.62rem] ${t.faint}`}>
                        {turn.source}
                      </p>
                    )}
                    {turn.action && !turn.settled && (
                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          onClick={() => void settle(turn, true)}
                          className={`cursor-pointer rounded-lg border-none px-3 py-1 text-[0.72rem] font-medium transition-colors ${t.toggleOn}`}
                        >
                          Так
                        </button>
                        <button
                          type="button"
                          onClick={() => void settle(turn, false)}
                          className={`cursor-pointer rounded-lg border-none px-3 py-1 text-[0.72rem] transition-colors ${t.toggleOff} ${t.rowHover}`}
                        >
                          Ні
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
          <div ref={tailRef} />
        </div>

        <form
          className={`flex shrink-0 items-center gap-2 border-t px-8 py-5 ${t.rule}`}
          onSubmit={(event) => {
            event.preventDefault();
            send(draft);
          }}
        >
          <div className="relative shrink-0">
            {entriesOpen && (
              <>
                {/* Anywhere else dismisses it, which is what a click outside a
                    menu is expected to do and nothing more — the click does not
                    fall through to whatever it landed on. */}
                <button
                  type="button"
                  tabIndex={-1}
                  aria-hidden="true"
                  onClick={() => setEntriesOpen(false)}
                  className="fixed inset-0 cursor-default border-none bg-transparent p-0"
                />
                <div
                  role="menu"
                  aria-label="Записати"
                  className={`absolute bottom-full left-0 z-10 mb-2 min-w-[172px] rounded-xl border p-1.5 ${t.popover}`}
                >
                  <p
                    className={`m-0 px-2 pb-1 pt-1 text-[0.52rem] uppercase tracking-[0.16em] ${t.faint}`}
                  >
                    Записати
                  </p>
                  {ENTRIES.map((entry) => (
                    <button
                      key={entry.label}
                      type="button"
                      role="menuitem"
                      onClick={() => take(entry)}
                      title={entry.text.trim()}
                      className={`block w-full cursor-pointer rounded-lg border-none bg-transparent px-2 py-1 text-left text-[0.72rem] transition-colors ${t.toggleOff} ${t.rowHover}`}
                    >
                      {entry.label}
                    </button>
                  ))}
                </div>
              </>
            )}

            <button
              type="button"
              onClick={() => setEntriesOpen((open) => !open)}
              aria-haspopup="menu"
              aria-expanded={entriesOpen}
              aria-label="Записати"
              title="Записати"
              className={`flex h-[38px] w-[38px] cursor-pointer items-center justify-center rounded-xl border transition-colors ${t.input} ${t.rowHover}`}
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                aria-hidden="true"
                className={`transition-transform ${entriesOpen ? "rotate-45" : ""}`}
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
          </div>

          <input
            ref={inputRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value.slice(0, 200))}
            placeholder="Спитай або продиктуй запис…"
            aria-label="Повідомлення"
            className={`min-w-0 flex-1 rounded-xl border px-3 py-2 text-[0.85rem] outline-none transition-colors ${t.input}`}
          />
          <button
            type="submit"
            disabled={!draft.trim()}
            className={`shrink-0 rounded-xl border-none px-3 py-2 text-[0.75rem] transition-colors ${
              draft.trim() ? `cursor-pointer ${t.toggleOn}` : `${t.faint}`
            }`}
          >
            Send
          </button>
        </form>
      </div>
    </section>,
    document.body
  );
}
