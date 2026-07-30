import type {
  Metric,
  MetricId,
  MetricType,
  Milestone,
  MilestoneCreate,
  MilestoneUpdate,
  Note,
  NoteUpdate,
  StepsPayload,
} from "./types";

// In dev, VITE_API_URL is empty and requests go through the Vite proxy (see vite.config.ts).
// In production, set VITE_API_URL to the backend origin (e.g. https://api.example.com).
const API_URL = import.meta.env.VITE_API_URL ?? "";
const BASE = `${API_URL}/metrics`;

const JSON_HEADERS = { "Content-Type": "application/json" };

// The backend's error shape; anything else falls back to a status-code message.
const errorMessage = (body: unknown, status: number): string =>
  typeof body === "object" &&
  body !== null &&
  typeof (body as { error?: unknown }).error === "string"
    ? (body as { error: string }).error
    : `Request failed (${status})`;

// Single fetch wrapper: throws on non-2xx (so TanStack Query / toast can surface the
// error) and parses JSON, returning null for empty (204) responses. `T` is a promise
// about the response body that only the callers below are in a position to make.
async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options);
  if (!res.ok) {
    const body: unknown = await res.json().catch(() => ({}));
    throw new Error(errorMessage(body, res.status));
  }
  return (res.status === 204 ? null : await res.json()) as T;
}

const post = <T>(url: string, body: unknown) =>
  request<T>(url, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });
const put = <T>(url: string, body: unknown) =>
  request<T>(url, {
    method: "PUT",
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });
const del = (url: string) => request<null>(url, { method: "DELETE" });

export const getMetrics = () => request<Metric[]>(BASE);
export const createMetric = (name: string, type?: MetricType) =>
  post<Metric>(BASE, { name, type });
export const updateMetric = (id: MetricId, name: string) =>
  put<Metric>(`${BASE}/${id}`, { name });
export const deleteMetric = (id: MetricId) => del(`${BASE}/${id}`);

export const getSteps = (id: MetricId) =>
  request<StepsPayload>(`${BASE}/${id}/steps`);
export const saveGoal = (id: MetricId, goal: number) =>
  put<{ goal: number }>(`${BASE}/${id}/goal`, { goal });
export const saveSteps = (id: MetricId, date: string, steps: number) =>
  put<{ date: string; steps: number }>(`${BASE}/${id}/steps`, { date, steps });

export const getNotes = (id: MetricId) =>
  request<Note[]>(`${BASE}/${id}/notes`);
export const createNote = (id: MetricId, content: string) =>
  post<Note>(`${BASE}/${id}/notes`, { content });
export const updateNote = (id: MetricId, noteId: number, body: NoteUpdate) =>
  put<Note>(`${BASE}/${id}/notes/${noteId}`, body);
export const deleteNote = (id: MetricId, noteId: number) =>
  del(`${BASE}/${id}/notes/${noteId}`);

// Roadmap timeline
export const getRoadmap = (id: MetricId) =>
  request<Milestone[]>(`${BASE}/${id}/roadmap`);
export const createMilestone = (id: MetricId, body: MilestoneCreate) =>
  post<Milestone>(`${BASE}/${id}/roadmap`, body);
export const updateMilestone = (
  id: MetricId,
  mId: number,
  body: MilestoneUpdate
) => put<Milestone>(`${BASE}/${id}/roadmap/${mId}`, body);
export const deleteMilestone = (id: MetricId, mId: number) =>
  del(`${BASE}/${id}/roadmap/${mId}`);
