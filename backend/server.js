const express = require('express');
const cors = require('cors');
const db = require('./db');

const app = express();
const PORT = 3000;

app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json());

const METRIC_TYPES = ['generic', 'steps', 'notebook'];
const metricExists = (id) => !!db.prepare('SELECT 1 FROM metrics WHERE id = ?').get(id);

app.get('/metrics', (req, res) => {
  const rows = db.prepare('SELECT * FROM metrics ORDER BY created_at ASC').all();
  res.json(rows);
});

app.post('/metrics', (req, res) => {
  const { name, type } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'name required' });
  const t = METRIC_TYPES.includes(type) ? type : 'generic';
  const info = db.prepare('INSERT INTO metrics (name, type) VALUES (?, ?)').run(name.trim(), t);
  const row = db.prepare('SELECT * FROM metrics WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(row);
});

app.put('/metrics/:id', (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'name required' });
  const info = db
    .prepare('UPDATE metrics SET name = ? WHERE id = ?')
    .run(name.trim(), req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'not found' });
  const row = db.prepare('SELECT * FROM metrics WHERE id = ?').get(req.params.id);
  res.json(row);
});

app.delete('/metrics/:id', (req, res) => {
  const id = Number(req.params.id);
  // Remove the metric and all of its child rows atomically so no orphans are left behind.
  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM step_entries WHERE metric_id = ?').run(id);
    db.prepare('DELETE FROM step_goals WHERE metric_id = ?').run(id);
    db.prepare('DELETE FROM notes WHERE metric_id = ?').run(id);
    db.prepare('DELETE FROM roadmap_milestones WHERE metric_id = ?').run(id);
    const info = db.prepare('DELETE FROM metrics WHERE id = ?').run(id);
    db.exec('COMMIT');
    if (info.changes === 0) return res.status(404).json({ error: 'not found' });
    res.status(204).end();
  } catch {
    db.exec('ROLLBACK');
    res.status(500).json({ error: 'delete failed' });
  }
});

// --- Steps tracker ---

app.get('/metrics/:id/steps', (req, res) => {
  const metricId = Number(req.params.id);
  const goalRow = db.prepare('SELECT goal FROM step_goals WHERE metric_id = ?').get(metricId);
  const goal = goalRow ? goalRow.goal : 10000;
  const rows = db.prepare('SELECT date, steps FROM step_entries WHERE metric_id = ?').all(metricId);
  const entries = {};
  for (const r of rows) entries[r.date] = r.steps;
  res.json({ goal, entries });
});

app.put('/metrics/:id/goal', (req, res) => {
  const metricId = Number(req.params.id);
  if (!metricExists(metricId)) return res.status(404).json({ error: 'metric not found' });
  const goal = Number(req.body.goal);
  if (!Number.isInteger(goal) || goal < 1000 || goal > 20000) {
    return res.status(400).json({ error: 'goal must be an integer between 1000 and 20000' });
  }
  db.prepare(
    `
    INSERT INTO step_goals (metric_id, goal) VALUES (?, ?)
    ON CONFLICT(metric_id) DO UPDATE SET goal = excluded.goal
  `,
  ).run(metricId, goal);
  res.json({ goal });
});

app.put('/metrics/:id/steps', (req, res) => {
  const metricId = Number(req.params.id);
  if (!metricExists(metricId)) return res.status(404).json({ error: 'metric not found' });
  const { date } = req.body;
  const steps = Number(req.body.steps);
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
  }
  if (!Number.isInteger(steps) || steps < 0) {
    return res.status(400).json({ error: 'steps must be a non-negative integer' });
  }
  if (steps > 0) {
    db.prepare(
      `
      INSERT INTO step_entries (metric_id, date, steps) VALUES (?, ?, ?)
      ON CONFLICT(metric_id, date) DO UPDATE SET steps = excluded.steps
    `,
    ).run(metricId, date, steps);
  } else {
    db.prepare('DELETE FROM step_entries WHERE metric_id = ? AND date = ?').run(metricId, date);
  }
  res.json({ date, steps });
});

// --- Programmer's Notebook ---

const parseNote = (row) => ({ ...row, links: JSON.parse(row.links || '{}') });

app.get('/metrics/:id/notes', (req, res) => {
  const metricId = Number(req.params.id);
  const rows = db
    .prepare('SELECT * FROM notes WHERE metric_id = ? ORDER BY created_at DESC')
    .all(metricId);
  res.json(rows.map(parseNote));
});

