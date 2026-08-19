// backend/search.js
//
// The search engine core. Kept in its own file (no Express in here) so the
// ranking logic is easy to read, test, and explain on its own.
//
// The big idea: instead of scanning every document for every query (slow, and
// gives no sense of *relevance*), we build an INVERTED INDEX once at ingest
// time and rank the matches with TF-IDF at query time.

// Very common words carry almost no signal, so we drop them from the index.
// (Real engines use much bigger lists; this is enough to show the idea.)
const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'for', 'from', 'has',
  'have', 'he', 'in', 'is', 'it', 'its', 'of', 'on', 'or', 'she', 'that', 'the',
  'their', 'them', 'then', 'there', 'these', 'they', 'this', 'to', 'was', 'were',
  'will', 'with', 'you', 'your',
]);

/**
 * Split raw text into lowercase words.
 * "Node.js is cross-platform!" -> ["node", "js", "is", "cross", "platform"]
 */
function tokenize(text) {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/) // anything that is not a letter or digit is a separator
    .filter(Boolean);    // drop the empty strings the split leaves behind
}

/**
 * The tokens we actually want in the index: no stopwords, no single characters.
 */
function indexableTokens(text) {
  return tokenize(text).filter(t => t.length > 1 && !STOPWORDS.has(t));
}

/**
 * Turn a filename into a human title: "node-info.txt" -> "Node Info"
 */
function titleFromFilename(filename) {
  return filename
    .replace(/\.[^.]+$/, '') // strip the extension
    .split(/[-_\s]+/)        // split on dashes / underscores / spaces
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Build the inverted index.
 *
 * A normal ("forward") index answers: what words are in document 3?
 * An inverted index answers the question a search engine actually asks:
 * which documents contain the word "react"?
 *
 * Shape: { react: { "0": 3, "2": 1 } }
 *          term     docId, times it appears in that document
 */
function buildIndex(documents) {
  const index = {};

  documents.forEach((doc, docId) => {
    // Index the title too, so a filename match still counts as a hit.
    const tokens = indexableTokens(doc.title + ' ' + doc.content);

    for (const term of tokens) {
      if (!index[term]) index[term] = {};
      index[term][docId] = (index[term][docId] || 0) + 1;
    }
  });

  return index;
}

/**
 * Expand one query term into the index terms it should match.
 *
 * - exact hit -> just that term ("react" -> ["react"])
 * - no hit    -> prefix matches, so typing "reac" already finds "react"
 */
function expandTerm(index, term) {
  if (index[term]) return [term];

  return Object.keys(index)
    .filter(indexTerm => indexTerm.startsWith(term))
    .slice(0, 10); // cap the work so a one-letter query cannot blow up
}

/**
 * TF-IDF: the classic way to score "how relevant is this document to this word".
 *
 *   TF  (term frequency)        how often the word appears in THIS document,
 *                               divided by the document length so that long
 *                               documents do not win just by being long.
 *
 *   IDF (inverse doc frequency) how rare the word is across ALL documents.
 *                               A word in every document tells us nothing;
 *                               a word in only one document is a strong signal.
 *
 *   score = sum over the query terms of (TF * IDF)
 *
 * On top of that we apply a coverage multiplier, because TF-IDF alone scores
 * each word independently. Searching "delta time" would otherwise let a
 * document that says "time" a lot outrank one that discusses both words, which
 * is not what the user asked for.
 */
function scoreDocuments(db, queryTerms) {
  const totalDocs = db.documents.length;
  const scores = new Map();      // docId -> raw TF-IDF total
  const coverage = new Map();    // docId -> Set of query terms it matched
  const matchedTerms = new Set(); // the index terms we actually hit

  for (const rawTerm of queryTerms) {
    for (const term of expandTerm(db.index, rawTerm)) {
      const postings = db.index[term]; // { docId: count }
      const docFrequency = Object.keys(postings).length;
      const idf = Math.log(1 + totalDocs / docFrequency);

      matchedTerms.add(term);

      for (const docId of Object.keys(postings)) {
        const id = Number(docId);
        const doc = db.documents[id];
        const tf = postings[docId] / Math.max(doc.wordCount, 1);

        let points = tf * idf;

        // Small boost when the word is in the title: a filename match is
        // usually what the user meant.
        if (doc.title.toLowerCase().includes(term)) points *= 1.5;

        scores.set(id, (scores.get(id) || 0) + points);

        if (!coverage.has(id)) coverage.set(id, new Set());
        coverage.get(id).add(rawTerm); // count the *query* word, not the expansion
      }
    }
  }

  // Matching 2 of 2 words keeps the full score; 1 of 2 keeps a quarter of it.
  // Squaring makes the gap wide enough that partial matches sink below full ones.
  for (const [docId, score] of scores) {
    const fraction = coverage.get(docId).size / queryTerms.length;
    scores.set(docId, score * fraction * fraction);
  }

  return { scores, matchedTerms: [...matchedTerms] };
}

/**
 * Pull a readable snippet out of the document, centred on the first place a
 * query term appears - the same thing Google shows under each result.
 */
function makeSnippet(content, terms, maxLength = 200) {
  const haystack = content.toLowerCase();

  // Find the earliest position where any query term appears.
  let hit = -1;
  for (const term of terms) {
    const at = haystack.indexOf(term);
    if (at !== -1 && (hit === -1 || at < hit)) hit = at;
  }

  // No term in the body (a title-only match): just show the opening.
  if (hit === -1) {
    const opening = content.slice(0, maxLength).trim();
    return content.length > maxLength ? opening + '...' : opening;
  }

  // Start a little before the hit so it has some context around it.
  let start = Math.max(0, hit - 60);

  // Do not cut a word in half - walk forward to the next space.
  if (start > 0) {
    const space = content.indexOf(' ', start);
    if (space !== -1 && space < start + 20) start = space + 1;
  }

  const end = Math.min(content.length, start + maxLength);
  const snippet = content.slice(start, end).trim();

  return (start > 0 ? '...' : '') + snippet + (end < content.length ? '...' : '');
}

/**
 * Damerau-Levenshtein distance: how many single-character edits it takes to
 * turn `a` into `b`, where an edit is an insert, a delete, a replace, or a swap
 * of two adjacent characters.
 *
 * The swap is the part worth knowing about. Plain Levenshtein charges 2 for
 * "dgos" -> "dogs", because it can only get there by two replacements - yet
 * transposing two letters is the single most common way people mistype a word.
 * Counting it as 1 edit is what makes the spell corrector actually catch typos.
 *
 * The classic dynamic-programming table: cell [i][j] holds the distance between
 * the first i characters of `a` and the first j of `b`. Each cell needs the row
 * above it, and the transposition case needs the row above that, so we keep
 * three rows instead of the whole table - O(n*m) time, O(m) memory.
 */
function editDistance(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  let beforePrevious = [];
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);

  for (let i = 1; i <= a.length; i++) {
    const current = [i];

    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;

      current[j] = Math.min(
        previous[j] + 1,        // delete a character from a
        current[j - 1] + 1,     // insert a character into a
        previous[j - 1] + cost, // replace (or keep) the character
      );

      // Transposition: the last two characters of each string are the same
      // pair, in the opposite order. One swap gets from one to the other.
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        current[j] = Math.min(current[j], beforePrevious[j - 2] + 1);
      }
    }

    beforePrevious = previous;
    previous = current;
  }

  return previous[b.length];
}

