// backend/ingest.js
const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, 'data');
const outputFile = path.join(__dirname, 'searchIndex.json');

const files = fs.readdirSync(dataDir);
const index = files.map(file => {
  const content = fs.readFileSync(path.join(dataDir, file), 'utf-8');
  
  // Basic programmatic summary: Grab the first 100 characters
  const summary = content.length > 100 ? content.substring(0, 100) + '...' : content;
  
  return { 
    filename: file, 
    content: content, 
    summary: summary 
  };
});

fs.writeFileSync(outputFile, JSON.stringify(index, null, 2));
console.log(`✅ Successfully ingested ${files.length} files into searchIndex.json`);