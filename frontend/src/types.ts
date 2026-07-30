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

export type ThemeName = "light" | "dark";

/**
 * One app-wide colour scheme. Most entries are Tailwind class strings; `accent`,
 * `accentSoft`, `track`, `goalLine` and `progressDot` are raw colours, because they
 * feed SVG attributes and inline styles rather than className.
 */
export interface Theme {
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
