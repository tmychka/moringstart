import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createFolder,
  createPage,
  deleteFolder,
  deletePage,
  getWorkspaceTree,
  updateFolder,
} from "../../api";
import PageView from "./PageView";
import type { DevTopic } from "../../developerTopics";
import type { FolderWithPages, MetricId, Page, Theme } from "../../types";

const OPEN_STORAGE_KEY = "workspace-open-folders";

const readOpen = (): Record<string, boolean> => {
  try {
    return JSON.parse(localStorage.getItem(OPEN_STORAGE_KEY) ?? "{}") as Record<
      string,
      boolean
    >;
  } catch {
    return {};
  }
};

interface WorkspaceProps {
  t: Theme;
  metricId: MetricId;
  topic: DevTopic;
  /** Page id from the URL, so a page can be linked to directly. */
  pageId?: string;
  onSelectPage: (pageId: number | null) => void;
}

/**
 * One subject's workspace: a folder/page tree beside the page being read. The
 * workspace itself is not a record — it is the (metric, topic) pair — so opening
 * a subject that has never been used just shows an empty tree.
 */
export default function Workspace({
  t,
  metricId,
  topic,
  pageId,
  onSelectPage,
}: WorkspaceProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState<Record<string, boolean>>(readOpen);
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameDraft, setRenameDraft] = useState("");

  const treeKey = ["workspace", metricId, topic.slug];
  const {
    data: folders = [],
    isLoading,
    isFetching,
  } = useQuery({
    queryKey: treeKey,
    queryFn: () => getWorkspaceTree(metricId, topic.slug),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: treeKey });
  };

  useEffect(() => {
    try {
      localStorage.setItem(OPEN_STORAGE_KEY, JSON.stringify(open));
    } catch {
      // Persisting is best-effort; the choice still applies for this session.
    }
  }, [open]);

  const pages = useMemo(
    () => folders.flatMap((folder) => folder.pages),
    [folders]
  );
  const selected: Page | undefined = pages.find(
    (page) => String(page.id) === pageId
  );

  // A page that was open and then deleted (here or in another tab) would leave
  // the URL pointing at nothing, so fall back to the tree. `isFetching` rather
  // than `isLoading`: a freshly created page is navigated to while the tree is
  // still refetching, and it is genuinely missing until that lands.
  useEffect(() => {
    if (pageId && !isFetching && !selected) onSelectPage(null);
  }, [pageId, isFetching, selected, onSelectPage]);

  const addFolderMut = useMutation({
    mutationFn: () => createFolder(metricId, topic.slug, "New folder"),
    onSuccess: (folder) => {
      setOpen((state) => ({ ...state, [folder.id]: true }));
      setRenamingId(folder.id);
      setRenameDraft(folder.name);
      invalidate();
    },
  });
  const renameFolderMut = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) =>
      updateFolder(id, { name }),
    onSuccess: invalidate,
  });
  const removeFolderMut = useMutation({
    mutationFn: (id: number) => deleteFolder(id),
    onSuccess: (_data, id) => {
      // Everything under it went too; leave the page view if that included it.
      if (
        selected &&
        folders
          .find((f) => f.id === id)
          ?.pages.some((p) => p.id === selected.id)
      ) {
        onSelectPage(null);
      }
      invalidate();
    },
  });
  const addPageMut = useMutation({
    mutationFn: (folderId: number) => createPage(folderId, "Untitled"),
    onSuccess: (page) => {
      setOpen((state) => ({ ...state, [page.folder_id]: true }));
      invalidate();
      onSelectPage(page.id);
    },
  });
  const removePageMut = useMutation({
    mutationFn: (id: number) => deletePage(id),
    onSuccess: (_data, id) => {
      if (selected?.id === id) onSelectPage(null);
      invalidate();
    },
  });

  const commitRename = (id: number, fallback: string) => {
    const clean = renameDraft.trim();
    setRenamingId(null);
    if (clean && clean !== fallback)
      renameFolderMut.mutate({ id, name: clean });
  };

  return (
    <div className="flex h-full min-h-0 w-full">
      <aside
        className={`flex w-[248px] shrink-0 flex-col border-r ${t.rule} max-md:hidden`}
      >
        <div className="flex items-center gap-2 px-4 pb-2 pt-5">
          <span
            className={`flex-1 truncate text-[0.62rem] uppercase tracking-[0.18em] ${t.label}`}
          >
            {topic.label}
          </span>
          <button
            type="button"
            onClick={() => addFolderMut.mutate()}
            title="New folder"
            aria-label="New folder"
            className={`grid h-6 w-6 shrink-0 cursor-pointer place-items-center rounded-full border-none p-0 text-[0.85rem] transition-colors ${t.sidebarBadge}`}
          >
            +
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
          {isLoading && (
            <p className={`px-2 py-1.5 text-[0.76rem] ${t.muted}`}>Loading…</p>
          )}

          {!isLoading && folders.length === 0 && (
            <div
              className={`px-2 py-3 text-[0.76rem] leading-relaxed ${t.muted}`}
            >
              Nothing here yet. Start with a folder — say “Fundamentals” — and
              add pages inside it.
            </div>
          )}

          {folders.map((folder) => (
            <FolderRow
              key={folder.id}
              t={t}
              folder={folder}
              open={open[folder.id] ?? true}
              onToggle={() =>
                setOpen((state) => ({
                  ...state,
                  [folder.id]: !(state[folder.id] ?? true),
                }))
              }
              renaming={renamingId === folder.id}
              renameDraft={renameDraft}
              onRenameDraft={setRenameDraft}
              onStartRename={() => {
                setRenamingId(folder.id);
                setRenameDraft(folder.name);
              }}
              onCommitRename={() => commitRename(folder.id, folder.name)}
              onAddPage={() => addPageMut.mutate(folder.id)}
              onRemove={() => removeFolderMut.mutate(folder.id)}
              selectedPageId={selected?.id}
              onOpenPage={onSelectPage}
              onRemovePage={(id) => removePageMut.mutate(id)}
            />
          ))}
        </div>
      </aside>

      <div className="min-w-0 flex-1 overflow-y-auto">
        {selected ? (
          <PageView t={t} page={selected} onRenamed={invalidate} />
        ) : (
          <Empty
            t={t}
            topic={topic}
            hasFolders={folders.length > 0}
            pageCount={pages.length}
            onAddFolder={() => addFolderMut.mutate()}
            onOpenFirst={() => pages[0] && onSelectPage(pages[0].id)}
          />
        )}
      </div>
    </div>
  );
}

