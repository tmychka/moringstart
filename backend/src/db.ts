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

db.exec(`
  CREATE TABLE IF NOT EXISTS metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'generic',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

// Migration: add `type` to metrics tables created before it existed, and backfill the
// two special metrics from the original seed so existing dev DBs keep their behavior.
const hasType = queryAll<{ name: string }>('PRAGMA table_info(metrics)').some(
  (col) => col.name === 'type',
);
if (!hasType) {
  db.exec("ALTER TABLE metrics ADD COLUMN type TEXT NOT NULL DEFAULT 'generic'");
  db.exec("UPDATE metrics SET type = 'notebook' WHERE id = 1 AND type = 'generic'");
  db.exec("UPDATE metrics SET type = 'steps' WHERE id = 4 AND type = 'generic'");
}

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
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

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

const count = queryOne<{ c: number }>('SELECT COUNT(*) as c FROM metrics');
if (count?.c === 0) {
  const insert = db.prepare('INSERT INTO metrics (name, type) VALUES (?, ?)');
  const seed: Array<[string, string]> = [
    ['Learn to code', 'notebook'],
    ['Learn English', 'generic'],
    ['Training', 'generic'],
    ['Min 10,000 steps', 'steps'],
    ['No content', 'generic'],
    ['Not bad food', 'generic'],
    ['Quality sleep', 'generic'],
  ];
  seed.forEach(([name, type]) => insert.run(name, type));
}

export default db;
