import type {
  Block,
  BlockContent,
  BlockType,
  Folder,
  FolderWithPages,
  MetricId,
  Milestone,
  MilestoneCreate,
  MilestoneUpdate,
  Note,
  NoteUpdate,
  Page,
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

export const getSteps = (id: MetricId) =>
  request<StepsPayload>(`${BASE}/${id}/steps`);
export const saveGoal = (id: MetricId, goal: number) =>
  put<{ goal: number }>(`${BASE}/${id}/goal`, { goal });
export const saveSteps = (id: MetricId, date: string, steps: number) =>
  put<{ date: string; steps: number }>(`${BASE}/${id}/steps`, { date, steps });

// Passing a topic narrows the list to that subject; leaving it off returns every
// note on the metric, which is what the metric's own page wants.
export const getNotes = (id: MetricId, topic?: string) =>
  request<Note[]>(
    topic === undefined
      ? `${BASE}/${id}/notes`
      : `${BASE}/${id}/notes?topic=${encodeURIComponent(topic)}`
  );
export const createNote = (id: MetricId, content: string, topic = "") =>
  post<Note>(`${BASE}/${id}/notes`, { content, topic });
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

// Workspace: folders → pages → blocks. A workspace is the (metric, topic) pair,
// so folder creation is nested under the subject and everything below it is
// addressed by its own id.
const WS = `${API_URL}/workspace`;

export const getWorkspaceTree = (id: MetricId, topic: string) =>
  request<FolderWithPages[]>(
    `${BASE}/${id}/workspace/${encodeURIComponent(topic)}`
  );

export const createFolder = (id: MetricId, topic: string, name: string) =>
  post<Folder>(`${BASE}/${id}/workspace/${encodeURIComponent(topic)}/folders`, {
    name,
  });
export const updateFolder = (
  folderId: number,
  body: { name?: string; position?: number }
) => put<Folder>(`${WS}/folders/${folderId}`, body);
export const deleteFolder = (folderId: number) =>
  del(`${WS}/folders/${folderId}`);

export const createPage = (folderId: number, title: string, icon = "") =>
  post<Page>(`${WS}/folders/${folderId}/pages`, { title, icon });
export const updatePage = (
  pageId: number,
  body: { title?: string; icon?: string; position?: number; folder_id?: number }
) => put<Page>(`${WS}/pages/${pageId}`, body);
export const deletePage = (pageId: number) => del(`${WS}/pages/${pageId}`);

export const getBlocks = (pageId: number) =>
  request<Block[]>(`${WS}/pages/${pageId}/blocks`);
export const createBlock = (
  pageId: number,
  type: BlockType,
  content: BlockContent
) => post<Block>(`${WS}/pages/${pageId}/blocks`, { type, content });
export const updateBlock = (
  blockId: number,
  body: { type?: BlockType; content?: BlockContent; position?: number }
) => put<Block>(`${WS}/blocks/${blockId}`, body);
export const deleteBlock = (blockId: number) => del(`${WS}/blocks/${blockId}`);
