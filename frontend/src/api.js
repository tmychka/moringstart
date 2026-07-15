// In dev, VITE_API_URL is empty and requests go through the Vite proxy (see vite.config.js).
// In production, set VITE_API_URL to the backend origin (e.g. https://api.example.com).
const API_URL = import.meta.env.VITE_API_URL ?? "";
const BASE = `${API_URL}/metrics`;

const JSON_HEADERS = { "Content-Type": "application/json" };

// Single fetch wrapper: throws on non-2xx (so TanStack Query / toast can surface the
// error) and parses JSON, returning null for empty (204) responses.
async function request(url, options) {
  const res = await fetch(url, options);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  return res.status === 204 ? null : res.json();
}

const post = (url, body) =>
  request(url, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });
const put = (url, body) =>
  request(url, {
    method: "PUT",
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });
const del = (url) => request(url, { method: "DELETE" });

export const getMetrics = () => request(BASE);
export const createMetric = (name, type) => post(BASE, { name, type });
export const updateMetric = (id, name) => put(`${BASE}/${id}`, { name });
export const deleteMetric = (id) => del(`${BASE}/${id}`);

export const getSteps = (id) => request(`${BASE}/${id}/steps`);
export const saveGoal = (id, goal) => put(`${BASE}/${id}/goal`, { goal });
export const saveSteps = (id, date, steps) =>
  put(`${BASE}/${id}/steps`, { date, steps });

export const getNotes = (id) => request(`${BASE}/${id}/notes`);
export const createNote = (id, content) =>
  post(`${BASE}/${id}/notes`, { content });
export const updateNote = (id, noteId, body) =>
  put(`${BASE}/${id}/notes/${noteId}`, body);
export const deleteNote = (id, noteId) => del(`${BASE}/${id}/notes/${noteId}`);

// Roadmap timeline
export const getRoadmap = (id) => request(`${BASE}/${id}/roadmap`);
export const createMilestone = (id, body) =>
  post(`${BASE}/${id}/roadmap`, body);
export const updateMilestone = (id, mId, body) =>
  put(`${BASE}/${id}/roadmap/${mId}`, body);
export const deleteMilestone = (id, mId) => del(`${BASE}/${id}/roadmap/${mId}`);
