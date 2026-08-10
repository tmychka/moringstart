// Shapes of the SQLite rows and of the JSON the API sends back. The frontend
// mirrors the response half of this file in frontend/src/types.ts.

export const METRIC_TYPES = ['generic', 'steps', 'notebook'] as const;
export type MetricType = (typeof METRIC_TYPES)[number];

export const ROADMAP_STATUSES = ['upcoming', 'in_progress', 'done'] as const;
export type RoadmapStatus = (typeof ROADMAP_STATUSES)[number];

export interface Metric {
  id: number;
  name: string;
  type: MetricType;
  created_at: string;
}

/** A note as stored: `links` is still the raw JSON text from the column. */
export interface NoteRow {
  id: number;
  metric_id: number;
  content: string;
  links: string;
  /** Subject slug the note belongs to; '' means it sits on the metric itself. */
  topic: string;
  created_at: string;
  updated_at: string;
}

/** A note as sent to clients, with `links` parsed into word index → URL. */
export interface Note extends Omit<NoteRow, 'links'> {
  links: Record<string, string>;
}

export interface Milestone {
  id: number;
  metric_id: number;
  title: string;
  position: number;
  status: RoadmapStatus;
  created_at: string;
  updated_at: string;
}

/** Steps for one metric: the goal plus a date (YYYY-MM-DD) → step count map. */
export interface StepsPayload {
  goal: number;
  entries: Record<string, number>;
}

export interface ErrorBody {
  error: string;
}

// --- Workspace: folders → pages → blocks ---

export const BLOCK_TYPES = [
  'heading',
  'text',
  'bullets',
  'code',
  'checklist',
  'link',
  'image',
  'callout',
] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];

/**
 * A workspace is not a row of its own: it is the pair (metric, topic slug), so
 * the seven Developer subjects each get one without anything to keep in sync.
 */
export interface Folder {
  id: number;
  metric_id: number;
  topic: string;
  name: string;
  position: number;
  created_at: string;
}

export interface Page {
  id: number;
  folder_id: number;
  title: string;
  /** A single emoji shown next to the title; '' falls back to a generic mark. */
  icon: string;
  position: number;
  created_at: string;
  updated_at: string;
}

/** A block as stored: `content` is still the raw JSON text from the column. */
export interface BlockRow {
  id: number;
  page_id: number;
  type: BlockType;
  content: string;
  position: number;
  created_at: string;
  updated_at: string;
}

/** A block as sent to clients, with `content` parsed into its per-type shape. */
export interface Block extends Omit<BlockRow, 'content'> {
  content: Record<string, unknown>;
}

/** One request builds the whole navigation tree; blocks are fetched per page. */
export interface FolderWithPages extends Folder {
  pages: Page[];
}

export const isMetricType = (value: unknown): value is MetricType =>
  typeof value === 'string' && (METRIC_TYPES as readonly string[]).includes(value);

export const isRoadmapStatus = (value: unknown): value is RoadmapStatus =>
  typeof value === 'string' && (ROADMAP_STATUSES as readonly string[]).includes(value);

export const isBlockType = (value: unknown): value is BlockType =>
  typeof value === 'string' && (BLOCK_TYPES as readonly string[]).includes(value);
