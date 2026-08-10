import express, { type Request, type Response } from 'express';
import cors from 'cors';
import type { SQLInputValue } from 'node:sqlite';
import db, { execute, insertedId, queryAll, queryOne, required, rowCount } from './db';
import {
  isBlockType,
  isMetricType,
  isRoadmapStatus,
  type Block,
  type BlockRow,
  type ErrorBody,
  type Folder,
  type FolderWithPages,
  type Metric,
  type Milestone,
  type Note,
  type NoteRow,
  type Page,
  type StepsPayload,
} from './types';

const app = express();
const PORT = 3000;

app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json());

// express.json() gives back `any`; funnelling every read through these keeps the
// routes from trusting a shape the client never has to send.
const bodyOf = (req: Request): Record<string, unknown> =>
  typeof req.body === 'object' && req.body !== null ? (req.body as Record<string, unknown>) : {};

/** The trimmed string, or null if it isn't a string or is blank once trimmed. */
const trimmed = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text.length > 0 ? text : null;
};

const metricExists = (id: number): boolean =>
  !!queryOne<{ 1: number }>('SELECT 1 FROM metrics WHERE id = ?', id);

app.get('/metrics', (_req, res: Response<Metric[]>) => {
  res.json(queryAll<Metric>('SELECT * FROM metrics ORDER BY created_at ASC'));
});

app.post('/metrics', (req, res: Response<Metric | ErrorBody>) => {
  const { name, type } = bodyOf(req);
  const cleanName = trimmed(name);
  if (!cleanName) return res.status(400).json({ error: 'name required' });
  const t = isMetricType(type) ? type : 'generic';
  const info = execute('INSERT INTO metrics (name, type) VALUES (?, ?)', cleanName, t);
  const row = queryOne<Metric>('SELECT * FROM metrics WHERE id = ?', insertedId(info));
  return res.status(201).json(required(row, 'metric'));
});

app.put('/metrics/:id', (req, res: Response<Metric | ErrorBody>) => {
  const cleanName = trimmed(bodyOf(req).name);
  if (!cleanName) return res.status(400).json({ error: 'name required' });
  const info = execute('UPDATE metrics SET name = ? WHERE id = ?', cleanName, req.params.id);
  if (rowCount(info) === 0) return res.status(404).json({ error: 'not found' });
  const row = queryOne<Metric>('SELECT * FROM metrics WHERE id = ?', req.params.id);
  return res.json(required(row, 'metric'));
});

app.delete('/metrics/:id', (req, res: Response<ErrorBody | void>) => {
  const id = Number(req.params.id);
  // Remove the metric and all of its child rows atomically so no orphans are left behind.
  db.exec('BEGIN');
  try {
    execute('DELETE FROM step_entries WHERE metric_id = ?', id);
    execute('DELETE FROM step_goals WHERE metric_id = ?', id);
    execute('DELETE FROM notes WHERE metric_id = ?', id);
    execute('DELETE FROM roadmap_milestones WHERE metric_id = ?', id);
    const info = execute('DELETE FROM metrics WHERE id = ?', id);
    db.exec('COMMIT');
    if (rowCount(info) === 0) return res.status(404).json({ error: 'not found' });
    return res.status(204).end();
  } catch {
    db.exec('ROLLBACK');
    return res.status(500).json({ error: 'delete failed' });
  }
});

// --- Steps tracker ---

app.get('/metrics/:id/steps', (req, res: Response<StepsPayload>) => {
  const metricId = Number(req.params.id);
  const goalRow = queryOne<{ goal: number }>(
    'SELECT goal FROM step_goals WHERE metric_id = ?',
    metricId,
  );
  const goal = goalRow ? goalRow.goal : 10000;
  const rows = queryAll<{ date: string; steps: number }>(
    'SELECT date, steps FROM step_entries WHERE metric_id = ?',
    metricId,
  );
  const entries: Record<string, number> = {};
  for (const r of rows) entries[r.date] = r.steps;
  res.json({ goal, entries });
});

app.put('/metrics/:id/goal', (req, res: Response<{ goal: number } | ErrorBody>) => {
  const metricId = Number(req.params.id);
  if (!metricExists(metricId)) return res.status(404).json({ error: 'metric not found' });
  const goal = Number(bodyOf(req).goal);
  if (!Number.isInteger(goal) || goal < 1000 || goal > 20000) {
    return res.status(400).json({ error: 'goal must be an integer between 1000 and 20000' });
  }
  execute(
    `
    INSERT INTO step_goals (metric_id, goal) VALUES (?, ?)
    ON CONFLICT(metric_id) DO UPDATE SET goal = excluded.goal
  `,
    metricId,
    goal,
  );
  return res.json({ goal });
});

