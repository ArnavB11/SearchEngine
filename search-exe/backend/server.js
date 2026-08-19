// backend/server.js
//
// The HTTP layer. It owns no search logic at all - it loads searchIndex.json
// and hands queries to search.js. Keeping them separate means the ranking code
// can be reasoned about (and unit tested) without starting a server.

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const engine = require('./search');

const app = express();
app.use(cors());

const indexPath = path.join(__dirname, 'searchIndex.json');
const EMPTY_DB = { documents: [], index: {} };

// Parsing the index on every request would be wasteful, so cache it in memory
// and only re-read when the file's modified time changes on disk. That way
// `npm run ingest` picks up without a server restart.
let cachedDb = EMPTY_DB;
let cachedMtime = 0;

function getDb() {
  try {
    const { mtimeMs } = fs.statSync(indexPath);

    if (mtimeMs !== cachedMtime) {
      const parsed = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
      cachedDb = parsed && parsed.documents ? parsed : EMPTY_DB;
      cachedMtime = mtimeMs;
      console.log(`Loaded index: ${cachedDb.documents.length} documents`);
    }
  } catch {
    // Missing or corrupt index - serve an empty one instead of crashing.
    cachedDb = EMPTY_DB;
    cachedMtime = 0;
  }

  return cachedDb;
}

// Query strings can arrive as arrays (?q=a&q=b), so always narrow to a string.
function readParam(value, fallback = '') {
  if (Array.isArray(value)) value = value[0];
  return typeof value === 'string' ? value : fallback;
}

// GET /api/search?q=react&page=1
app.get('/api/search', (req, res) => {
  const query = readParam(req.query.q).trim();
  const page = Number.parseInt(readParam(req.query.page, '1'), 10) || 1;

  if (!query) {
    return res.json({ results: [], total: 0, page: 1, pages: 0, tookMs: 0, terms: [], suggestion: null });
  }

  res.json(engine.search(getDb(), query, { page, pageSize: 10 }));
});

// GET /api/suggest?q=rea  ->  autocomplete for the search box
app.get('/api/suggest', (req, res) => {
  const query = readParam(req.query.q).trim();
  res.json({ suggestions: query ? engine.suggest(getDb(), query) : [] });
});

// GET /api/file/react-info.txt  ->  the full document
app.get('/api/file/:filename', (req, res) => {
  const doc = getDb().documents.find(d => d.filename === req.params.filename);

  if (!doc) return res.status(404).json({ error: 'File not found' });

  res.json({
    filename: doc.filename,
    title: doc.title,
    content: doc.content,
    wordCount: doc.wordCount,
    // A tiny "extractive summary": the document's first sentence or two.
    summary: engine.makeSnippet(doc.content, [], 220),
  });
});

// --- Probes -------------------------------------------------------------
// Two endpoints, because "is it alive" and "can it serve traffic" are different
// questions, and an orchestrator reacts to them differently.

// Liveness: is the process still running? If this stops answering, the
// container is wedged and Kubernetes should RESTART it. It deliberately checks
// nothing else - a liveness probe that fails for an external reason causes
// restart loops that make an outage worse.
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptimeSeconds: Math.round(process.uptime()) });
});

// Readiness: can THIS instance answer a search right now? An instance with no
// index loaded is running fine but has nothing to serve, so Kubernetes should
// take it out of the Service's load balancer rather than restart it, and put it
// back when the index appears.
app.get('/api/ready', (req, res) => {
  const db = getDb();

  if (db.documents.length === 0) {
    return res.status(503).json({ status: 'no index', documents: 0 });
  }

  res.json({ status: 'ready', documents: db.documents.length });
});

// GET /api/stats  ->  corpus size, shown in the UI footer
app.get('/api/stats', (req, res) => {
  const db = getDb();
  res.json({
    documents: db.documents.length,
    terms: Object.keys(db.index).length,
    words: db.documents.reduce((sum, doc) => sum + doc.wordCount, 0),
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
  getDb(); // warm the cache so the first search is fast
});
