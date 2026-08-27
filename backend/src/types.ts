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

// --- Training: two routines, logged set by set ---

/**
 * Which routine a session is. Closed, like a profile mode: the exercises that
 * belong to each live in the frontend's plan, but the kind is what a stored
 * session is filed under, so the server has to know the set.
 */
export const WORKOUT_KINDS = ['strength', 'simple', 'plank', 'rope'] as const;
export type WorkoutKind = (typeof WORKOUT_KINDS)[number];

/** One set as performed. `weight` is 0 for the bodyweight routine. */
export interface WorkoutSet {
  id: number;
  session_id: number;
  /** Exercise slug from the frontend's plan — opaque here. */
  exercise: string;
  reps: number;
  weight: number;
  position: number;
  created_at: string;
}

/** A session as stored; `finished_at` is null while it is still running. */
export interface WorkoutSessionRow {
  id: number;
  metric_id: number;
  /** The client's local day, YYYY-MM-DD. */
  date: string;
  kind: WorkoutKind;
  finished_at: string | null;
  created_at: string;
}

/** A session as sent to clients: never without the sets it is made of. */
export interface WorkoutSession extends WorkoutSessionRow {
  sets: WorkoutSet[];
}

export const isWorkoutKind = (value: unknown): value is WorkoutKind =>
  typeof value === 'string' && (WORKOUT_KINDS as readonly string[]).includes(value);

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

// --- Marathon: a run of N days you commit to ---

/** The shortest and longest run the server will accept. */
export const MARATHON_MIN_DAYS = 1;
export const MARATHON_MAX_DAYS = 365;

/**
 * One thing the marathon asks of you. `day` null is a rule that applies to
 * every day of the run; a number 1…days pins it to that day alone.
 */
export interface MarathonItem {
  id: number;
  marathon_id: number;
  text: string;
  day: number | null;
  position: number;
  created_at: string;
}

/** One item marked done on one day. */
export interface MarathonTick {
  item_id: number;
  date: string;
}

/** The marathon as stored — the run itself, without what is in it. */
export interface MarathonRow {
  id: number;
  title: string;
  /** How long the run is, in days. */
  days: number;
  /** The local day it begins, YYYY-MM-DD. */
  start_date: string;
  created_at: string;
}

/** The whole marathon in one request: the run, its items and what is ticked. */
export interface Marathon extends MarathonRow {
  items: MarathonItem[];
  ticks: MarathonTick[];
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

export const isRoadmapStatus = (value: unknown): value is RoadmapStatus =>
  typeof value === 'string' && (ROADMAP_STATUSES as readonly string[]).includes(value);

export const isBlockType = (value: unknown): value is BlockType =>
  typeof value === 'string' && (BLOCK_TYPES as readonly string[]).includes(value);