function FolderRow({
  t,
  folder,
  open,
  onToggle,
  renaming,
  renameDraft,
  onRenameDraft,
  onStartRename,
  onCommitRename,
  onAddPage,
  onRemove,
  selectedPageId,
  onOpenPage,
  onRemovePage,
}: {
  t: Theme;
  folder: FolderWithPages;
  open: boolean;
  onToggle: () => void;
  renaming: boolean;
  renameDraft: string;
  onRenameDraft: (value: string) => void;
  onStartRename: () => void;
  onCommitRename: () => void;
  onAddPage: () => void;
  onRemove: () => void;
  selectedPageId?: number;
  onOpenPage: (id: number) => void;
  onRemovePage: (id: number) => void;
}) {
  return (
    <div className="mb-0.5">
      <div className="group flex items-center gap-0.5">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className={`flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 rounded-lg border-none bg-transparent px-2 py-1.5 text-left transition-colors ${t.sidebarItem}`}
        >
          <span
            className={`shrink-0 text-[0.6rem] transition-transform duration-200 ${open ? "" : "-rotate-90"}`}
          >
            ▾
          </span>
          {renaming ? (
            <input
              autoFocus
              value={renameDraft}
              onChange={(e) => onRenameDraft(e.target.value)}
              onBlur={onCommitRename}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === "Escape") {
                  e.currentTarget.blur();
                }
              }}
              aria-label="Folder name"
              className={`min-w-0 flex-1 rounded border px-1 py-0.5 text-[0.78rem] outline-none ${t.input}`}
            />
          ) : (
            <span className="min-w-0 flex-1 truncate text-[0.78rem] font-medium">
              {folder.name}
            </span>
          )}
        </button>
        <div className="flex shrink-0 items-center opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
          <Mini t={t} label="New page" onClick={onAddPage}>
            +
          </Mini>
          <Mini t={t} label="Rename folder" onClick={onStartRename}>
            ✎
          </Mini>
          <Mini t={t} label="Delete folder and its pages" onClick={onRemove}>
            ✕
          </Mini>
        </div>
      </div>

      {open && (
        <ul className="m-0 list-none p-0 pl-[18px]">
          {folder.pages.map((page) => (
            <li key={page.id} className="group/page flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => onOpenPage(page.id)}
                aria-current={selectedPageId === page.id ? "page" : undefined}
                className={`flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 rounded-lg border-none bg-transparent px-2 py-1.5 text-left text-[0.78rem] transition-colors ${
                  selectedPageId === page.id
                    ? t.sidebarItemActive
                    : t.sidebarItem
                }`}
              >
                <span className="shrink-0 text-[0.8rem] leading-none">
                  {page.icon || "📄"}
                </span>
                <span className="min-w-0 flex-1 truncate">{page.title}</span>
              </button>
              <div className="shrink-0 opacity-0 transition-opacity focus-within:opacity-100 group-hover/page:opacity-100">
                <Mini
                  t={t}
                  label="Delete page"
                  onClick={() => onRemovePage(page.id)}
                >
                  ✕
                </Mini>
              </div>
            </li>
          ))}
          {folder.pages.length === 0 && (
            <li className={`px-2 py-1 text-[0.72rem] ${t.faint}`}>No pages</li>
          )}
        </ul>
      )}
    </div>
  );
}

