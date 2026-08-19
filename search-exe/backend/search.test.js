// backend/search.test.js
//
// Tests for the search engine, using Node's built-in test runner - no Jest, no
// dependencies. Run them with `npm test`.

const test = require('node:test');
const assert = require('node:assert');
const engine = require('./search');

// A tiny hand-written corpus, so every expected ranking can be reasoned about
// by hand rather than depending on the real data folder.
const DOCS = [
  { filename: 'cats.txt', title: 'Cats', content: 'Cats are small animals. Cats purr. Cats sleep a lot.' },
  { filename: 'dogs.txt', title: 'Dogs', content: 'Dogs are loyal animals. Dogs bark at the postman.' },
  { filename: 'animals.txt', title: 'Animals', content: 'Animals are living things. Cats and dogs are both animals kept as pets.' },
];

function makeDb() {
  const documents = DOCS.map(doc => ({
    ...doc,
    wordCount: engine.tokenize(doc.content).length,
  }));
  return { documents, index: engine.buildIndex(documents) };
}

const db = makeDb();

test('tokenize lowercases and splits on non-alphanumerics', () => {
  assert.deepStrictEqual(
    engine.tokenize('Node.js is cross-platform!'),
    ['node', 'js', 'is', 'cross', 'platform'],
  );
});

test('tokenize produces no empty strings', () => {
  assert.deepStrictEqual(engine.tokenize('  ...  '), []);
  assert.deepStrictEqual(engine.tokenize(''), []);
});

test('indexableTokens drops stopwords and single characters', () => {
  // "the" and "a" are stopwords, "x" is a single character.
  assert.deepStrictEqual(engine.indexableTokens('the cat a x dog'), ['cat', 'dog']);
});

test('titleFromFilename makes a readable title', () => {
  assert.strictEqual(engine.titleFromFilename('node-info.txt'), 'Node Info');
  assert.strictEqual(engine.titleFromFilename('big_o_notation.md'), 'Big O Notation');
});

test('the inverted index maps a term to its documents and counts', () => {
  // "cats" appears 3 times in the body of doc 0 plus once in its title, and
  // once in doc 2. It is absent from doc 1, so doc 1 has no entry at all.
  assert.strictEqual(db.index.cats['0'], 4);
  assert.strictEqual(db.index.cats['2'], 1);
  assert.strictEqual(db.index.cats['1'], undefined);
});

test('the index includes words from the title', () => {
  // "animals" is both a title and a body word.
  assert.ok(db.index.animals['2'] >= 2);
});

test('search ranks the document that is most about the term first', () => {
  const { results } = engine.search(db, 'cats');
  assert.strictEqual(results[0].filename, 'cats.txt');
});

test('a rare term outranks a common one (this is IDF working)', () => {
  // "purr" appears in one document, so it is a much stronger signal than
  // "animals", which appears in all three.
  const purr = engine.search(db, 'purr');
  const animals = engine.search(db, 'animals');
  assert.strictEqual(purr.total, 1);
  assert.strictEqual(animals.total, 3);
  assert.ok(purr.results[0].score > animals.results[2].score);
});

test('matching both query words beats matching only one', () => {
  // animals.txt is the only document containing "cats" AND "dogs".
  const { results } = engine.search(db, 'cats dogs');
  assert.strictEqual(results[0].filename, 'animals.txt');
});

test('a prefix finds the full word', () => {
  const { results, total } = engine.search(db, 'postm');
  assert.strictEqual(total, 1);
  assert.strictEqual(results[0].filename, 'dogs.txt');
});

test('an empty or stopword-only query returns nothing rather than everything', () => {
  for (const query of ['', '   ', 'the and of']) {
    assert.strictEqual(engine.search(db, query).total, 0, `query: "${query}"`);
  }
});

test('a query matching nothing returns no results and does not throw', () => {
  const { results, total } = engine.search(db, 'zzzqqq');
  assert.strictEqual(total, 0);
  assert.deepStrictEqual(results, []);
});

test('results report the terms that matched, for highlighting', () => {
  const { terms } = engine.search(db, 'cats');
  assert.ok(terms.includes('cats'));
});

test('editDistance counts single-character edits', () => {
  assert.strictEqual(engine.editDistance('react', 'react'), 0);
  assert.strictEqual(engine.editDistance('cat', 'cart'), 1);       // one insert
  assert.strictEqual(engine.editDistance('cart', 'cat'), 1);       // one delete
  assert.strictEqual(engine.editDistance('cat', 'bat'), 1);        // one replace
  assert.strictEqual(engine.editDistance('kitten', 'sitting'), 3);
  assert.strictEqual(engine.editDistance('', 'abc'), 3);
});

