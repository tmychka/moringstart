const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const db = new DatabaseSync(path.join(__dirname, 'metrics.sqlite'));

db.exec(`
  CREATE TABLE IF NOT EXISTS metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

const count = db.prepare('SELECT COUNT(*) as c FROM metrics').get();
if (count.c === 0) {
  const insert = db.prepare('INSERT INTO metrics (name) VALUES (?)');
  ['Learn to code', 'Learn English', 'Training', 'Min 10,000 steps', 'No content', 'Not bad food', 'Quality sleep']
    .forEach(name => insert.run(name));
}

module.exports = db;