app.put('/metrics/:id/steps', (req, res: Response<{ date: string; steps: number } | ErrorBody>) => {
  const metricId = Number(req.params.id);
  if (!metricExists(metricId)) return res.status(404).json({ error: 'metric not found' });
  const { date } = bodyOf(req);
  const steps = Number(bodyOf(req).steps);
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
  }
  if (!Number.isInteger(steps) || steps < 0) {
    return res.status(400).json({ error: 'steps must be a non-negative integer' });
  }
  if (steps > 0) {
    execute(
      `
      INSERT INTO step_entries (metric_id, date, steps) VALUES (?, ?, ?)
      ON CONFLICT(metric_id, date) DO UPDATE SET steps = excluded.steps
    `,
      metricId,
      date,
      steps,
    );
  } else {
    execute('DELETE FROM step_entries WHERE metric_id = ? AND date = ?', metricId, date);
  }
  return res.json({ date, steps });
});

// --- Programmer's Notebook ---

const parseNote = ({ links, ...rest }: NoteRow): Note => ({
  ...rest,
  links: JSON.parse(links || '{}') as Record<string, string>,
});

// `?topic=` narrows the list to one subject; omitting it returns every note on
// the metric, so the metric's own page still sees the lot.
app.get('/metrics/:id/notes', (req, res: Response<Note[]>) => {
  const metricId = Number(req.params.id);
  const topic = typeof req.query.topic === 'string' ? req.query.topic : undefined;
  const rows =
    topic === undefined
      ? queryAll<NoteRow>(
          'SELECT * FROM notes WHERE metric_id = ? ORDER BY created_at DESC',
          metricId,
        )
      : queryAll<NoteRow>(
          'SELECT * FROM notes WHERE metric_id = ? AND topic = ? ORDER BY created_at DESC',
          metricId,
          topic,
        );
  res.json(rows.map(parseNote));
});

app.post('/metrics/:id/notes', (req, res: Response<Note | ErrorBody>) => {
  const metricId = Number(req.params.id);
  if (!metricExists(metricId)) return res.status(404).json({ error: 'metric not found' });
  const { content, topic } = bodyOf(req);
  const cleanContent = trimmed(content);
  if (!cleanContent) return res.status(400).json({ error: 'content required' });
  const info = execute(
    'INSERT INTO notes (metric_id, content, topic) VALUES (?, ?, ?)',
    metricId,
    cleanContent,
    typeof topic === 'string' ? topic : '',
  );
  const row = queryOne<NoteRow>('SELECT * FROM notes WHERE id = ?', insertedId(info));
  return res.status(201).json(parseNote(required(row, 'note')));
});

app.put('/metrics/:id/notes/:noteId', (req, res: Response<Note | ErrorBody>) => {
  const { noteId } = req.params;
  const { content, links, topic } = bodyOf(req);
  const sets: string[] = [];
  const values: SQLInputValue[] = [];
  if (typeof content === 'string') {
    const clean = trimmed(content);
    if (!clean) return res.status(400).json({ error: 'content required' });
    sets.push('content = ?');
    values.push(clean);
  }
  if (links && typeof links === 'object') {
    sets.push('links = ?');
    values.push(JSON.stringify(links));
  }
  // '' is a real value here — it moves a note back onto the metric itself.
  if (typeof topic === 'string') {
    sets.push('topic = ?');
    values.push(topic);
  }
  if (sets.length === 0) return res.status(400).json({ error: 'nothing to update' });
  sets.push("updated_at = datetime('now')");
  values.push(noteId);
  const info = execute(`UPDATE notes SET ${sets.join(', ')} WHERE id = ?`, ...values);
  if (rowCount(info) === 0) return res.status(404).json({ error: 'not found' });
  const row = queryOne<NoteRow>('SELECT * FROM notes WHERE id = ?', noteId);
  return res.json(parseNote(required(row, 'note')));
});

app.delete('/metrics/:id/notes/:noteId', (req, res: Response<ErrorBody | void>) => {
  const info = execute('DELETE FROM notes WHERE id = ?', req.params.noteId);
  if (rowCount(info) === 0) return res.status(404).json({ error: 'not found' });
  return res.status(204).end();
});

// --- Roadmap timeline ---

const clampPosition = (n: number): number => Math.min(100, Math.max(0, n));

app.get('/metrics/:id/roadmap', (req, res: Response<Milestone[]>) => {
  const metricId = Number(req.params.id);
  res.json(
    queryAll<Milestone>(
      'SELECT * FROM roadmap_milestones WHERE metric_id = ? ORDER BY position ASC',
      metricId,
    ),
  );
});

