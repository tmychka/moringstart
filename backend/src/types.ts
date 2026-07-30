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

export const isMetricType = (value: unknown): value is MetricType =>
  typeof value === 'string' && (METRIC_TYPES as readonly string[]).includes(value);

export const isRoadmapStatus = (value: unknown): value is RoadmapStatus =>
  typeof value === 'string' && (ROADMAP_STATUSES as readonly string[]).includes(value);
