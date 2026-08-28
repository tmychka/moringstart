// The JSON the backend sends back, mirroring backend/src/types.ts, plus the theme
// palette the dashboard and sidebar share.

export type RoadmapStatus = "upcoming" | "in_progress" | "done";

/**
 * The id the backend files an area's rows under, taken from the area list in
 * `areas.ts` and interpolated straight into the API's paths.
 */
export type MetricId = number;

export interface Note {
  id: number;
  metric_id: number;
  content: string;
  /** Word index (as a string key) → URL. */
  links: Record<string, string>;
  /** Subject slug the note belongs to; '' means it sits on the metric itself. */
  topic: string;
  created_at: string;
  updated_at: string;
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

/** Date (YYYY-MM-DD) → step count. */
export type StepEntries = Record<string, number>;

/** Steps for one metric: the goal plus every logged day. */
export interface StepsPayload {
  goal: number;
  entries: StepEntries;
}

// --- Training: two routines, logged set by set ---

/**
 * Which routine a session is. The exercises that belong to each live in
 * `training.ts`; this is only what a stored session is filed under.
 */
export const WORKOUT_KINDS = ["strength", "simple", "plank", "rope"] as const;
export type WorkoutKind = (typeof WORKOUT_KINDS)[number];

/** One set as performed. `weight` is 0 for the bodyweight routine. */
export interface WorkoutSet {
  id: number;
  session_id: number;
  /** Exercise slug from the plan in `training.ts`. */
  exercise: string;
  reps: number;
  weight: number;
  position: number;
  created_at: string;
}

/** One workout. `finished_at` is null while it is still being worked through. */
export interface WorkoutSession {
  id: number;
  metric_id: number;
  /** The local day it belongs to, YYYY-MM-DD. */
  date: string;
  kind: WorkoutKind;
  finished_at: string | null;
  created_at: string;
  sets: WorkoutSet[];
}

// --- Profile: the person the areas all hang off ---

/**
 * The regime the body is being run in. Unlike a status this is a closed set,
 * because it is what says which direction on the scale counts as progress.
 */
export const PROFILE_MODES = ["cut", "maintain", "bulk"] as const;
export type ProfileMode = (typeof PROFILE_MODES)[number];

/** One entry in the status history: what was being done, and from when. */
export interface StatusEntry {
  id: number;
  status: string;
  at: string;
}

/** Date (YYYY-MM-DD) → weight in kg. */
export type WeightEntries = Record<string, number>;

export interface ProfilePayload {
  status: string;
  mode: ProfileMode;
  /** Target weight in kg; 0 when none has been set. */
  weightGoal: number;
  updatedAt: string;
  /** Recent status changes, newest first. */
  log: StatusEntry[];
  weights: WeightEntries;
}

export interface ProfileUpdate {
  status?: string;
  mode?: ProfileMode;
  weightGoal?: number;
  /**
   * The client's local midnight, as a UTC `YYYY-MM-DD HH:MM:SS` stamp. Sent
   * with a status so the server can tell a repeat of the span already running
   * from the same words set again on a new day — a boundary it cannot work out
   * on its own, since it has no idea which timezone the day belongs to.
   */
  dayStart?: string;
}

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

/** The whole marathon in one request: the run, its items and what is ticked. */
export interface Marathon {
  id: number;
  title: string;
  /** How long the run is, in days. */
  days: number;
  /** The local day it begins, YYYY-MM-DD. */
  start_date: string;
  created_at: string;
  items: MarathonItem[];
  ticks: MarathonTick[];
}

// --- Request bodies ---

export interface NoteUpdate {
  content?: string;
  links?: Record<string, string>;
  topic?: string;
}

export interface MilestoneCreate {
  title: string;
  position?: number;
}

export interface MilestoneUpdate {
  title?: string;
  position?: number;
  status?: RoadmapStatus;
}

// --- Workspace: folders → pages → blocks ---

export const BLOCK_TYPES = [
  "heading",
  "text",
  "bullets",
  "code",
  "checklist",
  "link",
  "image",
  "callout",
] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];

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

export interface FolderWithPages extends Folder {
  pages: Page[];
}

/** The per-type payload of a block. Each block reads only the keys it owns. */
export interface BlockContent {
  /** heading, text, callout */
  text?: string;
  /** heading */
  level?: 2 | 3;
  /** bullets */
  items?: string[];
  /** checklist */
  todos?: { text: string; done: boolean }[];
  /** code */
  code?: string;
  lang?: string;
  /**
   * Whether long lines wrap instead of scrolling sideways. Kept per block and
   * default-on: wrapping is what you want almost every time, and the exception
   * is a snippet holding a table or a diagram drawn in characters, where a
   * wrapped line breaks the picture.
   */
  wrap?: boolean;
  /** link, image */
  url?: string;
  /** link */
  title?: string;
  /** image */
  caption?: string;
  /** callout */
  tone?: "info" | "warn" | "tip";
}

export interface Block {
  id: number;
  page_id: number;
  type: BlockType;
  content: BlockContent;
  position: number;
  created_at: string;
  updated_at: string;
}

/**
 * How the background behind the app is drawn. Independent of `Scheme`: every
 * treatment exists in both, which is why the picker offers two controls rather
 * than one flat list of eight.
 */
export type Treatment = "flat" | "canvas" | "spotlight" | "blueprint";

export type Scheme = "light" | "dark";

/**
 * One app-wide colour scheme. Most entries are Tailwind class strings; `accent`,
 * `accentSoft`, `track`, `goalLine` and `progressDot` are raw colours, because they
 * feed SVG attributes and inline styles rather than className.
 */
export interface Theme {
  /** Name shown in the background picker. */
  title: string;
  /**
   * Which base the palette is built on. Drives `color-scheme` and anything
   * rendered outside the themed tree that only knows light from dark — the
   * toasts, native scrollbars, form controls.
   */
  scheme: Scheme;
  /**
   * Painted behind the whole app (the body, so overscroll matches) and used as
   * the picker swatch. `appFg` and `carouselDot` cover the same ground for text
   * and the carousel dots, which overlay slides of either scheme.
   */
  appBg: string;
  appFg: string;
  carouselDot: string;
  /**
   * The treatment itself: a `background-image` value painted on one fixed layer
   * behind the app, with `backdropSize` for the tiled ones. `page` carries no
   * background of its own so this stays visible through every screen.
   */
  backdrop: string;
  backdropSize?: string;
  page: string;
  card: string;
  cardHover: string;
  rule: string;
  label: string;
  muted: string;
  body: string;
  faint: string;
  rowHover: string;
  outlineBtn: string;
  toggleOn: string;
  toggleOff: string;
  /** Border, background, text, placeholder and focus ring for text fields. */
  input: string;
  /** Borderless round button that only shows itself on hover/focus. */
  iconBtn: string;
  /** Opaque floating surface (popovers) — never translucent, it covers content. */
  popover: string;
  /** Opaque background on its own, for chips and markers that sit over a line. */
  surface: string;
  accent: string;
  accentSoft: string;
  track: string;
  goalLine: string;
  progressDot: string;
  sidebar: string;
  sidebarItem: string;
  sidebarItemActive: string;
  sidebarBadge: string;
  sidebarCard: string;
}
