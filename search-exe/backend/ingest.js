// backend/ingest.js
//
// Reads every text file in data/, then writes searchIndex.json - the documents
// plus the inverted index the server searches against.
//
// This is the "offline" half of a search engine: slow work done once, so that
// queries can be fast.

const fs = require('fs');
const path = require('path');
const { buildIndex, tokenize, titleFromFilename } = require('./search');

const dataDir = path.join(__dirname, 'data');
const outputFile = path.join(__dirname, 'searchIndex.json');

if (!fs.existsSync(dataDir)) {
  console.error(`Data directory not found: ${dataDir}`);
  process.exit(1);
}

// Windows editors often save text as UTF-16 with a byte-order mark. Decode by
// the BOM if there is one, otherwise assume UTF-8.
function readTextFile(filePath) {
  const buf = fs.readFileSync(filePath);
  if (buf[0] === 0xFF && buf[1] === 0xFE) return buf.toString('utf16le', 2);
  if (buf[0] === 0xFE && buf[1] === 0xFF) return Buffer.from(buf.subarray(2)).swap16().toString('utf16le');

  const text = buf.toString('utf-8');
  return text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text; // strip a UTF-8 BOM
}

const files = fs
  .readdirSync(dataDir)
  .filter(file => fs.statSync(path.join(dataDir, file)).isFile());

const documents = files.map(file => {
  const content = readTextFile(path.join(dataDir, file)).replace(/\r\n/g, '\n').trim();

  return {
    filename: file,
    title: titleFromFilename(file),
    content,
    // Stored so TF-IDF can divide by it later instead of re-counting per query.
    wordCount: tokenize(content).length,
  };
});

const index = buildIndex(documents);

fs.writeFileSync(outputFile, JSON.stringify({ documents, index }, null, 2));

const termCount = Object.keys(index).length;
console.log(`Indexed ${documents.length} documents and ${termCount} unique terms.`);
console.log(`Wrote ${path.relative(process.cwd(), outputFile)}`);