app.post('/metrics/:id/roadmap', (req, res: Response<Milestone | ErrorBody>) => {
  const metricId = Number(req.params.id);
  if (!metricExists(metricId)) return res.status(404).json({ error: 'metric not found' });
  const { title, position } = bodyOf(req);
  const cleanTitle = trimmed(title);
  if (!cleanTitle) return res.status(400).json({ error: 'title required' });
  let pos = 50;
  if (position !== undefined) {
    const n = Number(position);
    if (!Number.isFinite(n)) return res.status(400).json({ error: 'position must be a number' });
    pos = clampPosition(n);
  }
  const info = execute(
    'INSERT INTO roadmap_milestones (metric_id, title, position) VALUES (?, ?, ?)',
    metricId,
    cleanTitle,
    pos,
  );
  const row = queryOne<Milestone>(
    'SELECT * FROM roadmap_milestones WHERE id = ?',
    insertedId(info),
  );
  return res.status(201).json(required(row, 'milestone'));
});

app.put('/metrics/:id/roadmap/:milestoneId', (req, res: Response<Milestone | ErrorBody>) => {
  const metricId = Number(req.params.id);
  const { milestoneId } = req.params;
  const { title, position, status } = bodyOf(req);
  const sets: string[] = [];
  const values: SQLInputValue[] = [];
  if (title !== undefined) {
    const cleanTitle = trimmed(title);
    if (!cleanTitle) return res.status(400).json({ error: 'title required' });
    sets.push('title = ?');
    values.push(cleanTitle);
  }
  if (position !== undefined) {
    const n = Number(position);
    if (!Number.isFinite(n)) return res.status(400).json({ error: 'position must be a number' });
    sets.push('position = ?');
    values.push(clampPosition(n));
  }
  if (status !== undefined) {
    if (!isRoadmapStatus(status)) return res.status(400).json({ error: 'invalid status' });
    sets.push('status = ?');
    values.push(status);
  }
  if (sets.length === 0) return res.status(400).json({ error: 'nothing to update' });
  // Enforce a single current (in_progress) node per metric.
  if (status === 'in_progress') {
    execute(
      "UPDATE roadmap_milestones SET status = 'upcoming' WHERE metric_id = ? AND status = 'in_progress' AND id <> ?",
      metricId,
      milestoneId,
    );
  }
  sets.push("updated_at = datetime('now')");
  values.push(milestoneId);
  const info = execute(`UPDATE roadmap_milestones SET ${sets.join(', ')} WHERE id = ?`, ...values);
  if (rowCount(info) === 0) return res.status(404).json({ error: 'not found' });
  const row = queryOne<Milestone>('SELECT * FROM roadmap_milestones WHERE id = ?', milestoneId);
  return res.json(required(row, 'milestone'));
});

app.delete('/metrics/:id/roadmap/:milestoneId', (req, res: Response<ErrorBody | void>) => {
  const info = execute('DELETE FROM roadmap_milestones WHERE id = ?', req.params.milestoneId);
  if (rowCount(info) === 0) return res.status(404).json({ error: 'not found' });
  return res.status(204).end();
});

// --- Workspace: folders → pages → blocks ---

/** Editing a block is editing its page, so the tree can show what moved last. */
const touchPage = (pageId: SQLInputValue): void => {
  execute("UPDATE workspace_pages SET updated_at = datetime('now') WHERE id = ?", pageId);
};

/** Appends to the end of a list, so a new row lands where it was asked for. */
const nextPosition = (table: string, whereSql: string, ...params: SQLInputValue[]): number => {
  const row = queryOne<{ next: number | null }>(
    `SELECT MAX(position) + 1 AS next FROM ${table} WHERE ${whereSql}`,
    ...params,
  );
  return row?.next ?? 0;
};

const parseBlock = ({ content, ...rest }: BlockRow): Block => ({
  ...rest,
  content: JSON.parse(content || '{}') as Record<string, unknown>,
});

/** The whole navigation tree for one subject; blocks are fetched per page. */
app.get('/metrics/:id/workspace/:topic', (req, res: Response<FolderWithPages[]>) => {
  const metricId = Number(req.params.id);
  const folders = queryAll<Folder>(
    'SELECT * FROM workspace_folders WHERE metric_id = ? AND topic = ? ORDER BY position ASC, id ASC',
    metricId,
    req.params.topic,
  );
  if (folders.length === 0) return res.json([]);
  const placeholders = folders.map(() => '?').join(', ');
  const pages = queryAll<Page>(
    `SELECT * FROM workspace_pages WHERE folder_id IN (${placeholders}) ORDER BY position ASC, id ASC`,
    ...folders.map((f) => f.id),
  );
  return res.json(
    folders.map((folder) => ({
      ...folder,
      pages: pages.filter((page) => page.folder_id === folder.id),
    })),
  );
});

