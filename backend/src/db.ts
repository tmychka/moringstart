import { DatabaseSync, type SQLInputValue, type StatementResultingChanges } from 'node:sqlite';
import path from 'path';

// One level up from either src/ (tsx) or dist/ (compiled), so both resolve to
// the same file in the package root.
const db = new DatabaseSync(path.join(__dirname, '..', 'metrics.sqlite'));

// node:sqlite hands back untyped `Record<string, SQLOutputValue>` rows. These three
// helpers are the single boundary where a row is asserted to match a declared shape,
// so the routes above can stay honest about what they return.
export const queryAll = <T>(sql: string, ...params: SQLInputValue[]): T[] =>
  db.prepare(sql).all(...params) as T[];

export const queryOne = <T>(sql: string, ...params: SQLInputValue[]): T | undefined =>
  db.prepare(sql).get(...params) as T | undefined;

export const execute = (sql: string, ...params: SQLInputValue[]): StatementResultingChanges =>
  db.prepare(sql).run(...params);

/** `changes`/`lastInsertRowid` are `number | bigint`; callers only ever want a number. */
export const rowCount = (info: StatementResultingChanges): number => Number(info.changes);
export const insertedId = (info: StatementResultingChanges): number => Number(info.lastInsertRowid);

/**
 * Unwraps a row that a write we just performed guarantees exists. Failing loudly beats
 * letting `undefined` reach `res.json()` and reaching the client as an empty body.
 */
export const required = <T>(row: T | undefined, what: string): T => {
  if (row === undefined) throw new Error(`${what} disappeared immediately after writing it`);
  return row;
};

/**
 * The smallest id no row in `table` is using. Inserting with it rather than letting
 * AUTOINCREMENT count on means a delete frees its number again, instead of the ids
 * climbing forever — a page id is the last segment of its workspace URL
 * (`/developer/html-css/3`), and folders and blocks are numbered the same way so
 * the whole workspace stays in small numbers.
 *
 * `table` is interpolated, so it must stay a literal from this codebase.
 */
export const nextFreeId = (table: string): number => {
  const row = queryOne<{ id: number }>(`
    SELECT CASE
      WHEN NOT EXISTS (SELECT 1 FROM ${table} WHERE id = 1) THEN 1
      ELSE (
        SELECT MIN(id) + 1 FROM ${table} t
        WHERE NOT EXISTS (SELECT 1 FROM ${table} x WHERE x.id = t.id + 1)
      )
    END AS id
  `);
  return row?.id ?? 1;
};

// One row per area of the app, and nothing else: every other table hangs off a
// `metric_id`, and this is what says which ids exist. The frontend owns the
// labels and the routes (frontend/src/areas.ts); the names here are seeded to
// match so a fresh database is readable on its own.
db.exec(`
  CREATE TABLE IF NOT EXISTS metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS step_goals (
    metric_id INTEGER PRIMARY KEY,
    goal INTEGER NOT NULL DEFAULT 10000
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS step_entries (
    metric_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    steps INTEGER NOT NULL,
    PRIMARY KEY (metric_id, date)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    metric_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    links TEXT NOT NULL DEFAULT '{}',
    topic TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

// Migration: notes written before subjects existed keep the '' topic, which is
// what the metric's own page already asks for, so nothing moves.
const hasTopic = queryAll<{ name: string }>('PRAGMA table_info(notes)').some(
  (col) => col.name === 'topic',
);
if (!hasTopic) {
  db.exec("ALTER TABLE notes ADD COLUMN topic TEXT NOT NULL DEFAULT ''");
}

db.exec(`
  CREATE TABLE IF NOT EXISTS roadmap_milestones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    metric_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    position REAL NOT NULL DEFAULT 50,
    status TEXT NOT NULL DEFAULT 'upcoming',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

// A workspace is the (metric_id, topic) pair rather than a row of its own, so a
// subject gets one the moment its first folder is created and never needs seeding.
db.exec(`
  CREATE TABLE IF NOT EXISTS workspace_folders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    metric_id INTEGER NOT NULL,
    topic TEXT NOT NULL,
    name TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS workspace_pages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    folder_id INTEGER NOT NULL REFERENCES workspace_folders(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    icon TEXT NOT NULL DEFAULT '',
    position INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

// `content` is per-type JSON: keeping it opaque here means a new block type is a
// frontend change plus one entry in BLOCK_TYPES, never a migration.
db.exec(`
  CREATE TABLE IF NOT EXISTS workspace_blocks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    page_id INTEGER NOT NULL REFERENCES workspace_pages(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '{}',
    position INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

db.exec('CREATE INDEX IF NOT EXISTS idx_folders_topic ON workspace_folders(metric_id, topic)');
db.exec('CREATE INDEX IF NOT EXISTS idx_pages_folder ON workspace_pages(folder_id)');
db.exec('CREATE INDEX IF NOT EXISTS idx_blocks_page ON workspace_blocks(page_id)');

/** A table and column pointing at the ids being renumbered, to carry along. */
type Reference = [table: string, column: string];

/**
 * Pulls a table's ids back to 1…n. Rows created before `nextFreeId` existed were
 * numbered by AUTOINCREMENT, so a workspace that has seen a few deletions starts
 * out somewhere in the 80s — this is the one-off catch-up, and every insert after
 * it fills gaps on its own. Already compact tables fall straight through, so the
 * pass costs one query per table on every later start.
 *
 * Renumbering in ascending order can't collide: the k-th smallest id is always
 * ≥ k, so by the time k is handed out every row below it has already moved and
 * every row above it is still higher. Foreign keys are deferred to the commit,
 * which is what lets a parent and the rows pointing at it move one after the
 * other rather than needing ON UPDATE CASCADE on every reference.
 *
 * `table` and the references are interpolated, so they must stay literals from
 * this codebase.
 */
const compactIds = (table: string, refs: Reference[] = []): void => {
  const ids = queryAll<{ id: number }>(`SELECT id FROM ${table} ORDER BY id ASC`);
  if (ids.every(({ id }, i) => id === i + 1)) return;

  db.exec('BEGIN');
  db.exec('PRAGMA defer_foreign_keys = ON');
  try {
    ids.forEach(({ id }, i) => {
      const next = i + 1;
      if (id === next) return;
      execute(`UPDATE ${table} SET id = ? WHERE id = ?`, next, id);
      refs.forEach(([refTable, column]) =>
        execute(`UPDATE ${refTable} SET ${column} = ? WHERE ${column} = ?`, next, id),
      );
    });
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
};

compactIds('workspace_folders', [['workspace_pages', 'folder_id']]);
compactIds('workspace_pages', [['workspace_blocks', 'page_id']]);
compactIds('workspace_blocks');

// Seeded in the order the frontend's area list expects, so ids 1–4 line up with
// the `metricId` each area carries.
const count = queryOne<{ c: number }>('SELECT COUNT(*) as c FROM metrics');
if (count?.c === 0) {
  const insert = db.prepare('INSERT INTO metrics (name) VALUES (?)');
  ['Learn to code', 'Learn English', 'Training', 'Min 10,000 steps'].forEach((name) =>
    insert.run(name),
  );
}

export default db;
