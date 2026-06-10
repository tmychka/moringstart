const BASE = '/metrics';

export const getMetrics   = ()          => fetch(BASE).then(r => r.json());
export const createMetric = (name)      => fetch(BASE, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) }).then(r => r.json());
export const updateMetric = (id, name)  => fetch(`${BASE}/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) }).then(r => r.json());
export const deleteMetric = (id)        => fetch(`${BASE}/${id}`, { method: 'DELETE' });