test('editDistance charges only 1 for swapped adjacent letters', () => {
  // This is the Damerau part. Plain Levenshtein would say 2 for each of these,
  // which is too far for the spell corrector to accept on a short word.
  assert.strictEqual(engine.editDistance('raect', 'react'), 1);
  assert.strictEqual(engine.editDistance('dgos', 'dogs'), 1);
  assert.strictEqual(engine.editDistance('teh', 'the'), 1);
});

test('editDistance is symmetric', () => {
  for (const [a, b] of [['dgos', 'dogs'], ['kitten', 'sitting'], ['cat', 'cart']]) {
    assert.strictEqual(engine.editDistance(a, b), engine.editDistance(b, a), `${a}/${b}`);
  }
});

test('didYouMean corrects a typo to a word in the vocabulary', () => {
  const { suggestion } = engine.search(db, 'dgos');
  assert.strictEqual(suggestion, 'dogs');
});

test('a correctly spelled query gets no suggestion', () => {
  assert.strictEqual(engine.search(db, 'dogs').suggestion, null);
});

test('a word too far from anything real gets no suggestion', () => {
  assert.strictEqual(engine.search(db, 'zzzqqqxyz').suggestion, null);
});

test('suggest autocompletes on a prefix', () => {
  assert.deepStrictEqual(engine.suggest(db, 'pur'), ['purr']);
  assert.deepStrictEqual(engine.suggest(db, 'zzz'), []);
});

test('suggest completes only the last word being typed', () => {
  assert.ok(engine.suggest(db, 'cats pur').includes('purr'));
});

test('suggest ranks words used in more documents first', () => {
  // "animals" is in all three documents, "animal" nowhere else, so a shared
  // prefix should surface the more common word first.
  const suggestions = engine.suggest(db, 'an');
  assert.strictEqual(suggestions[0], 'animals');
});

test('makeSnippet centres the snippet on the matched term', () => {
  const content = 'a'.repeat(300) + ' needle ' + 'b'.repeat(300);
  const snippet = engine.makeSnippet(content, ['needle']);
  assert.ok(snippet.includes('needle'));
  assert.ok(snippet.length < 220, `snippet was ${snippet.length} chars`);
  assert.ok(snippet.startsWith('...'), 'should mark that text was cut from the start');
  assert.ok(snippet.endsWith('...'), 'should mark that text was cut from the end');
});

test('makeSnippet falls back to the opening when the term is not in the body', () => {
  const snippet = engine.makeSnippet('Hello world, this is the start.', ['missing']);
  assert.ok(snippet.startsWith('Hello world'));
});

test('makeSnippet leaves a short document untouched', () => {
  assert.strictEqual(engine.makeSnippet('Short text.', ['short']), 'Short text.');
});

test('pagination slices the ranked list and reports the page count', () => {
  const many = Array.from({ length: 25 }, (_, i) => ({
    filename: `doc${i}.txt`,
    title: `Doc ${i}`,
    content: 'shared keyword ' + 'filler '.repeat(i + 1),
    wordCount: 2 + (i + 1),
  }));
  const bigDb = { documents: many, index: engine.buildIndex(many) };

  const page1 = engine.search(bigDb, 'keyword', { page: 1 });
  assert.strictEqual(page1.total, 25);
  assert.strictEqual(page1.pages, 3);
  assert.strictEqual(page1.results.length, 10);

  const page3 = engine.search(bigDb, 'keyword', { page: 3 });
  assert.strictEqual(page3.results.length, 5);
  // No document should appear on two pages.
  const overlap = page3.results.filter(r =>
    page1.results.some(p => p.filename === r.filename));
  assert.deepStrictEqual(overlap, []);
});

test('an out-of-range page is clamped instead of returning nothing', () => {
  const page = engine.search(db, 'animals', { page: 99 });
  assert.strictEqual(page.page, 1);
  assert.ok(page.results.length > 0);
});

test('searching an empty index does not throw', () => {
  const empty = { documents: [], index: {} };
  assert.strictEqual(engine.search(empty, 'anything').total, 0);
  assert.deepStrictEqual(engine.suggest(empty, 'any'), []);
});
