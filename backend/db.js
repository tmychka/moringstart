const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const db = new DatabaseSync(path.join(__dirname, 'metrics.sqlite'));

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
const hasType = db
  .prepare('PRAGMA table_info(metrics)')
  .all()
  .some((col) => col.name === 'type');
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

const count = db.prepare('SELECT COUNT(*) as c FROM metrics').get();
if (count.c === 0) {
  const insert = db.prepare('INSERT INTO metrics (name, type) VALUES (?, ?)');
  [
    ['Learn to code', 'notebook'],
    ['Learn English', 'generic'],
    ['Training', 'generic'],
    ['Min 10,000 steps', 'steps'],
    ['No content', 'generic'],
    ['Not bad food', 'generic'],
    ['Quality sleep', 'generic'],
  ].forEach(([name, type]) => insert.run(name, type));
}

module.exports = db;