app.post('/metrics/:id/notes', (req, res) => {
  const metricId = Number(req.params.id);
  if (!metricExists(metricId)) return res.status(404).json({ error: 'metric not found' });
  const { content } = req.body;
  if (!content || !content.trim()) return res.status(400).json({ error: 'content required' });
  const info = db
    .prepare('INSERT INTO notes (metric_id, content) VALUES (?, ?)')
    .run(metricId, content.trim());
  const row = db.prepare('SELECT * FROM notes WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(parseNote(row));
});

app.put('/metrics/:id/notes/:noteId', (req, res) => {
  const { noteId } = req.params;
  const { content, links } = req.body;
  const sets = [];
  const values = [];
  if (typeof content === 'string') {
    if (!content.trim()) return res.status(400).json({ error: 'content required' });
    sets.push('content = ?');
    values.push(content.trim());
  }
  if (links && typeof links === 'object') {
    sets.push('links = ?');
    values.push(JSON.stringify(links));
  }
  if (sets.length === 0) return res.status(400).json({ error: 'nothing to update' });
  sets.push("updated_at = datetime('now')");
  values.push(noteId);
  const info = db.prepare(`UPDATE notes SET ${sets.join(', ')} WHERE id = ?`).run(...values);
  if (info.changes === 0) return res.status(404).json({ error: 'not found' });
  const row = db.prepare('SELECT * FROM notes WHERE id = ?').get(noteId);
  res.json(parseNote(row));
});

app.delete('/metrics/:id/notes/:noteId', (req, res) => {
  const info = db.prepare('DELETE FROM notes WHERE id = ?').run(req.params.noteId);
  if (info.changes === 0) return res.status(404).json({ error: 'not found' });
  res.status(204).end();
});

// --- Roadmap timeline ---

const ROADMAP_STATUSES = ['upcoming', 'in_progress', 'done'];
const clampPosition = (n) => Math.min(100, Math.max(0, n));

app.get('/metrics/:id/roadmap', (req, res) => {
  const metricId = Number(req.params.id);
  const rows = db
    .prepare('SELECT * FROM roadmap_milestones WHERE metric_id = ? ORDER BY position ASC')
    .all(metricId);
  res.json(rows);
});

app.post('/metrics/:id/roadmap', (req, res) => {
  const metricId = Number(req.params.id);
  if (!metricExists(metricId)) return res.status(404).json({ error: 'metric not found' });
  const { title, position } = req.body;
  if (!title || !title.trim()) return res.status(400).json({ error: 'title required' });
  let pos = 50;
  if (position !== undefined) {
    const n = Number(position);
    if (!Number.isFinite(n)) return res.status(400).json({ error: 'position must be a number' });
    pos = clampPosition(n);
  }
  const info = db
    .prepare('INSERT INTO roadmap_milestones (metric_id, title, position) VALUES (?, ?, ?)')
    .run(metricId, title.trim(), pos);
  const row = db.prepare('SELECT * FROM roadmap_milestones WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(row);
});

app.put('/metrics/:id/roadmap/:milestoneId', (req, res) => {
  const metricId = Number(req.params.id);
  const { milestoneId } = req.params;
  const { title, position, status } = req.body;
  const sets = [];
  const values = [];
  if (title !== undefined) {
    if (!title || !title.trim()) return res.status(400).json({ error: 'title required' });
    sets.push('title = ?');
    values.push(title.trim());
  }
  if (position !== undefined) {
    const n = Number(position);
    if (!Number.isFinite(n)) return res.status(400).json({ error: 'position must be a number' });
    sets.push('position = ?');
    values.push(clampPosition(n));
  }
  if (status !== undefined) {
    if (!ROADMAP_STATUSES.includes(status))
      return res.status(400).json({ error: 'invalid status' });
    sets.push('status = ?');
    values.push(status);
  }
  if (sets.length === 0) return res.status(400).json({ error: 'nothing to update' });
  // Enforce a single current (in_progress) node per metric.
  if (status === 'in_progress') {
    db.prepare(
      "UPDATE roadmap_milestones SET status = 'upcoming' WHERE metric_id = ? AND status = 'in_progress' AND id <> ?",
    ).run(metricId, milestoneId);
  }
  sets.push("updated_at = datetime('now')");
  values.push(milestoneId);
  const info = db
    .prepare(`UPDATE roadmap_milestones SET ${sets.join(', ')} WHERE id = ?`)
    .run(...values);
  if (info.changes === 0) return res.status(404).json({ error: 'not found' });
  const row = db.prepare('SELECT * FROM roadmap_milestones WHERE id = ?').get(milestoneId);
  res.json(row);
});

app.delete('/metrics/:id/roadmap/:milestoneId', (req, res) => {
  const info = db
    .prepare('DELETE FROM roadmap_milestones WHERE id = ?')
    .run(req.params.milestoneId);
  if (info.changes === 0) return res.status(404).json({ error: 'not found' });
  res.status(204).end();
});

app.listen(PORT, () => console.log(`Backend running on http://localhost:${PORT}`));
