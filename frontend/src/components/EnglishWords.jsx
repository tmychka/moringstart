import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

const STORAGE_KEY = "english-words";

// Pointer has to travel this far before a press turns into a reorder drag —
// below it the gesture stays a plain click on the row's buttons.
const DRAG_THRESHOLD = 5;
// Touch has no hover, so a press is ambiguous between "scroll" and "drag".
// Holding still for this long resolves it in favour of a drag.
const TOUCH_HOLD_MS = 350;

const inputClass =
  "w-full rounded-2xl border border-[#e8eaee] bg-[#fafbfc] px-4 py-3 text-[0.95rem] text-[#16171a] outline-none transition-all placeholder:text-[#c3c7cd] focus:border-[#d7dae0] focus:bg-white focus:ring-4 focus:ring-[#16171a]/[0.04]";
const editInputClass =
  "w-full min-w-0 rounded-xl border border-[#e8eaee] bg-[#fafbfc] px-3 py-1.5 text-[0.95rem] text-[#16171a] outline-none transition-all placeholder:text-[#c3c7cd] focus:border-[#d7dae0] focus:bg-white focus:ring-4 focus:ring-[#16171a]/[0.04]";
const labelClass =
  "mb-1.5 block text-[0.62rem] uppercase tracking-[0.18em] text-[#a6abb2]";
const captionClass = "text-[0.62rem] uppercase tracking-[0.2em] text-[#a6abb2]";
const rowBtnClass =
  "grid h-7 w-7 shrink-0 cursor-pointer place-items-center rounded-full border-none bg-transparent text-[0.95rem] leading-none text-[#c3c7cd] transition-colors hover:bg-[#f4f5f7] hover:text-[#6b7076]";

// Rows are keyed by a runtime-only id so prepending an item doesn't remount (and
// re-animate) the rest of the list. Only { term, tr } is persisted.
let idSeq = 0;
const nextId = () => ++idSeq;

// Rows keep their default touch-action so the list still scrolls with a finger;
// once a drag is live this keeps the scroll from stealing the gesture.
const blockScroll = (e) => e.preventDefault();

