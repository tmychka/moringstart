import {
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { CODE_LANGS, tokenize, type TokenKind } from "../../highlight";
import type { BlockContent, BlockType, Theme } from "../../types";

const TOKEN_STYLE: Record<TokenKind, string> = {
  plain: "",
  comment: "italic opacity-50",
  string: "text-emerald-500",
  keyword: "text-violet-500",
  number: "text-amber-500",
};

const CALLOUT_TONES: {
  tone: NonNullable<BlockContent["tone"]>;
  label: string;
  mark: string;
  ring: string;
}[] = [
  { tone: "tip", label: "Tip", mark: "💡", ring: "border-l-violet-400" },
  { tone: "info", label: "Info", mark: "ℹ️", ring: "border-l-sky-400" },
  { tone: "warn", label: "Careful", mark: "⚠️", ring: "border-l-amber-400" },
];

/**
 * A textarea that is exactly as tall as its text. Blocks are edited in place, so
 * a fixed-height box with its own scrollbar would fight the page's.
 */
export function AutoTextarea({
  value,
  onChange,
  onBlur,
  onKeyDown,
  placeholder,
  className = "",
  inputRef,
}: {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  onKeyDown?: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  className?: string;
  inputRef?: (el: HTMLTextAreaElement | null) => void;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={(el) => {
        ref.current = el;
        inputRef?.(el);
      }}
      rows={1}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
      placeholder={placeholder}
      className={`w-full resize-none overflow-hidden border-none bg-transparent p-0 outline-none placeholder:opacity-40 ${className}`}
    />
  );
}

interface BlockProps {
  t: Theme;
  content: BlockContent;
  /** Local, on every keystroke. */
  onChange: (content: BlockContent) => void;
  /** Persisted — called when the block loses focus or settles. */
  onCommit: (content: BlockContent) => void;
}

export function HeadingBlock({ t, content, onChange, onCommit }: BlockProps) {
  const level = content.level === 3 ? 3 : 2;
  return (
    <div className="flex items-start gap-2">
      <button
        type="button"
        onClick={() => onCommit({ ...content, level: level === 2 ? 3 : 2 })}
        title="Switch heading size"
        className={`mt-1.5 shrink-0 cursor-pointer rounded-md border-none bg-transparent px-1.5 py-0.5 font-mono text-[0.7rem] transition-colors ${t.iconBtn}`}
      >
        H{level}
      </button>
      <AutoTextarea
        value={content.text ?? ""}
        onChange={(text) => onChange({ ...content, text })}
        onBlur={() => onCommit(content)}
        placeholder="Heading"
        className={
          level === 2
            ? "text-[1.35rem] font-semibold tracking-[-0.01em]"
            : "text-[1.08rem] font-semibold"
        }
      />
    </div>
  );
}

export function TextBlock({ t, content, onChange, onCommit }: BlockProps) {
  return (
    <AutoTextarea
      value={content.text ?? ""}
      onChange={(text) => onChange({ ...content, text })}
      onBlur={() => onCommit(content)}
      placeholder="Write something…"
      className={`text-[0.95rem] leading-[1.7] ${t.body}`}
    />
  );
}

/**
 * Shared list behaviour for bullets and checklists: Enter opens the next item,
 * Backspace on an empty one closes it and puts the caret back where it was.
 */
function useListKeys(
  count: number,
  insertAt: (index: number) => void,
  removeAt: (index: number) => void
) {
  const refs = useRef<(HTMLTextAreaElement | null)[]>([]);
  const focusRow = (index: number) => {
    // The row does not exist until React has flushed the insert.
    requestAnimationFrame(() => {
      const el = refs.current[Math.max(0, Math.min(index, count))];
      el?.focus();
      el?.setSelectionRange(el.value.length, el.value.length);
    });
  };

  const onKeyDown = (
    e: KeyboardEvent<HTMLTextAreaElement>,
    index: number,
    text: string
  ) => {
    if (e.key === "Enter") {
      e.preventDefault();
      insertAt(index + 1);
      focusRow(index + 1);
    } else if (e.key === "Backspace" && text === "" && count > 1) {
      e.preventDefault();
      removeAt(index);
      focusRow(index - 1);
    }
  };

  return {
    onKeyDown,
    setRef: (index: number) => (el: HTMLTextAreaElement | null) => {
      refs.current[index] = el;
    },
  };
}

export function BulletsBlock({ t, content, onChange, onCommit }: BlockProps) {
  const items = content.items?.length ? content.items : [""];
  const write = (next: string[]) => onCommit({ ...content, items: next });
  const { onKeyDown, setRef } = useListKeys(
    items.length,
    (i) => write([...items.slice(0, i), "", ...items.slice(i)]),
    (i) => write(items.filter((_, j) => j !== i))
  );

  return (
    <ul className="m-0 list-none p-0">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-2.5 py-[3px]">
          <span
            className="mt-[0.62em] h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: t.accentSoft }}
          />
          <AutoTextarea
            inputRef={setRef(i)}
            value={item}
            onChange={(text) =>
              onChange({
                ...content,
                items: items.map((v, j) => (j === i ? text : v)),
              })
            }
            onBlur={() => onCommit(content)}
            onKeyDown={(e) => onKeyDown(e, i, item)}
            placeholder="List item"
            className={`text-[0.95rem] leading-[1.6] ${t.body}`}
          />
        </li>
      ))}
    </ul>
  );
}

