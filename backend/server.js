const express = require('express');
const cors = require('cors');
const db = require('./db');

const app = express();
const PORT = 3000;

app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json());

app.get('/metrics', (req, res) => {
  const rows = db.prepare('SELECT * FROM metrics ORDER BY created_at ASC').all();
  res.json(rows);
});

app.post('/metrics', (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'name required' });
  const info = db.prepare('INSERT INTO metrics (name) VALUES (?)').run(name.trim());
  const row = db.prepare('SELECT * FROM metrics WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(row);
});

app.put('/metrics/:id', (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'name required' });
  const info = db.prepare('UPDATE metrics SET name = ? WHERE id = ?').run(name.trim(), req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'not found' });
  const row = db.prepare('SELECT * FROM metrics WHERE id = ?').get(req.params.id);
  res.json(row);
});

app.delete('/metrics/:id', (req, res) => {
  const info = db.prepare('DELETE FROM metrics WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'not found' });
  res.status(204).end();
});

app.listen(PORT, () => console.log(`Backend running on http://localhost:${PORT}`));
