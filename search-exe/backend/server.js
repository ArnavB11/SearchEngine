// backend/server.js
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());

// Helper function to read our "database"
const getIndex = () => {
  const indexPath = path.join(__dirname, 'searchIndex.json');
  if (!fs.existsSync(indexPath)) return [];
  return JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
};

// Search Endpoint
app.get('/api/search', (req, res) => {
  const query = req.query.q.toLowerCase();
  const index = getIndex();
  
  // Search through filename OR content
  const results = index.filter(item => 
    item.filename.toLowerCase().includes(query) || 
    item.content.toLowerCase().includes(query)
  ).map(item => ({ 
    filename: item.filename, 
    summary: item.summary 
  })); 
  
  res.json({ results });
});

// Fetch Single File Details Endpoint
app.get('/api/file/:filename', (req, res) => {
  const index = getIndex();
  const file = index.find(f => f.filename === req.params.filename);
  
  if (file) {
    res.json(file);
  } else {
    res.status(404).json({ error: "File not found" });
  }
});

app.listen(5000, () => console.log('Backend running on port 5000'));