app.post('/metrics/:id/workspace/:topic/folders', (req, res: Response<Folder | ErrorBody>) => {
  const metricId = Number(req.params.id);
  if (!metricExists(metricId)) return res.status(404).json({ error: 'metric not found' });
  const { topic } = req.params;
  const name = trimmed(bodyOf(req).name) ?? 'New folder';
  const info = execute(
    'INSERT INTO workspace_folders (metric_id, topic, name, position) VALUES (?, ?, ?, ?)',
    metricId,
    topic,
    name,
    nextPosition('workspace_folders', 'metric_id = ? AND topic = ?', metricId, topic),
  );
  const row = queryOne<Folder>('SELECT * FROM workspace_folders WHERE id = ?', insertedId(info));
  return res.status(201).json(required(row, 'folder'));
});

app.put('/workspace/folders/:folderId', (req, res: Response<Folder | ErrorBody>) => {
  const { folderId } = req.params;
  const { name, position } = bodyOf(req);
  const sets: string[] = [];
  const values: SQLInputValue[] = [];
  if (name !== undefined) {
    const clean = trimmed(name);
    if (!clean) return res.status(400).json({ error: 'name required' });
    sets.push('name = ?');
    values.push(clean);
  }
  if (position !== undefined) {
    const n = Number(position);
    if (!Number.isFinite(n)) return res.status(400).json({ error: 'position must be a number' });
    sets.push('position = ?');
    values.push(n);
  }
  if (sets.length === 0) return res.status(400).json({ error: 'nothing to update' });
  values.push(folderId);
  const info = execute(`UPDATE workspace_folders SET ${sets.join(', ')} WHERE id = ?`, ...values);
  if (rowCount(info) === 0) return res.status(404).json({ error: 'not found' });
  const row = queryOne<Folder>('SELECT * FROM workspace_folders WHERE id = ?', folderId);
  return res.json(required(row, 'folder'));
});

// Children are removed explicitly rather than leaning on ON DELETE CASCADE, so
// the cleanup holds whether or not foreign keys are enforced on this connection.
app.delete('/workspace/folders/:folderId', (req, res: Response<ErrorBody | void>) => {
  const { folderId } = req.params;
  execute(
    'DELETE FROM workspace_blocks WHERE page_id IN (SELECT id FROM workspace_pages WHERE folder_id = ?)',
    folderId,
  );
  execute('DELETE FROM workspace_pages WHERE folder_id = ?', folderId);
  const info = execute('DELETE FROM workspace_folders WHERE id = ?', folderId);
  if (rowCount(info) === 0) return res.status(404).json({ error: 'not found' });
  return res.status(204).end();
});

app.post('/workspace/folders/:folderId/pages', (req, res: Response<Page | ErrorBody>) => {
  const { folderId } = req.params;
  const folder = queryOne<Folder>('SELECT * FROM workspace_folders WHERE id = ?', folderId);
  if (!folder) return res.status(404).json({ error: 'folder not found' });
  const { title, icon } = bodyOf(req);
  const info = execute(
    'INSERT INTO workspace_pages (folder_id, title, icon, position) VALUES (?, ?, ?, ?)',
    folderId,
    trimmed(title) ?? 'Untitled',
    typeof icon === 'string' ? icon : '',
    nextPosition('workspace_pages', 'folder_id = ?', folderId),
  );
  const row = queryOne<Page>('SELECT * FROM workspace_pages WHERE id = ?', insertedId(info));
  return res.status(201).json(required(row, 'page'));
});

