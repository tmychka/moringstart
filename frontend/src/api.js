const BASE = '/metrics';

export const getMetrics   = ()          => fetch(BASE).then(r => r.json());
export const createMetric = (name)      => fetch(BASE, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) }).then(r => r.json());
export const updateMetric = (id, name)  => fetch(`${BASE}/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) }).then(r => r.json());
export const deleteMetric = (id)        => fetch(`${BASE}/${id}`, { method: 'DELETE' });

export const getSteps  = (id)              => fetch(`${BASE}/${id}/steps`).then(r => r.json());
export const saveGoal  = (id, goal)        => fetch(`${BASE}/${id}/goal`,  { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ goal }) }).then(r => r.json());
export const saveSteps = (id, date, steps) => fetch(`${BASE}/${id}/steps`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date, steps }) }).then(r => r.json());

export const getNotes   = (id)              => fetch(`${BASE}/${id}/notes`).then(r => r.json());
export const createNote = (id, content)     => fetch(`${BASE}/${id}/notes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content }) }).then(r => r.json());
export const updateNote = (id, noteId, body) => fetch(`${BASE}/${id}/notes/${noteId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json());
export const deleteNote = (id, noteId)      => fetch(`${BASE}/${id}/notes/${noteId}`, { method: 'DELETE' });
