/**
 * The areas the app is made of. This list is the only place one is spelled out:
 * the sidebar builds its entries from it and `AreaPage` routes by its slugs, so
 * a nav entry and its URL can never drift apart.
 *
 * Areas are fixed — they are the app's own sections, not something the user
 * adds — which is why the labels live here rather than in the database.
 */
import type { IconName } from "./components/Sidebar";

/** Which page an area opens. */
export type AreaKind =
  "todos" | "notebook" | "vocabulary" | "steps" | "training" | "soon";

export interface Area {
  /** First URL segment: `/developer`, `/english`, … */
  slug: string;
  label: string;
  icon: IconName;
  kind: AreaKind;
}

/**
 * An area the backend keeps rows for. `metricId` is the id those rows have
 * always been filed under (`/metrics/1/notes` and friends) — the API still
 * takes it; only the URLs in the address bar moved to slugs.
 */
export interface StoredArea extends Area {
  metricId: number;
}

export const TODOS: Area = {
  slug: "todos",
  label: "Todos",
  icon: "checklist",
  kind: "todos",
};

export const DEVELOPER: StoredArea = {
  slug: "developer",
  label: "Learn to code",
  icon: "notes",
  kind: "notebook",
  metricId: 1,
};

/** Vocabulary lives in localStorage, so this area has nothing on the server. */
export const ENGLISH: Area = {
  slug: "english",
  label: "Learn English",
  icon: "book",
  kind: "vocabulary",
};

export const TRAINING: StoredArea = {
  slug: "training",
  label: "Training",
  icon: "dumbbell",
  kind: "training",
  metricId: 3,
};

export const STEPS: StoredArea = {
  slug: "steps",
  label: "Min 10,000 steps",
  icon: "activity",
  kind: "steps",
  metricId: 4,
};

/** In sidebar order. */
export const AREAS: Area[] = [TODOS, DEVELOPER, ENGLISH, TRAINING, STEPS];

export const areaBySlug = (slug: string | undefined): Area | undefined =>
  AREAS.find((area) => area.slug === slug);
