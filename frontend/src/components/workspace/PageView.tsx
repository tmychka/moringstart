import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createBlock,
  deleteBlock,
  getBlocks,
  updateBlock,
  updatePage,
} from "../../api";
import { BlockBody } from "./blocks";
import { BLOCK_DEFS, useDraft } from "./blockDefs";
import type { Block, BlockContent, BlockType, Page, Theme } from "../../types";

const PAGE_ICONS = ["📄", "📘", "🧩", "⚡", "🎯", "🔧", "🧪", "🌱", "🔥", "⭐"];

interface PageViewProps {
  t: Theme;
  page: Page;
  onRenamed: () => void;
}

/** One page: its title, its icon and the ordered blocks that make it up. */
export default function PageView({ t, page, onRenamed }: PageViewProps) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(page.title);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [iconOpen, setIconOpen] = useState(false);

  // Re-sync the draft title when a different page opens, or when this one is
  // renamed elsewhere. Done during render so a stale title is never painted.
  const [seenTitle, setSeenTitle] = useState(`${page.id}:${page.title}`);
  const stamp = `${page.id}:${page.title}`;
  if (seenTitle !== stamp) {
    setSeenTitle(stamp);
    setTitle(page.title);
  }

  const { data: blocks = [], isLoading } = useQuery({
    queryKey: ["blocks", page.id],
    queryFn: () => getBlocks(page.id),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["blocks", page.id] });
  };

  const addMut = useMutation({
    mutationFn: ({
      type,
      content,
    }: {
      type: BlockType;
      content: BlockContent;
    }) => createBlock(page.id, type, content),
    onSuccess: () => {
      invalidate();
      onRenamed();
    },
  });
  const saveMut = useMutation({
    mutationFn: ({ id, content }: { id: number; content: BlockContent }) =>
      updateBlock(id, { content }),
    onSuccess: invalidate,
  });
  const removeMut = useMutation({
    mutationFn: (id: number) => deleteBlock(id),
    onSuccess: invalidate,
  });
  const pageMut = useMutation({
    mutationFn: (body: { title?: string; icon?: string }) =>
      updatePage(page.id, body),
    onSuccess: onRenamed,
  });

  // Reordering swaps the two neighbours' positions, which keeps every other row
  // untouched and needs no renumbering pass.
  const reorderMut = useMutation({
    mutationFn: async ({ a, b }: { a: Block; b: Block }) => {
      await updateBlock(a.id, { position: b.position });
      await updateBlock(b.id, { position: a.position });
    },
    onSuccess: invalidate,
  });

  const move = (index: number, delta: number) => {
    const a = blocks[index];
    const b = blocks[index + delta];
    if (!a || !b) return;
    // Equal positions would swap to no effect; fall back to the row indices.
    if (a.position === b.position) {
      void updateBlock(a.id, { position: index + delta }).then(() =>
        updateBlock(b.id, { position: index }).then(invalidate)
      );
      return;
    }
    reorderMut.mutate({ a, b });
  };

  const commitTitle = () => {
    const clean = title.trim();
    if (!clean || clean === page.title) {
      setTitle(page.title);
      return;
    }
    pageMut.mutate({ title: clean });
  };

  return (
    <div className="mx-auto w-full max-w-[820px] px-8 pb-32 pt-10">
      <div className="mb-6 flex items-start gap-3">
        <div className="relative">
          <button
            type="button"
            onClick={() => setIconOpen((open) => !open)}
            title="Change icon"
            className={`grid h-11 w-11 cursor-pointer place-items-center rounded-xl border-none bg-transparent p-0 text-[1.6rem] leading-none transition-colors ${t.rowHover}`}
          >
            {page.icon || "📄"}
          </button>
          {iconOpen && (
            <div
              className={`absolute left-0 top-12 z-30 grid w-[212px] grid-cols-5 gap-1 rounded-xl border p-2 ${t.popover}`}
            >
              {PAGE_ICONS.map((icon) => (
                <button
                  key={icon}
                  type="button"
                  onClick={() => {
                    pageMut.mutate({ icon });
                    setIconOpen(false);
                  }}
                  className={`grid h-9 w-9 cursor-pointer place-items-center rounded-lg border-none bg-transparent text-[1.1rem] transition-colors ${t.rowHover}`}
                >
                  {icon}
                </button>
              ))}
            </div>
          )}
        </div>

        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={commitTitle}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") setTitle(page.title);
          }}
          aria-label="Page title"
          className="mt-0.5 w-full border-none bg-transparent p-0 text-[2rem] font-semibold tracking-[-0.02em] outline-none placeholder:opacity-30"
          placeholder="Untitled"
        />
      </div>

      {isLoading ? (
        <p className={`text-[0.85rem] ${t.muted}`}>Loading…</p>
      ) : (
        <div className="flex flex-col gap-1">
          {blocks.map((block, i) => (
            <BlockRow
              key={block.id}
              t={t}
              block={block}
              first={i === 0}
              last={i === blocks.length - 1}
              onSave={(content) => saveMut.mutate({ id: block.id, content })}
              onRemove={() => removeMut.mutate(block.id)}
              onMoveUp={() => move(i, -1)}
              onMoveDown={() => move(i, 1)}
            />
          ))}
        </div>
      )}

      <div className="relative mt-3">
        <button
          type="button"
          onClick={() => setPickerOpen((open) => !open)}
          className={`flex w-full cursor-pointer items-center gap-2 rounded-xl border border-dashed bg-transparent px-3 py-2.5 text-[0.8rem] transition-colors ${t.rule} ${t.muted} ${t.rowHover}`}
        >
          <span className="text-[1rem] leading-none">+</span>
          Add a block
        </button>

        {pickerOpen && (
          <div
            className={`absolute left-0 top-12 z-30 w-[268px] rounded-xl border p-1.5 ${t.popover}`}
          >
            {BLOCK_DEFS.map((def) => (
              <button
                key={def.type}
                type="button"
                onClick={() => {
                  addMut.mutate({ type: def.type, content: def.initial });
                  setPickerOpen(false);
                }}
                className={`flex w-full cursor-pointer flex-col items-start gap-0.5 rounded-lg border-none bg-transparent px-2.5 py-1.5 text-left transition-colors ${t.rowHover}`}
              >
                <span className="text-[0.85rem]">{def.label}</span>
                <span className={`text-[0.72rem] ${t.muted}`}>{def.hint}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {pickerOpen && (
        <button
          type="button"
          aria-label="Close block menu"
          onClick={() => setPickerOpen(false)}
          className="fixed inset-0 z-20 cursor-default border-none bg-transparent p-0"
        />
      )}
      {iconOpen && (
        <button
          type="button"
          aria-label="Close icon menu"
          onClick={() => setIconOpen(false)}
          className="fixed inset-0 z-20 cursor-default border-none bg-transparent p-0"
        />
      )}
    </div>
  );
}

/** A block plus the controls that only show while the pointer is over it. */
function BlockRow({
  t,
  block,
  first,
  last,
  onSave,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  t: Theme;
  block: Block;
  first: boolean;
  last: boolean;
  onSave: (content: BlockContent) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const [draft, patch] = useDraft(block.content, block.updated_at);

  return (
    <div className="group relative rounded-lg px-1 py-0.5">
      <div className="absolute -top-1 right-0 z-10 flex items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
        <Ctl t={t} label="Move up" onClick={onMoveUp} disabled={first}>
          ↑
        </Ctl>
        <Ctl t={t} label="Move down" onClick={onMoveDown} disabled={last}>
          ↓
        </Ctl>
        <Ctl t={t} label="Delete block" onClick={onRemove}>
          ✕
        </Ctl>
      </div>

      <BlockBody
        t={t}
        type={block.type}
        content={draft}
        onChange={patch}
        // Blocks hand back the content they want kept, so an ordinary blur with
        // nothing typed compares equal and stays silent.
        onCommit={(content) => {
          patch(content);
          if (JSON.stringify(content) !== JSON.stringify(block.content)) {
            onSave(content);
          }
        }}
      />
    </div>
  );
}

function Ctl({
  t,
  label,
  onClick,
  disabled,
  children,
}: {
  t: Theme;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={`grid h-6 w-6 place-items-center rounded-md border-none p-0 text-[0.72rem] transition-colors disabled:opacity-25 ${t.sidebarCard} ${t.iconBtn} ${
        disabled ? "cursor-default" : "cursor-pointer"
      }`}
    >
      {children}
    </button>
  );
}
