import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getNotes, createNote, updateNote, deleteNote } from "../api";
import RoadmapTimeline from "./RoadmapTimeline";

const textareaClass =
  "w-full resize-y rounded-[10px] border border-gray-200 px-3.5 py-3 text-[0.95rem] leading-[1.5] text-gray-700 outline-none";
const linkBtnClass =
  "cursor-pointer rounded-md border-none bg-transparent px-1.5 py-0.5 text-[0.8rem] text-gray-400";

const fmtDate = (s) => {
  if (!s) return "";
  const d = new Date(s.replace(" ", "T") + "Z");
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export default function Notebook({ id }) {
  const navigate = useNavigate();
  const [notes, setNotes] = useState([]);
  const [newContent, setNewContent] = useState("");
  const [editingId, setEditingId] = useState(null); // note being text-edited
  const [editDraft, setEditDraft] = useState("");
  const [linkModeId, setLinkModeId] = useState(null); // note with "Edit links" on
  const [activeWord, setActiveWord] = useState(null); // { noteId, wordIndex, draft }

  useEffect(() => {
    getNotes(id).then(setNotes);
  }, [id]);

  const add = async () => {
    const content = newContent.trim();
    if (!content) return;
    const note = await createNote(id, content);
    setNotes((prev) => [note, ...prev]);
    setNewContent("");
  };

  const remove = async (noteId) => {
    await deleteNote(id, noteId);
    setNotes((prev) => prev.filter((n) => n.id !== noteId));
    if (linkModeId === noteId) setLinkModeId(null);
    if (activeWord?.noteId === noteId) setActiveWord(null);
  };

  const startEdit = (note) => {
    setEditingId(note.id);
    setEditDraft(note.content);
    setLinkModeId(null);
    setActiveWord(null);
  };

  const saveEdit = async (note) => {
    const content = editDraft.trim();
    if (!content) return;
    const updated = await updateNote(id, note.id, { content });
    setNotes((prev) => prev.map((n) => (n.id === note.id ? updated : n)));
    setEditingId(null);
  };

  const saveLink = async (note) => {
    const { wordIndex, draft } = activeWord;
    const links = { ...note.links };
    const url = draft.trim();
    if (url) links[wordIndex] = url;
    else delete links[wordIndex];
    const updated = await updateNote(id, note.id, { links });
    setNotes((prev) => prev.map((n) => (n.id === note.id ? updated : n)));
    setActiveWord(null);
  };

  return (
    <div className="h-screen w-screen overflow-y-auto bg-white font-system text-gray-700">
      <div className="mx-auto px-6 pb-20 pt-10">
        <button
          onClick={() => navigate("/")}
          className="cursor-pointer border-none bg-transparent p-0 text-[0.7rem] uppercase tracking-[0.12em] text-gray-400 transition-colors hover:text-gray-700"
        >
          ← Back
        </button>

        <h1 className="mb-1.5 mt-5 text-[1.9rem] font-semibold text-gray-900">
          Programmer&apos;s Notebook
        </h1>
        <p className="mb-7 text-[0.92rem] text-gray-400">
          Track what you&apos;ve learned. Tip: turn on “Edit links” to attach a
          URL to any word.
        </p>

        <RoadmapTimeline id={id} />

        <div className="mb-5">
          <div className="relative">
            <textarea
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              placeholder="What did you learn today?"
              rows={4}
              className={`${textareaClass} pb-12`}
            />
            <button
              onClick={add}
              disabled={!newContent.trim()}
              className="absolute bottom-2.5 right-2.5 cursor-pointer rounded-lg border border-gray-200 bg-white px-[18px] py-2 text-[0.9rem] font-semibold text-gray-700 shadow-[0_1px_2px_rgba(0,0,0,0.06)] transition-all enabled:hover:border-gray-300 enabled:hover:bg-gray-50 enabled:hover:shadow-[0_2px_8px_rgba(0,0,0,0.10)]"
            >
              Add entry
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          {notes.length === 0 && (
            <p className="py-6 text-center text-[0.92rem] text-gray-400">
              No entries yet. Add your first one above.
            </p>
          )}
          {notes.map((note) => (
            <article
              key={note.id}
              className="rounded-[14px] border border-gray-200 bg-white px-[18px] py-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)]"
            >
              <div className="mb-2.5 flex items-center justify-between gap-3">
                <time className="text-[0.78rem] text-gray-400">
                  {fmtDate(note.created_at)}
                </time>
                <div className="flex shrink-0 gap-1">
                  {editingId !== note.id && (
                    <>
                      <button
                        onClick={() => {
                          setLinkModeId(
                            linkModeId === note.id ? null : note.id
                          );
                          setActiveWord(null);
                        }}
                        className={
                          linkModeId === note.id
                            ? "cursor-pointer rounded-md border-none bg-blue-50 px-2 py-0.5 text-[0.8rem] font-medium text-blue-600"
                            : linkBtnClass
                        }
                      >
                        {linkModeId === note.id ? "Done linking" : "Edit links"}
                      </button>
                      <button
                        onClick={() => startEdit(note)}
                        className={linkBtnClass}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => remove(note.id)}
                        className={linkBtnClass}
                      >
                        Delete
                      </button>
                    </>
                  )}
                </div>
              </div>

              {editingId === note.id ? (
                <div>
                  <textarea
                    value={editDraft}
                    onChange={(e) => setEditDraft(e.target.value)}
                    rows={4}
                    className={textareaClass}
                  />
                  <div className="flex items-center">
                    <button
                      onClick={() => saveEdit(note)}
                      disabled={!editDraft.trim()}
                      className="mt-2.5 cursor-pointer rounded-lg border-none bg-[#333] px-[18px] py-[9px] text-[0.9rem] font-medium text-white"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="ml-2 mt-2.5 cursor-pointer rounded-lg border border-gray-200 bg-transparent px-[18px] py-[9px] text-[0.9rem] text-gray-400"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <NoteBody
                  note={note}
                  linkMode={linkModeId === note.id}
                  activeWord={activeWord}
                  onWordClick={(wordIndex) =>
                    setActiveWord({
                      noteId: note.id,
                      wordIndex,
                      draft: note.links[wordIndex] || "",
                    })
                  }
                  onDraftChange={(draft) =>
                    setActiveWord((a) => ({ ...a, draft }))
                  }
                  onSaveLink={() => saveLink(note)}
                  onCancelLink={() => setActiveWord(null)}
                />
              )}
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}

function NoteBody({
  note,
  linkMode,
  activeWord,
  onWordClick,
  onDraftChange,
  onSaveLink,
  onCancelLink,
}) {
  const tokens = note.content.split(/(\s+)/);
  const wordIndices = [];
  let counter = -1;
  for (const token of tokens) {
    const isWord = !(/^\s+$/.test(token) || token === "");
    counter += isWord ? 1 : 0;
    wordIndices.push(isWord ? counter : null);
  }

  return (
    <p className="m-0 whitespace-pre-wrap text-[0.96rem] leading-[1.7]">
      {tokens.map((token, i) => {
        if (/^\s+$/.test(token) || token === "")
          return <span key={i}>{token}</span>;
        const wi = wordIndices[i];
        const url = note.links[wi];
        const isActive =
          activeWord &&
          activeWord.noteId === note.id &&
          activeWord.wordIndex === wi;

        const editor = isActive && (
          <span className="absolute left-0 top-[1.6em] z-30 inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-gray-200 bg-white p-1 shadow-[0_6px_20px_rgba(0,0,0,0.12)]">
            <input
              autoFocus
              value={activeWord.draft}
              onChange={(e) => onDraftChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onSaveLink();
                if (e.key === "Escape") onCancelLink();
              }}
              placeholder="https://…  (empty to remove)"
              className="w-[220px] rounded-md border border-gray-200 px-2 py-1.5 text-[0.85rem] outline-none"
            />
            <button
              onClick={onSaveLink}
              className="cursor-pointer rounded-md border-none bg-blue-600 px-3 py-1.5 text-[0.82rem] text-white"
            >
              Save
            </button>
            <button
              onClick={onCancelLink}
              className="cursor-pointer border-none bg-transparent px-1 text-[0.9rem] text-gray-400"
            >
              ✕
            </button>
          </span>
        );

        if (linkMode) {
          return (
            <span key={i} className="relative inline">
              <span
                onClick={() => onWordClick(wi)}
                className={
                  url
                    ? "cursor-pointer text-blue-600 underline"
                    : "cursor-pointer border-b border-dashed border-gray-400"
                }
                title="Click to set a link"
              >
                {token}
              </span>
              {editor}
            </span>
          );
        }

        if (url) {
          return (
            <a
              key={i}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 underline"
            >
              {token}
            </a>
          );
        }
        return <span key={i}>{token}</span>;
      })}
    </p>
  );
}