// Vertical translation currently applied to the element, in px.
const appliedOffset = (el) =>
  new DOMMatrixReadOnly(getComputedStyle(el).transform).m42;

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

  const [editId, setEditId] = useState(null);
  const [editTerm, setEditTerm] = useState("");
  const [editTr, setEditTr] = useState("");

  const [dragId, setDragId] = useState(null);
  const [dragOffset, setDragOffset] = useState(0);
  const rowRefs = useRef(new Map());
  const drag = useRef(null); // { id, pointerY, pointerId, moved, holdTimer }

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

  const remove = (id) => {
    if (editId === id) setEditId(null);
    setWords((prev) => prev.filter((w) => w.id !== id));
  };

  // ----- editing -----
  const startEdit = (word) => {
    setEditId(word.id);
    setEditTerm(word.term);
    setEditTr(word.tr);
  };

  const cancelEdit = () => setEditId(null);

  const saveEdit = () => {
    const t = editTerm.trim();
    const tr = editTr.trim();
    if (!t || !tr) return;
    setWords((prev) =>
      prev.map((w) => (w.id === editId ? { ...w, term: t, tr } : w))
    );
    setEditId(null);
  };

  // ----- reordering -----
  const move = (id, dir) => {
    setWords((prev) => {
      const ci = prev.findIndex((w) => w.id === id);
      const ni = ci + dir;
      if (ci === -1 || ni < 0 || ni >= prev.length) return prev;
      const next = [...prev];
      next.splice(ni, 0, next.splice(ci, 1)[0]);
      return next;
    });
  };

  const beginDrag = (st) => {
    st.moved = true;
    if (st.el.setPointerCapture) st.el.setPointerCapture(st.pointerId);
    document.addEventListener("touchmove", blockScroll, { passive: false });
    setDragId(st.id);
    setDragOffset(0);
  };

  const endDrag = () => {
    const st = drag.current;
    drag.current = null;
    if (!st) return;
    if (st.holdTimer !== null) clearTimeout(st.holdTimer);
    if (!st.moved) return;
    if (st.el.hasPointerCapture?.(st.pointerId)) {
      st.el.releasePointerCapture(st.pointerId);
    }
    document.removeEventListener("touchmove", blockScroll);
    setDragId(null);
    setDragOffset(0);
  };

  useEffect(
    () => () => {
      if (drag.current?.holdTimer) clearTimeout(drag.current.holdTimer);
      document.removeEventListener("touchmove", blockScroll);
    },
    []
  );

  const onRowPointerDown = (e, id) => {
    if (e.button !== 0 || editId !== null) return;
    if (e.target.closest("button, input")) return;
    const st = {
      id,
      el: e.currentTarget,
      pointerId: e.pointerId,
      pointerY: e.clientY,
      moved: false,
      holdTimer: null,
    };
    drag.current = st;
    if (e.pointerType === "touch") {
      st.holdTimer = setTimeout(() => {
        st.holdTimer = null;
        if (drag.current === st) beginDrag(st);
      }, TOUCH_HOLD_MS);
    }
  };

  const onRowPointerMove = (e, id) => {
    const st = drag.current;
    if (!st || st.id !== id) return;

    if (!st.moved) {
      if (Math.abs(e.clientY - st.pointerY) < DRAG_THRESHOLD) return;
      // Touch that moves before the hold completes is a scroll, not a drag.
      if (st.holdTimer !== null) {
        clearTimeout(st.holdTimer);
        drag.current = null;
        return;
      }
      beginDrag(st);
    }

    const index = words.findIndex((w) => w.id === st.id);
    if (index === -1) return;

    let offset = e.clientY - st.pointerY;
    const rect = st.el.getBoundingClientRect();
    // The rect still carries the *previously rendered* offset, not the one just
    // computed — subtracting the transform actually on the element is what gives
    // the row's untransformed slot.
    const layoutTop = rect.top - appliedOffset(st.el);
    const center = layoutTop + offset + rect.height / 2;

    const dir = offset < 0 ? -1 : 1;
    const neighbour = words[index + dir];
    const nEl = neighbour && rowRefs.current.get(neighbour.id);
    if (nEl) {
      // Neighbour rects are read before React re-renders, so they still describe
      // the pre-swap layout — which is exactly what the compensation below assumes.
      const nRect = nEl.getBoundingClientRect();
      const nMid = nRect.top + nRect.height / 2;
      if (dir === -1 ? center < nMid : center > nMid) {
        // The row is about to take over the neighbour's slot; shift the pointer
        // origin by the same amount so it doesn't jump out from under the cursor.
        const nextTop =
          dir === -1 ? nRect.top : nRect.top + nRect.height - rect.height;
        st.pointerY += nextTop - layoutTop;
        offset = e.clientY - st.pointerY;
        move(st.id, dir);
      }
    }

    setDragOffset(offset);
  };

  const onRowKeyDown = (e, word) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      move(word.id, e.key === "ArrowUp" ? -1 : 1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      startEdit(word);
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      remove(word.id);
    }
  };

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
          <ul
            className={`mt-3 flex list-none flex-col gap-2.5 p-0 ${
              dragId !== null ? "select-none" : ""
            }`}
          >
            {words.map((word) => (
              <WordRow
                key={word.id}
                word={word}
                rowRef={(el) => {
                  if (el) rowRefs.current.set(word.id, el);
                  else rowRefs.current.delete(word.id);
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
                isDragging={dragId === word.id}
                dragOffset={dragOffset}
                draggable={editId === null}
                onPointerDown={(e) => onRowPointerDown(e, word.id)}
                onPointerMove={(e) => onRowPointerMove(e, word.id)}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                onKeyDown={(e) => onRowKeyDown(e, word)}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function WordRow({
  word,
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
  isDragging,
  dragOffset,
  draggable,
  onKeyDown,
  ...pointerHandlers
}) {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const onFieldKeyDown = (e) => {
    if (e.key === "Enter") onSaveEdit();
    if (e.key === "Escape") onCancelEdit();
  };

  return (
    <li
      ref={rowRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      {...pointerHandlers}
      // The drag transform has to be inline to follow the pointer, so it is only
      // set while dragging — otherwise it would override the mount animation.
      style={
        isDragging
          ? {
              transform: `translateY(${dragOffset}px)`,
              transition: "none",
              zIndex: 10,
            }
          : undefined
      }
      className={`flex items-start gap-3 rounded-[18px] border bg-white px-4 py-3.5 outline-none transition-all duration-300 ease-out focus-visible:border-[#d7dae0] focus-visible:ring-4 focus-visible:ring-[#16171a]/[0.04] ${
        shown ? "translate-y-0 opacity-100" : "-translate-y-1.5 opacity-0"
      } ${
        isDragging
          ? "relative border-[#d7dae0] cursor-grabbing shadow-[0_8px_24px_-8px_rgba(16,24,40,.22)]"
          : `border-[#eef0f3] ${draggable ? "cursor-grab" : ""}`
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
            className="shrink-0 cursor-pointer rounded-lg border-none bg-transparent px-1.5 py-1 text-[0.66rem] uppercase tracking-[0.14em] text-[#16171a] transition-colors hover:bg-[#f4f5f7]"
          >
            Save
          </button>
          <button
            onClick={onCancelEdit}
            aria-label="Cancel editing"
            className={rowBtnClass}
          >
            ✕
          </button>
        </>
      ) : (
        <>
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
            onClick={onStartEdit}
            aria-label={`Edit ${word.term}`}
            className={rowBtnClass}
          >
            ✎
          </button>
          <button
            onClick={onRemove}
            aria-label={`Delete ${word.term}`}
            className={rowBtnClass}
          >
            ×
          </button>
        </>
      )}
    </li>
  );
}