/**
 * "Did you mean ...?" - for every query word with no match, find the closest
 * word in the index vocabulary within a small edit distance.
 *
 * The length pre-filter matters for speed: comparing against every word in the
 * vocabulary would be slow, and two words whose lengths differ by more than the
 * budget can never be within it, so most candidates are rejected for free.
 */
function didYouMean(db, queryTerms) {
  const vocabulary = Object.keys(db.index);
  let changed = false;

  const corrected = queryTerms.map(term => {
    if (db.index[term]) return term; // spelled fine

    // Allow more typos in longer words: 1 edit for short words, 2 once the
    // word is long enough that two edits still leave plenty of signal.
    const budget = term.length >= 5 ? 2 : 1;
    let best = null;
    let bestDistance = Infinity;

    for (const word of vocabulary) {
      // Lengths differing by more than the budget can never be within it, so
      // skip the expensive distance calculation entirely.
      if (Math.abs(word.length - term.length) > budget) continue;

      const distance = editDistance(term, word);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = word;
      }
    }

    if (best && bestDistance <= budget) {
      changed = true;
      return best;
    }
    return term;
  });

  return changed ? corrected.join(' ') : null;
}

/**
 * Autocomplete: index terms starting with what the user has typed so far,
 * the most widely used ones first.
 */
function suggest(db, prefix, limit = 6) {
  const lastWord = tokenize(prefix).pop() || '';
  if (!lastWord) return [];

  return Object.keys(db.index)
    .filter(term => term.startsWith(lastWord) && term !== lastWord)
    // Rank by how many documents use the word - popular words are better guesses.
    .sort((a, b) => Object.keys(db.index[b]).length - Object.keys(db.index[a]).length)
    .slice(0, limit);
}

/**
 * The full query pipeline: parse -> score -> sort -> paginate -> snippet.
 */
function search(db, queryText, { page = 1, pageSize = 10 } = {}) {
  const startedAt = Date.now();
  const queryTerms = indexableTokens(queryText);

  if (queryTerms.length === 0) {
    return { results: [], total: 0, page: 1, pages: 0, tookMs: 0, terms: [], suggestion: null };
  }

  const { scores, matchedTerms } = scoreDocuments(db, queryTerms);

  const ranked = [...scores.entries()]
    .sort((a, b) => b[1] - a[1]); // highest score first

  const total = ranked.length;
  const pages = Math.ceil(total / pageSize);
  const safePage = Math.min(Math.max(page, 1), Math.max(pages, 1));
  const pageSlice = ranked.slice((safePage - 1) * pageSize, safePage * pageSize);

  const results = pageSlice.map(([docId, score]) => {
    const doc = db.documents[docId];
    return {
      filename: doc.filename,
      title: doc.title,
      snippet: makeSnippet(doc.content, matchedTerms),
      score: Number(score.toFixed(4)),
      wordCount: doc.wordCount,
    };
  });

  return {
    results,
    total,
    page: safePage,
    pages,
    tookMs: Date.now() - startedAt,
    terms: matchedTerms,
    // Offer a correction whenever a word is missing from the vocabulary, not
    // just on zero results - a partial match still deserves "did you mean".
    suggestion: queryTerms.some(t => !db.index[t]) ? didYouMean(db, queryTerms) : null,
  };
}

module.exports = {
  tokenize,
  indexableTokens,
  titleFromFilename,
  buildIndex,
  makeSnippet,
  editDistance,
  didYouMean,
  suggest,
  search,
};
