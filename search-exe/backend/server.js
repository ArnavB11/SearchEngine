// backend/server.js
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());

const indexPath = path.join(__dirname, 'searchIndex.json');

// Cache the index in memory; reload only when the file changes on disk
let cachedIndex = [];
let cachedMtime = 0;
const getIndex = () => {
  try {
    const { mtimeMs } = fs.statSync(indexPath);
    if (mtimeMs !== cachedMtime) {
      cachedIndex = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
      cachedMtime = mtimeMs;
    }
  } catch {
    // Missing or corrupt index file — serve an empty index instead of crashing
    cachedIndex = [];
    cachedMtime = 0;
  }
  return cachedIndex;
};

// Search Endpoint
app.get('/api/search', (req, res) => {
  const raw = req.query.q;
  const query = String(Array.isArray(raw) ? raw[0] : raw || '').trim().toLowerCase();
  if (!query) return res.json({ results: [] });

  // Search through filename OR content
  const results = getIndex()
    .filter(item =>
      item.filename.toLowerCase().includes(query) ||
      item.content.toLowerCase().includes(query)
    )
    .map(item => ({
      filename: item.filename,
      summary: item.summary
    }));

  res.json({ results });
});

// Fetch Single File Details Endpoint
app.get('/api/file/:filename', (req, res) => {
  const file = getIndex().find(f => f.filename === req.params.filename);

  if (file) {
    res.json(file);
  } else {
    res.status(404).json({ error: 'File not found' });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));
