import { useState } from "react";
import type { BlockContent, BlockType } from "../../types";

/** What the "add block" menu offers, in the order it offers it. */
export const BLOCK_DEFS: {
  type: BlockType;
  label: string;
  hint: string;
  initial: BlockContent;
}[] = [
  {
    type: "heading",
    label: "Heading",
    hint: "Section title",
    initial: { text: "", level: 2 },
  },
  { type: "text", label: "Text", hint: "A paragraph", initial: { text: "" } },
  {
    type: "bullets",
    label: "Bulleted list",
    hint: "Loose points",
    initial: { items: [""] },
  },
  {
    type: "checklist",
    label: "Checklist",
    hint: "Things to do or learn",
    initial: { todos: [{ text: "", done: false }] },
  },
  {
    type: "code",
    label: "Code",
    hint: "Snippet with a Copy button",
    initial: { code: "", lang: "typescript" },
  },
  {
    type: "callout",
    label: "Callout",
    hint: "A gotcha worth remembering",
    initial: { text: "", tone: "tip" },
  },
  {
    type: "link",
    label: "Link",
    hint: "A reference to come back to",
    initial: { url: "", title: "" },
  },
  {
    type: "image",
    label: "Image",
    hint: "By URL",
    initial: { url: "", caption: "" },
  },
];

/**
 * Keeps a draft while a block is being typed into, and re-syncs when the saved
 * copy changes underneath it (a save, a refetch, another tab). The comparison
 * happens during render rather than in an effect, so a stale draft is never
 * painted for a frame first.
 */
export function useDraft(
  content: BlockContent,
  stamp: string
): [BlockContent, (patch: BlockContent) => void] {
  const [draft, setDraft] = useState(content);
  const [seen, setSeen] = useState(stamp);

  if (seen !== stamp) {
    setSeen(stamp);
    setDraft(content);
  }

  return [draft, (patch) => setDraft((d) => ({ ...d, ...patch }))];
}