export function ChecklistBlock({ t, content, onChange, onCommit }: BlockProps) {
  const todos = content.todos?.length
    ? content.todos
    : [{ text: "", done: false }];
  const write = (next: typeof todos) => onCommit({ ...content, todos: next });
  const { onKeyDown, setRef } = useListKeys(
    todos.length,
    (i) =>
      write([
        ...todos.slice(0, i),
        { text: "", done: false },
        ...todos.slice(i),
      ]),
    (i) => write(todos.filter((_, j) => j !== i))
  );

  const done = todos.filter((todo) => todo.done).length;
  const named = todos.filter((todo) => todo.text.trim()).length;

  return (
    <div>
      {named > 0 && (
        <div className="mb-1.5 flex items-center gap-2.5">
          <div
            className="h-1 flex-1 overflow-hidden rounded-full"
            style={{ backgroundColor: t.track }}
          >
            <div
              className="h-full rounded-full transition-[width] duration-300"
              style={{
                width: `${(done / named) * 100}%`,
                backgroundColor: t.accent,
              }}
            />
          </div>
          <span className={`text-[0.7rem] tabular-nums ${t.muted}`}>
            {done}/{named}
          </span>
        </div>
      )}
      <ul className="m-0 list-none p-0">
        {todos.map((todo, i) => (
          <li key={i} className="flex items-start gap-2.5 py-[3px]">
            <button
              type="button"
              role="checkbox"
              aria-checked={todo.done}
              aria-label={todo.text || "Checklist item"}
              onClick={() =>
                write(
                  todos.map((v, j) => (j === i ? { ...v, done: !v.done } : v))
                )
              }
              className="mt-[0.28em] grid h-[15px] w-[15px] shrink-0 cursor-pointer place-items-center rounded-[5px] border p-0 transition-colors"
              style={{
                borderColor: todo.done ? t.accent : t.track,
                backgroundColor: todo.done ? t.accent : "transparent",
              }}
            >
              {todo.done && (
                <svg
                  viewBox="0 0 24 24"
                  className="h-2.5 w-2.5"
                  fill="none"
                  stroke="#fff"
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </button>
            <AutoTextarea
              inputRef={setRef(i)}
              value={todo.text}
              onChange={(text) =>
                onChange({
                  ...content,
                  todos: todos.map((v, j) => (j === i ? { ...v, text } : v)),
                })
              }
              onBlur={() => onCommit(content)}
              onKeyDown={(e) => onKeyDown(e, i, todo.text)}
              placeholder="To do"
              className={`text-[0.95rem] leading-[1.6] ${
                todo.done ? `line-through ${t.faint}` : t.body
              }`}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

export function CodeBlock({ t, content, onChange, onCommit }: BlockProps) {
  const [editing, setEditing] = useState(!content.code);
  const [copied, setCopied] = useState(false);
  const code = content.code ?? "";
  const lang = content.lang ?? "typescript";

  const copy = async () => {
    await navigator.clipboard?.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  return (
    <div
      className={`overflow-hidden rounded-2xl border ${t.rule} ${t.sidebarCard}`}
    >
      <div className={`flex items-center gap-2 border-b px-3 py-1.5 ${t.rule}`}>
        <select
          value={lang}
          onChange={(e) => onCommit({ ...content, lang: e.target.value })}
          aria-label="Code language"
          className={`cursor-pointer border-none bg-transparent text-[0.7rem] uppercase tracking-[0.12em] outline-none ${t.muted}`}
        >
          {CODE_LANGS.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => setEditing((on) => !on)}
            className={`cursor-pointer rounded-md border-none bg-transparent px-2 py-0.5 text-[0.7rem] transition-colors ${t.iconBtn}`}
          >
            {editing ? "Done" : "Edit"}
          </button>
          <button
            type="button"
            onClick={copy}
            className={`cursor-pointer rounded-md border-none bg-transparent px-2 py-0.5 text-[0.7rem] transition-colors ${t.iconBtn}`}
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>

      {editing ? (
        <AutoTextarea
          value={code}
          onChange={(next) => onChange({ ...content, code: next })}
          onBlur={() => onCommit(content)}
          placeholder="Paste or write code…"
          className="px-4 py-3 font-mono text-[0.82rem] leading-[1.6]"
        />
      ) : (
        <pre className="m-0 overflow-x-auto px-4 py-3 font-mono text-[0.82rem] leading-[1.6]">
          <code>
            {tokenize(code, lang).map((token, i) => (
              <span key={i} className={TOKEN_STYLE[token.kind]}>
                {token.text}
              </span>
            ))}
          </code>
        </pre>
      )}
    </div>
  );
}

export function CalloutBlock({ t, content, onChange, onCommit }: BlockProps) {
  const tone =
    CALLOUT_TONES.find((c) => c.tone === content.tone) ?? CALLOUT_TONES[0];
  const nextTone = () => {
    const i = CALLOUT_TONES.indexOf(tone);
    onCommit({
      ...content,
      tone: CALLOUT_TONES[(i + 1) % CALLOUT_TONES.length].tone,
    });
  };

  return (
    <div
      className={`flex items-start gap-3 rounded-xl border-l-[3px] py-2.5 pl-3 pr-3 ${tone.ring} ${t.sidebarCard}`}
    >
      <button
        type="button"
        onClick={nextTone}
        title={`${tone.label} — click to change`}
        className="mt-[1px] shrink-0 cursor-pointer border-none bg-transparent p-0 text-[0.95rem] leading-none"
      >
        {tone.mark}
      </button>
      <AutoTextarea
        value={content.text ?? ""}
        onChange={(text) => onChange({ ...content, text })}
        onBlur={() => onCommit(content)}
        placeholder="Something worth remembering…"
        className={`text-[0.9rem] leading-[1.6] ${t.body}`}
      />
    </div>
  );
}

export function LinkBlock({ t, content, onChange, onCommit }: BlockProps) {
  const url = content.url ?? "";
  const href = url && !/^https?:\/\//i.test(url) ? `https://${url}` : url;

  return (
    <div
      className={`rounded-xl border px-3.5 py-2.5 ${t.rule} ${t.sidebarCard}`}
    >
      <div className="flex items-center gap-2">
        <AutoTextarea
          value={content.title ?? ""}
          onChange={(title) => onChange({ ...content, title })}
          onBlur={() => onCommit(content)}
          placeholder="What is this?"
          className="text-[0.9rem] font-medium"
        />
        {href && (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            title="Open in a new tab"
            className={`shrink-0 rounded-md px-2 py-0.5 text-[0.7rem] no-underline transition-colors ${t.iconBtn}`}
          >
            Open ↗
          </a>
        )}
      </div>
      <AutoTextarea
        value={url}
        onChange={(next) => onChange({ ...content, url: next })}
        onBlur={() => onCommit(content)}
        placeholder="https://…"
        className={`mt-0.5 text-[0.78rem] ${t.muted}`}
      />
    </div>
  );
}

export function ImageBlock({ t, content, onChange, onCommit }: BlockProps) {
  const url = content.url ?? "";
  const [broken, setBroken] = useState(false);

  return (
    <div>
      {url && !broken && (
        <img
          src={url}
          alt={content.caption ?? ""}
          onError={() => setBroken(true)}
          onLoad={() => setBroken(false)}
          className={`mb-1.5 max-h-[440px] w-full rounded-2xl border object-contain ${t.rule}`}
        />
      )}
      <AutoTextarea
        value={url}
        onChange={(next) => {
          setBroken(false);
          onChange({ ...content, url: next });
        }}
        onBlur={() => onCommit(content)}
        placeholder="Image URL"
        className={`text-[0.78rem] ${url && !broken ? t.faint : t.muted}`}
      />
      {url && broken && (
        <p className={`m-0 mt-1 text-[0.75rem] ${t.muted}`}>
          That URL didn&apos;t load as an image.
        </p>
      )}
      {url && !broken && (
        <AutoTextarea
          value={content.caption ?? ""}
          onChange={(caption) => onChange({ ...content, caption })}
          onBlur={() => onCommit(content)}
          placeholder="Caption"
          className={`text-[0.8rem] ${t.muted}`}
        />
      )}
    </div>
  );
}

/** Routes a block to its editor; unknown types are shown, never dropped. */
export function BlockBody({
  type,
  ...props
}: BlockProps & { type: BlockType }): ReactNode {
  switch (type) {
    case "heading":
      return <HeadingBlock {...props} />;
    case "text":
      return <TextBlock {...props} />;
    case "bullets":
      return <BulletsBlock {...props} />;
    case "checklist":
      return <ChecklistBlock {...props} />;
    case "code":
      return <CodeBlock {...props} />;
    case "callout":
      return <CalloutBlock {...props} />;
    case "link":
      return <LinkBlock {...props} />;
    case "image":
      return <ImageBlock {...props} />;
    default:
      return (
        <p className={`m-0 text-[0.85rem] ${props.t.muted}`}>
          Unsupported block ({type})
        </p>
      );
  }
}
