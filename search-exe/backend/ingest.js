// backend/ingest.js
const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, 'data');
const outputFile = path.join(__dirname, 'searchIndex.json');

if (!fs.existsSync(dataDir)) {
  console.error(`❌ Data directory not found: ${dataDir}`);
  process.exit(1);
}

const files = fs.readdirSync(dataDir).filter(file =>
  fs.statSync(path.join(dataDir, file)).isFile()
);

// Windows editors often save text as UTF-16 with a BOM; decode by BOM, default to UTF-8
const readTextFile = (filePath) => {
  const buf = fs.readFileSync(filePath);
  if (buf[0] === 0xFF && buf[1] === 0xFE) return buf.toString('utf16le', 2);
  if (buf[0] === 0xFE && buf[1] === 0xFF) return Buffer.from(buf.subarray(2)).swap16().toString('utf16le');
  const text = buf.toString('utf-8');
  return text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
};

const index = files.map(file => {
  const content = readTextFile(path.join(dataDir, file));

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