app.put('/workspace/pages/:pageId', (req, res: Response<Page | ErrorBody>) => {
  const { pageId } = req.params;
  const { title, icon, position, folder_id } = bodyOf(req);
  const sets: string[] = [];
  const values: SQLInputValue[] = [];
  if (title !== undefined) {
    const clean = trimmed(title);
    if (!clean) return res.status(400).json({ error: 'title required' });
    sets.push('title = ?');
    values.push(clean);
  }
  // '' is a real value here — it clears the icon back to the generic mark.
  if (typeof icon === 'string') {
    sets.push('icon = ?');
    values.push(icon);
  }
  if (position !== undefined) {
    const n = Number(position);
    if (!Number.isFinite(n)) return res.status(400).json({ error: 'position must be a number' });
    sets.push('position = ?');
    values.push(n);
  }
  if (folder_id !== undefined) {
    const n = Number(folder_id);
    if (!queryOne<Folder>('SELECT * FROM workspace_folders WHERE id = ?', n)) {
      return res.status(400).json({ error: 'folder not found' });
    }
    sets.push('folder_id = ?');
    values.push(n);
  }
  if (sets.length === 0) return res.status(400).json({ error: 'nothing to update' });
  sets.push("updated_at = datetime('now')");
  values.push(pageId);
  const info = execute(`UPDATE workspace_pages SET ${sets.join(', ')} WHERE id = ?`, ...values);
  if (rowCount(info) === 0) return res.status(404).json({ error: 'not found' });
  const row = queryOne<Page>('SELECT * FROM workspace_pages WHERE id = ?', pageId);
  return res.json(required(row, 'page'));
});

app.delete('/workspace/pages/:pageId', (req, res: Response<ErrorBody | void>) => {
  const { pageId } = req.params;
  execute('DELETE FROM workspace_blocks WHERE page_id = ?', pageId);
  const info = execute('DELETE FROM workspace_pages WHERE id = ?', pageId);
  if (rowCount(info) === 0) return res.status(404).json({ error: 'not found' });
  return res.status(204).end();
});

app.get('/workspace/pages/:pageId/blocks', (req, res: Response<Block[]>) => {
  const rows = queryAll<BlockRow>(
    'SELECT * FROM workspace_blocks WHERE page_id = ? ORDER BY position ASC, id ASC',
    req.params.pageId,
  );
  res.json(rows.map(parseBlock));
});

app.post('/workspace/pages/:pageId/blocks', (req, res: Response<Block | ErrorBody>) => {
  const { pageId } = req.params;
  if (!queryOne<Page>('SELECT * FROM workspace_pages WHERE id = ?', pageId)) {
    return res.status(404).json({ error: 'page not found' });
  }
  const { type, content } = bodyOf(req);
  if (!isBlockType(type)) return res.status(400).json({ error: 'invalid block type' });
  const info = execute(
    'INSERT INTO workspace_blocks (page_id, type, content, position) VALUES (?, ?, ?, ?)',
    pageId,
    type,
    JSON.stringify(content && typeof content === 'object' ? content : {}),
    nextPosition('workspace_blocks', 'page_id = ?', pageId),
  );
  touchPage(pageId);
  const row = queryOne<BlockRow>('SELECT * FROM workspace_blocks WHERE id = ?', insertedId(info));
  return res.status(201).json(parseBlock(required(row, 'block')));
});

app.put('/workspace/blocks/:blockId', (req, res: Response<Block | ErrorBody>) => {
  const { blockId } = req.params;
  const { type, content, position } = bodyOf(req);
  const sets: string[] = [];
  const values: SQLInputValue[] = [];
  if (type !== undefined) {
    if (!isBlockType(type)) return res.status(400).json({ error: 'invalid block type' });
    sets.push('type = ?');
    values.push(type);
  }
  if (content !== undefined) {
    if (!content || typeof content !== 'object') {
      return res.status(400).json({ error: 'content must be an object' });
    }
    sets.push('content = ?');
    values.push(JSON.stringify(content));
  }
  if (position !== undefined) {
    const n = Number(position);
    if (!Number.isFinite(n)) return res.status(400).json({ error: 'position must be a number' });
    sets.push('position = ?');
    values.push(n);
  }
  if (sets.length === 0) return res.status(400).json({ error: 'nothing to update' });
  sets.push("updated_at = datetime('now')");
  values.push(blockId);
  const info = execute(`UPDATE workspace_blocks SET ${sets.join(', ')} WHERE id = ?`, ...values);
  if (rowCount(info) === 0) return res.status(404).json({ error: 'not found' });
  const row = required(
    queryOne<BlockRow>('SELECT * FROM workspace_blocks WHERE id = ?', blockId),
    'block',
  );
  touchPage(row.page_id);
  return res.json(parseBlock(row));
});

app.delete('/workspace/blocks/:blockId', (req, res: Response<ErrorBody | void>) => {
  const { blockId } = req.params;
  const row = queryOne<BlockRow>('SELECT * FROM workspace_blocks WHERE id = ?', blockId);
  const info = execute('DELETE FROM workspace_blocks WHERE id = ?', blockId);
  if (rowCount(info) === 0) return res.status(404).json({ error: 'not found' });
  if (row) touchPage(row.page_id);
  return res.status(204).end();
});

app.listen(PORT, () => console.log(`Backend running on http://localhost:${PORT}`));
