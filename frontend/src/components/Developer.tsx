import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getNotes, createNote, updateNote, deleteNote } from "../api";
import AppSidebar from "./AppSidebar";
import RoadmapTimeline from "./RoadmapTimeline";
import Workspace from "./workspace/Workspace";
import { cardClass, useTheme } from "../theme";
import { DEVELOPER } from "../areas";
import { DEV_TOPICS, type DevTopic } from "../developerTopics";
import type { SidebarLink } from "./Sidebar";
import type { MetricId, Note, NoteUpdate, Theme } from "../types";

const textareaClass = (t: Theme) =>
  `w-full resize-y rounded-2xl border px-4 py-3 text-[0.95rem] leading-[1.5] outline-none transition-all ${t.input}`;
// The row of small text actions on a note: quiet until the pointer is on them.
const linkBtnClass = (t: Theme) =>
  `cursor-pointer rounded-md border-none bg-transparent px-2 py-0.5 text-[0.8rem] transition-colors ${t.iconBtn}`;
const primaryBtnClass = (t: Theme) =>
  `cursor-pointer rounded-2xl border-none px-[18px] py-2.5 text-[0.66rem] uppercase tracking-[0.18em] transition-all disabled:cursor-default disabled:opacity-40 ${t.toggleOn}`;

const fmtDate = (s: string): string => {
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

/** The word whose link is currently being edited, across all notes. */
interface ActiveWord {
  noteId: number;
  wordIndex: number;
  draft: string;
}

interface DeveloperProps {
  /** The subject being read; without one the page is the hub over all of them. */
  topic?: DevTopic;
  /** Page id from the URL when a subject's workspace has one open. */
  pageId?: string;
}

// Built once from the topic list so the sidebar can never drift from the routes.
const TOPIC_LINKS: SidebarLink[] = DEV_TOPICS.map((topic) => ({
  icon: "code" as const,
  label: topic.label,
  to: `/${DEVELOPER.slug}/${topic.slug}`,
}));

/**
 * Two pages behind one component. Without a subject this is the hub — the
 * roadmap and the running note feed. With one it is that subject's workspace,
 * which owns its own two-pane layout and scrolling.
 */
export default function Developer({ topic, pageId }: DeveloperProps) {
  const { t } = useTheme();
  const navigate = useNavigate();
  // Notes, roadmap and workspaces are still filed under the metric row this
  // area has always used; only the URL above it changed.
  const id = DEVELOPER.metricId;

  return (
    // The sidebar owns the way back, so the shell is the one every other page
    // with a sidebar uses: rail, then the page's own scroll column.
    <div
      className={`relative flex h-screen w-screen overflow-hidden font-system transition-colors duration-300 ${t.page}`}
    >
      <AppSidebar variant="minimal" links={TOPIC_LINKS} />

      {topic ? (
        <Workspace
          t={t}
          metricId={id}
          topic={topic}
          pageId={pageId}
          onSelectPage={(next) =>
            navigate(
              next === null
                ? `/${DEVELOPER.slug}/${topic.slug}`
                : `/${DEVELOPER.slug}/${topic.slug}/${next}`,
              { replace: next === null }
            )
          }
        />
      ) : (
        <DeveloperHub t={t} id={id} />
      )}
    </div>
  );
}

/** The subject-less view: the roadmap across every subject, then every note. */
function DeveloperHub({ t, id }: { t: Theme; id: MetricId }) {
  const queryClient = useQueryClient();
  const { data: notes = [] } = useQuery({
    queryKey: ["notes", id],
    queryFn: () => getNotes(id),
  });
  const [newContent, setNewContent] = useState("");
  // note being text-edited
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState("");
  // note with "Edit links" on
  const [linkModeId, setLinkModeId] = useState<number | null>(null);
  const [activeWord, setActiveWord] = useState<ActiveWord | null>(null);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["notes", id] });

  const addMut = useMutation({
    // The hub writes untagged notes; subjects keep their material in blocks.
    mutationFn: (content: string) => createNote(id, content, ""),
    onSuccess: invalidate,
  });
  const updateMut = useMutation({
    mutationFn: ({ noteId, body }: { noteId: number; body: NoteUpdate }) =>
      updateNote(id, noteId, body),
    onSuccess: invalidate,
  });
  const removeMut = useMutation({
    mutationFn: (noteId: number) => deleteNote(id, noteId),
    onSuccess: invalidate,
  });

  const add = () => {
    const content = newContent.trim();
    if (!content) return;
    addMut.mutate(content, { onSuccess: () => setNewContent("") });
  };

  const remove = (noteId: number) => {
    removeMut.mutate(noteId);
    if (linkModeId === noteId) setLinkModeId(null);
    if (activeWord?.noteId === noteId) setActiveWord(null);
  };

  const startEdit = (note: Note) => {
    setEditingId(note.id);
    setEditDraft(note.content);
    setLinkModeId(null);
    setActiveWord(null);
  };

  const saveEdit = (note: Note) => {
    const content = editDraft.trim();
    if (!content) return;
    updateMut.mutate(
      { noteId: note.id, body: { content } },
      { onSuccess: () => setEditingId(null) }
    );
  };

  const saveLink = (note: Note) => {
    if (!activeWord) return;
    const { wordIndex, draft } = activeWord;
    const links = { ...note.links };
    const url = draft.trim();
    if (url) links[wordIndex] = url;
    else delete links[wordIndex];
    updateMut.mutate(
      { noteId: note.id, body: { links } },
      { onSuccess: () => setActiveWord(null) }
    );
  };

  return (
    <div className="h-full flex-1 overflow-y-auto">
      <div className="mx-auto px-6 pb-20 pt-10">
        <h1 className="mb-1.5 text-[1.9rem] font-semibold">Developer</h1>
        <p className={`mb-7 text-[0.92rem] ${t.muted}`}>
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
              className={`${textareaClass(t)} pb-16`}
            />
            <button
              onClick={add}
              disabled={!newContent.trim()}
              className={`absolute bottom-3 right-3 ${primaryBtnClass(t)}`}
            >
              Add entry
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          {notes.length === 0 && (
            <p className={`py-6 text-center text-[0.92rem] ${t.muted}`}>
              No entries yet. Add your first one above.
            </p>
          )}
          {notes.map((note) => (
            <article key={note.id} className={cardClass(t)}>
              <div className="mb-2.5 flex items-center justify-between gap-3">
                <time className={`text-[0.78rem] ${t.muted}`}>
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
                            ? `cursor-pointer rounded-md border-none px-2 py-0.5 text-[0.8rem] font-medium ${t.toggleOn}`
                            : linkBtnClass(t)
                        }
                      >
                        {linkModeId === note.id ? "Done linking" : "Edit links"}
                      </button>
                      <button
                        onClick={() => startEdit(note)}
                        className={linkBtnClass(t)}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => remove(note.id)}
                        className={linkBtnClass(t)}
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
                    className={textareaClass(t)}
                  />
                  <div className="mt-2.5 flex items-center gap-2">
                    <button
                      onClick={() => saveEdit(note)}
                      disabled={!editDraft.trim()}
                      className={primaryBtnClass(t)}
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className={`cursor-pointer rounded-2xl border bg-transparent px-[18px] py-2.5 text-[0.66rem] uppercase tracking-[0.18em] transition-colors ${t.outlineBtn}`}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <NoteBody
                  t={t}
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
                    setActiveWord((a) => (a ? { ...a, draft } : a))
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

/** A run of note text: whitespace has no `wordIndex`, every word gets the next one. */
interface Token {
  text: string;
  wordIndex: number | null;
}

const tokenize = (content: string): Token[] => {
  let counter = -1;
  return content.split(/(\s+)/).map((text) => {
    const isWord = !(/^\s+$/.test(text) || text === "");
    if (isWord) counter += 1;
    return { text, wordIndex: isWord ? counter : null };
  });
};

interface NoteBodyProps {
  t: Theme;
  note: Note;
  linkMode: boolean;
  activeWord: ActiveWord | null;
  onWordClick: (wordIndex: number) => void;
  onDraftChange: (draft: string) => void;
  onSaveLink: () => void;
  onCancelLink: () => void;
}

function NoteBody({
  t,
  note,
  linkMode,
  activeWord,
  onWordClick,
  onDraftChange,
  onSaveLink,
  onCancelLink,
}: NoteBodyProps) {
  const tokens = tokenize(note.content);

  return (
    <p className="m-0 whitespace-pre-wrap text-[0.96rem] leading-[1.7]">
      {tokens.map(({ text, wordIndex }, i) => {
        if (wordIndex === null) return <span key={i}>{text}</span>;
        const url = note.links[wordIndex];
        const isActive =
          activeWord !== null &&
          activeWord.noteId === note.id &&
          activeWord.wordIndex === wordIndex;

        const editor = isActive && (
          <span
            className={`absolute left-0 top-[1.6em] z-30 inline-flex items-center gap-1 whitespace-nowrap rounded-xl border p-1 ${t.popover}`}
          >
            <input
              autoFocus
              value={activeWord.draft}
              onChange={(e) => onDraftChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onSaveLink();
                if (e.key === "Escape") onCancelLink();
              }}
              placeholder="https://…  (empty to remove)"
              className={`w-[220px] rounded-lg border px-2.5 py-1.5 text-[0.85rem] outline-none transition-all ${t.input}`}
            />
            <button
              onClick={onSaveLink}
              className={`cursor-pointer rounded-lg border-none px-3 py-1.5 text-[0.82rem] ${t.toggleOn}`}
            >
              Save
            </button>
            <button
              onClick={onCancelLink}
              className={`cursor-pointer rounded-lg border-none bg-transparent px-1.5 py-1 text-[0.9rem] transition-colors ${t.iconBtn}`}
            >
              ✕
            </button>
          </span>
        );

        if (linkMode) {
          return (
            <span key={i} className="relative inline">
              <span
                onClick={() => onWordClick(wordIndex)}
                className={
                  url
                    ? "cursor-pointer underline"
                    : "cursor-pointer border-b border-dashed"
                }
                // A word with a link is the accent; one without only gets a
                // hint of it under the text.
                style={
                  url ? { color: t.accent } : { borderColor: t.accentSoft }
                }
                title="Click to set a link"
              >
                {text}
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
              className="underline"
              style={{ color: t.accent }}
            >
              {text}
            </a>
          );
        }
        return <span key={i}>{text}</span>;
      })}
    </p>
  );
}
