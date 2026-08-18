// Shapes of the SQLite rows and of the JSON the API sends back. The frontend
// mirrors the response half of this file in frontend/src/types.ts.

export const ROADMAP_STATUSES = ['upcoming', 'in_progress', 'done'] as const;
export type RoadmapStatus = (typeof ROADMAP_STATUSES)[number];

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

// --- Profile: the person the areas all hang off ---

/**
 * The regime the body is being run in. Unlike a status this is a closed set,
 * because it is what says which direction on the scale counts as progress.
 */
export const PROFILE_MODES = ['cut', 'maintain', 'bulk'] as const;
export type ProfileMode = (typeof PROFILE_MODES)[number];

/** One entry in the status history: what was being done, and from when. */
export interface StatusEntry {
  id: number;
  status: string;
  at: string;
}

/** The profile as stored — a single row, always id 1. */
export interface ProfileRow {
  status: string;
  mode: ProfileMode;
  weight_goal: number;
  updated_at: string;
}

/** Everything the body map needs in one request. */
export interface ProfilePayload {
  status: string;
  mode: ProfileMode;
  /** Target weight in kg; 0 when none has been set. */
  weightGoal: number;
  updatedAt: string;
  /** Recent status changes, newest first. */
  log: StatusEntry[];
  /** Date (YYYY-MM-DD) → weight in kg. */
  weights: Record<string, number>;
}

export const isProfileMode = (value: unknown): value is ProfileMode =>
  typeof value === 'string' && (PROFILE_MODES as readonly string[]).includes(value);

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

export const isRoadmapStatus = (value: unknown): value is RoadmapStatus =>
  typeof value === 'string' && (ROADMAP_STATUSES as readonly string[]).includes(value);

export const isBlockType = (value: unknown): value is BlockType =>
  typeof value === 'string' && (BLOCK_TYPES as readonly string[]).includes(value);
