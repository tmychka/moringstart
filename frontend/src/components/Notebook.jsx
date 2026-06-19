import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getNotes, createNote, updateNote, deleteNote } from '../api';

const BLUE = '#2563eb';
const TEXT = '#374151';
const MUTED = '#9ca3af';
const BORDER = '#e5e7eb';
const FONT = '-apple-system, "Segoe UI", Roboto, system-ui, sans-serif';

const fmtDate = (s) => {
  if (!s) return '';
  const d = new Date(s.replace(' ', 'T') + 'Z');
  return d.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
};

export default function Notebook({ id }) {
  const navigate = useNavigate();
  const [notes, setNotes] = useState([]);
  const [newContent, setNewContent] = useState('');
  const [editingId, setEditingId] = useState(null);   // note being text-edited
  const [editDraft, setEditDraft] = useState('');
  const [linkModeId, setLinkModeId] = useState(null);  // note with "Edit links" on
  const [activeWord, setActiveWord] = useState(null);  // { noteId, wordIndex, draft }

  useEffect(() => {
    getNotes(id).then(setNotes);
  }, [id]);

  const add = async () => {
    const content = newContent.trim();
    if (!content) return;
    const note = await createNote(id, content);
    setNotes((prev) => [note, ...prev]);
    setNewContent('');
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
    <div style={styles.page}>
      <div style={styles.container}>
        <button
          onClick={() => navigate('/')}
          style={styles.back}
          onMouseEnter={(e) => (e.currentTarget.style.color = TEXT)}
          onMouseLeave={(e) => (e.currentTarget.style.color = MUTED)}
        >
          ← Back
        </button>

        <h1 style={styles.title}>Programmer's Notebook</h1>
        <p style={styles.subtitle}>
          Track what you've learned. Tip: turn on “Edit links” to attach a URL to any word.
        </p>

        <div style={styles.composer}>
          <textarea
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            placeholder="What did you learn today?"
            rows={4}
            style={styles.textarea}
          />
          <button onClick={add} disabled={!newContent.trim()} style={styles.primaryBtn}>
            Add entry
          </button>
        </div>

        <div style={styles.list}>
          {notes.length === 0 && (
            <p style={styles.empty}>No entries yet. Add your first one above.</p>
          )}
          {notes.map((note) => (
            <article key={note.id} style={styles.card}>
              <div style={styles.cardHead}>
                <time style={styles.time}>{fmtDate(note.created_at)}</time>
                <div style={styles.actions}>
                  {editingId !== note.id && (
                    <>
                      <button
                        onClick={() => {
                          setLinkModeId(linkModeId === note.id ? null : note.id);
                          setActiveWord(null);
                        }}
                        style={linkModeId === note.id ? styles.toggleOn : styles.linkBtn}
                      >
                        {linkModeId === note.id ? 'Done linking' : 'Edit links'}
                      </button>
                      <button onClick={() => startEdit(note)} style={styles.linkBtn}>
                        Edit
                      </button>
                      <button onClick={() => remove(note.id)} style={styles.linkBtn}>
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
                    style={styles.textarea}
                  />
                  <div style={styles.editActions}>
                    <button
                      onClick={() => saveEdit(note)}
                      disabled={!editDraft.trim()}
                      style={styles.primaryBtn}
                    >
                      Save
                    </button>
                    <button onClick={() => setEditingId(null)} style={styles.ghostBtn}>
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
                      draft: note.links[wordIndex] || '',
                    })
                  }
                  onDraftChange={(draft) => setActiveWord((a) => ({ ...a, draft }))}
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

function NoteBody({ note, linkMode, activeWord, onWordClick, onDraftChange, onSaveLink, onCancelLink }) {
  const tokens = note.content.split(/(\s+)/);
  let wordIndex = -1;

  return (
    <p style={styles.body}>
      {tokens.map((token, i) => {
        if (/^\s+$/.test(token) || token === '') return <span key={i}>{token}</span>;
        wordIndex += 1;
        const wi = wordIndex;
        const url = note.links[wi];
        const isActive =
          activeWord && activeWord.noteId === note.id && activeWord.wordIndex === wi;

        const editor = isActive && (
          <span style={styles.popover}>
            <input
              autoFocus
              value={activeWord.draft}
              onChange={(e) => onDraftChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onSaveLink();
                if (e.key === 'Escape') onCancelLink();
              }}
              placeholder="https://…  (empty to remove)"
              style={styles.popoverInput}
            />
            <button onClick={onSaveLink} style={styles.popoverSave}>Save</button>
            <button onClick={onCancelLink} style={styles.popoverCancel}>✕</button>
          </span>
        );

        if (linkMode) {
          return (
            <span key={i} style={styles.wordWrap}>
              <span
                onClick={() => onWordClick(wi)}
                style={url ? styles.editableLink : styles.editableWord}
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
            <a key={i} href={url} target="_blank" rel="noopener noreferrer" style={styles.link}>
              {token}
            </a>
          );
        }
        return <span key={i}>{token}</span>;
      })}
    </p>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    width: '100vw',
    overflowY: 'auto',
    background: '#ffffff',
    color: TEXT,
    fontFamily: FONT,
  },
  container: {
    maxWidth: 720,
    margin: '0 auto',
    padding: '40px 24px 80px',
  },
  back: {
    background: 'none',
    border: 'none',
    color: MUTED,
    fontSize: '0.7rem',
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    cursor: 'pointer',
    fontFamily: 'inherit',
    padding: 0,
    transition: 'color 0.2s',
  },
  title: {
    fontSize: '1.9rem',
    fontWeight: 600,
    margin: '20px 0 6px',
    color: '#111827',
  },
  subtitle: {
    margin: '0 0 28px',
    color: MUTED,
    fontSize: '0.92rem',
  },
  composer: { marginBottom: 32 },
  textarea: {
    width: '100%',
    resize: 'vertical',
    padding: '12px 14px',
    border: `1px solid ${BORDER}`,
    borderRadius: 10,
    fontSize: '0.95rem',
    fontFamily: 'inherit',
    color: TEXT,
    outline: 'none',
    lineHeight: 1.5,
  },
  primaryBtn: {
    marginTop: 10,
    background: BLUE,
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    padding: '9px 18px',
    fontSize: '0.9rem',
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  ghostBtn: {
    marginTop: 10,
    marginLeft: 8,
    background: 'none',
    color: MUTED,
    border: `1px solid ${BORDER}`,
    borderRadius: 8,
    padding: '9px 18px',
    fontSize: '0.9rem',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  list: { display: 'flex', flexDirection: 'column', gap: 16 },
  empty: { color: MUTED, fontSize: '0.92rem', textAlign: 'center', padding: '24px 0' },
  card: {
    border: `1px solid ${BORDER}`,
    borderRadius: 14,
    padding: '16px 18px',
    background: '#fff',
    boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
  },
  cardHead: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    gap: 12,
  },
  time: { color: MUTED, fontSize: '0.78rem' },
  actions: { display: 'flex', gap: 4, flexShrink: 0 },
  linkBtn: {
    background: 'none',
    border: 'none',
    color: MUTED,
    fontSize: '0.8rem',
    cursor: 'pointer',
    fontFamily: 'inherit',
    padding: '2px 6px',
    borderRadius: 6,
  },
  toggleOn: {
    background: '#eff6ff',
    border: 'none',
    color: BLUE,
    fontSize: '0.8rem',
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: 'inherit',
    padding: '2px 8px',
    borderRadius: 6,
  },
  editActions: { display: 'flex', alignItems: 'center' },
  body: { margin: 0, lineHeight: 1.7, fontSize: '0.96rem', whiteSpace: 'pre-wrap' },
  link: { color: BLUE, textDecoration: 'underline' },
  wordWrap: { position: 'relative', display: 'inline' },
  editableWord: {
    cursor: 'pointer',
    borderBottom: `1px dashed ${MUTED}`,
  },
  editableLink: {
    cursor: 'pointer',
    color: BLUE,
    textDecoration: 'underline',
  },
  popover: {
    position: 'absolute',
    top: '1.6em',
    left: 0,
    zIndex: 30,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    background: '#fff',
    border: `1px solid ${BORDER}`,
    borderRadius: 8,
    padding: 4,
    boxShadow: '0 6px 20px rgba(0,0,0,0.12)',
    whiteSpace: 'nowrap',
  },
  popoverInput: {
    width: 220,
    padding: '6px 8px',
    border: `1px solid ${BORDER}`,
    borderRadius: 6,
    fontSize: '0.85rem',
    fontFamily: 'inherit',
    outline: 'none',
  },
  popoverSave: {
    background: BLUE,
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    padding: '6px 12px',
    fontSize: '0.82rem',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  popoverCancel: {
    background: 'none',
    border: 'none',
    color: MUTED,
    fontSize: '0.9rem',
    cursor: 'pointer',
    padding: '0 4px',
  },
};
