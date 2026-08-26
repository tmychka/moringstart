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

// The person, rather than one of their areas — which is why this hangs off no
// `metric_id`. There is exactly one of them, so the row is pinned to id 1 and
// seeded here: every read can then assume it exists.
db.exec(`
  CREATE TABLE IF NOT EXISTS profile (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    status TEXT NOT NULL DEFAULT '',
    mode TEXT NOT NULL DEFAULT 'maintain',
    weight_goal REAL NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);
db.exec('INSERT OR IGNORE INTO profile (id) VALUES (1)');

// Only *changes* are appended (see the route), so a row is the start of a span
// and the next row ends it. That keeps the day readable as a handful of spans
// rather than one entry per save.
db.exec(`
  CREATE TABLE IF NOT EXISTS status_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    status TEXT NOT NULL,
    at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

// Same shape as step_entries — one number per day, keyed by date — because the
// two are read the same way: as a series to draw a trend from.
db.exec(`
  CREATE TABLE IF NOT EXISTS weight_entries (
    date TEXT PRIMARY KEY,
    weight REAL NOT NULL
  )
`);

// A workout is one session on one day: which of the two routines was run, and
// the sets logged under it. `finished_at` is what separates the session still
// being worked through from the ones already in the history — a null there is
// the only thing that makes a session resumable, so a reload mid-workout lands
// back where it left off rather than starting over.
db.exec(`
  CREATE TABLE IF NOT EXISTS workout_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    metric_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    kind TEXT NOT NULL,
    finished_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

// One row per set actually performed, rather than a per-exercise summary: the
// point of logging is that the third set is not the first one, and a summary
// throws exactly that away. `weight` stays 0 for the bodyweight routine, which
// is what lets both kinds share one table.
db.exec(`
  CREATE TABLE IF NOT EXISTS workout_sets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL REFERENCES workout_sessions(id) ON DELETE CASCADE,
    exercise TEXT NOT NULL,
    reps INTEGER NOT NULL,
    weight REAL NOT NULL DEFAULT 0,
    position INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

db.exec('CREATE INDEX IF NOT EXISTS idx_sessions_metric ON workout_sessions(metric_id, date)');
db.exec('CREATE INDEX IF NOT EXISTS idx_sets_session ON workout_sets(session_id)');

// A marathon is a run of N days you commit to, starting on a chosen day. Like
// the profile it hangs off no `metric_id`: it is something the person is doing,
// not a section of the app. Several can exist — an abandoned one is deleted,
// but a finished one stays as history — so "the current marathon" is a query
// rather than a flag, and nothing has to be cleared when a run ends.
db.exec(`
  CREATE TABLE IF NOT EXISTS marathons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    days INTEGER NOT NULL,
    start_date TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

// What the marathon is made of. `day` is what splits the two kinds the card
// offers from one table: NULL is a rule that applies to every day of the run,
// and a number 1…days is a one-off that belongs to that day alone. They are the
// same thing to everything downstream — something to be done on a date — so
// splitting them into two tables would only mean reading both everywhere.
db.exec(`
  CREATE TABLE IF NOT EXISTS marathon_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    marathon_id INTEGER NOT NULL REFERENCES marathons(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    day INTEGER,
    position INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

// One row per item actually done, on the day it was done. Keyed by (item, date)
// rather than carrying a `done` column on the item, because a daily rule is one
// row that has to be answerable thirty times over — once per day of the run.
db.exec(`
  CREATE TABLE IF NOT EXISTS marathon_ticks (
    item_id INTEGER NOT NULL REFERENCES marathon_items(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    PRIMARY KEY (item_id, date)
  )
`);

db.exec('CREATE INDEX IF NOT EXISTS idx_marathon_items ON marathon_items(marathon_id)');

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
