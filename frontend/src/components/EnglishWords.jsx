import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

const STORAGE_KEY = "english-words";

const inputClass =
  "w-full rounded-2xl border border-[#e8eaee] bg-[#fafbfc] px-4 py-3 text-[0.95rem] text-[#16171a] outline-none transition-all placeholder:text-[#c3c7cd] focus:border-[#d7dae0] focus:bg-white focus:ring-4 focus:ring-[#16171a]/[0.04]";
const labelClass =
  "mb-1.5 block text-[0.62rem] uppercase tracking-[0.18em] text-[#a6abb2]";
const captionClass = "text-[0.62rem] uppercase tracking-[0.2em] text-[#a6abb2]";

// Rows are keyed by a runtime-only id so prepending an item doesn't remount (and
// re-animate) the rest of the list. Only { term, tr } is persisted.
let idSeq = 0;
const nextId = () => ++idSeq;

const loadWords = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((w) => typeof w?.term === "string" && typeof w?.tr === "string")
      .map((w) => ({ id: nextId(), term: w.term, tr: w.tr }));
  } catch {
    return [];
  }
};

export default function EnglishWords() {
  const navigate = useNavigate();
  const [words, setWords] = useState(loadWords);
  const [term, setTerm] = useState("");
  const [translation, setTranslation] = useState("");

  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(words.map(({ term: t, tr }) => ({ term: t, tr })))
    );
  }, [words]);

  const add = (e) => {
    e.preventDefault();
    const t = term.trim();
    const tr = translation.trim();
    if (!t || !tr) return;
    setWords((prev) => [{ id: nextId(), term: t, tr }, ...prev]);
    setTerm("");
    setTranslation("");
  };

  const remove = (id) => setWords((prev) => prev.filter((w) => w.id !== id));

  return (
    <div className="relative h-screen w-screen overflow-y-auto bg-gradient-to-b from-white via-[#fbfbfc] to-[#f4f5f7] text-[#16171a]">
      <button
        onClick={() => navigate("/")}
        className="absolute left-7 top-7 z-20 cursor-pointer border-none bg-transparent p-0 text-[0.65rem] uppercase tracking-[0.18em] text-[#16171a]/35 transition-colors hover:text-[#16171a]/75"
      >
        ← Back
      </button>

      <div className="mx-auto w-full max-w-[680px] px-5 pb-20 pt-[84px]">
        <header className="text-center">
          <h1 className="m-0 text-[2.1rem] font-extralight tracking-[0.02em]">
            English
          </h1>
          <p className="mt-3 text-[0.68rem] uppercase tracking-[0.22em] text-[#a6abb2]">
            Your vocabulary · word &amp; translation
          </p>
        </header>

        <form
          onSubmit={add}
          className="mt-9 rounded-[24px] border border-[#eceef1] bg-white p-[26px] shadow-[0_1px_2px_rgba(16,24,40,.04),0_12px_32px_-12px_rgba(16,24,40,.10)]"
        >
          <div className="flex flex-col gap-4 sm:flex-row">
            <label className="min-w-0 flex-1">
              <span className={labelClass}>Word / text</span>
              <input
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                placeholder="to look forward to"
                className={inputClass}
              />
            </label>
            <label className="min-w-0 flex-1">
              <span className={labelClass}>Translation</span>
              <input
                value={translation}
                onChange={(e) => setTranslation(e.target.value)}
                placeholder="з нетерпінням чекати"
                className={inputClass}
              />
            </label>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <p className="m-0 text-[0.72rem] text-[#a6abb2]">
              Enter — швидке додавання
            </p>
            <button
              type="submit"
              className="cursor-pointer rounded-xl border border-[#e4e6ea] bg-gradient-to-b from-white to-[#f6f7f9] px-5 py-2.5 text-[0.66rem] uppercase tracking-[0.18em] text-[#16171a] shadow-[0_1px_2px_rgba(16,24,40,.06)] transition-all hover:-translate-y-px hover:shadow-[0_5px_14px_-4px_rgba(16,24,40,.16)] active:translate-y-0"
            >
              Add
            </button>
          </div>
        </form>

        <div className="mt-10 flex items-center justify-between px-1">
          <span className={captionClass}>Saved</span>
          <span className={captionClass}>{words.length}</span>
        </div>

        {words.length === 0 ? (
          <p className="mt-3 rounded-[18px] border border-dashed border-[#e2e5e9] bg-[#fcfcfd] px-5 py-9 text-center text-[0.85rem] text-[#a6abb2]">
            Ще нічого немає — додай перше слово ✎
          </p>
        ) : (
          <ul className="mt-3 flex list-none flex-col gap-2.5 p-0">
            {words.map((word) => (
              <WordRow
                key={word.id}
                word={word}
                onRemove={() => remove(word.id)}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function WordRow({ word, onRemove }) {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <li
      className={`flex items-start gap-3 rounded-[18px] border border-[#eef0f3] bg-white px-4 py-3.5 transition-all duration-300 ease-out ${
        shown ? "translate-y-0 opacity-100" : "-translate-y-1.5 opacity-0"
      }`}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-3">
        <span className="min-w-0 break-words text-[0.95rem] text-[#16171a]">
          {word.term}
        </span>
        <span className="shrink-0 text-[0.85rem] text-[#c3c7cd]">→</span>
        <span className="min-w-0 break-words text-[0.95rem] text-[#6b7076]">
          {word.tr}
        </span>
      </div>
      <button
        onClick={onRemove}
        aria-label={`Delete ${word.term}`}
        className="grid h-7 w-7 shrink-0 cursor-pointer place-items-center rounded-full border-none bg-transparent text-[0.95rem] leading-none text-[#c3c7cd] transition-colors hover:bg-[#f4f5f7] hover:text-[#6b7076]"
      >
        ×
      </button>
    </li>
  );
}
