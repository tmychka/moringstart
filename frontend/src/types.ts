// The JSON the backend sends back, mirroring backend/src/types.ts, plus the theme
// palette the dashboard and sidebar share.

export type MetricType = "generic" | "steps" | "notebook";
export type RoadmapStatus = "upcoming" | "in_progress" | "done";

/**
 * Metric ids reach the API both as numbers (straight off a `Metric`) and as strings
 * (straight off a route param), and they are interpolated into URLs either way.
 */
export type MetricId = number | string;

export interface Metric {
  id: number;
  name: string;
  type: MetricType;
  created_at: string;
}

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