function Mini({
  t,
  label,
  onClick,
  children,
}: {
  t: Theme;
  label: string;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`grid h-6 w-6 cursor-pointer place-items-center rounded-md border-none bg-transparent p-0 text-[0.7rem] transition-colors ${t.iconBtn}`}
    >
      {children}
    </button>
  );
}

function Empty({
  t,
  topic,
  hasFolders,
  pageCount,
  onAddFolder,
  onOpenFirst,
}: {
  t: Theme;
  topic: DevTopic;
  hasFolders: boolean;
  pageCount: number;
  onAddFolder: () => void;
  onOpenFirst: () => void;
}) {
  return (
    <div className="mx-auto flex w-full max-w-[560px] flex-col items-start px-8 pt-24">
      <h2 className="m-0 text-[1.5rem] font-semibold tracking-[-0.01em]">
        {topic.label}
      </h2>
      <p className={`mb-6 mt-2 text-[0.9rem] leading-relaxed ${t.body}`}>
        {hasFolders
          ? "Pick a page on the left, or add one to a folder."
          : "A workspace for this subject: folders hold pages, pages hold blocks — text, code, checklists, callouts, links and images."}
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onAddFolder}
          className={`cursor-pointer rounded-2xl border-none px-5 py-2.5 text-[0.66rem] uppercase tracking-[0.18em] transition-all ${t.toggleOn}`}
        >
          New folder
        </button>
        {pageCount > 0 && (
          <button
            type="button"
            onClick={onOpenFirst}
            className={`cursor-pointer rounded-2xl border bg-transparent px-5 py-2.5 text-[0.66rem] uppercase tracking-[0.18em] transition-colors ${t.outlineBtn}`}
          >
            Open first page
          </button>
        )}
      </div>
    </div>
  );
}
