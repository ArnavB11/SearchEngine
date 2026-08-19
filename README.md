# search.exe

A small search engine built from scratch. The interesting part is not the UI —
it is that the backend does not scan documents for a substring. It builds an
**inverted index** at ingest time and **ranks** matches with TF-IDF at query
time, the same shape as a real search engine, in about 300 readable lines.

There is also a **T-Rex runner** written from scratch on a `<canvas>` — parallax
scenery, a day/night cycle, particles and pterodactyls, all drawn with
rectangles and driven by one `requestAnimationFrame` loop.

```
search-exe/
  backend/                 Express API (port 5000)
    data/                  The .txt documents that get indexed
    search.js              The engine: tokenizer, index, TF-IDF, snippets, spell check
    search.test.js         28 tests (node --test, no dependencies)
    ingest.js              Builds searchIndex.json from data/
    server.js              HTTP layer only - no search logic lives here
  frontend/                React + Vite (port 5173, proxies /api to the backend)
    src/game/dinoEngine.js The game rules: plain JS, no React, no DOM
    src/game/*.test.js     20 tests, including the physics
    src/components/        Logo, SearchBar, SearchResults, Highlight, DinoGame
```

## Running it

Node.js 18+ and two terminals.

```sh
# Terminal 1 - backend
cd search-exe/backend
npm install
npm run ingest      # build searchIndex.json from data/
npm start           # http://localhost:5000

# Terminal 2 - frontend
cd search-exe/frontend
npm install
npm run dev         # http://localhost:5173
```

Then try `inverted index`, `tf-idf`, `event loop`, or misspell something like
`levenshtien` to see the spell correction.

```sh
npm test            # works in both folders
npm run lint        # frontend
```

## How the search works

**1. Ingest (offline, once).** `ingest.js` reads every file in `data/`,
tokenizes it, and builds the inverted index.

A forward index maps a document to its words. An inverted index flips it, which
is the question a search actually asks — *which documents contain "react"?*

```js
// { term: { docId: timesItAppearsInThatDoc } }
{ react: { "0": 3, "2": 1 }, hooks: { "0": 5 } }
```

Looking up a word is now a hash-map hit plus work proportional only to the
number of matching documents, instead of a scan over the whole corpus.

**2. Query (online, per request).** `search.js` scores every candidate document
with **TF-IDF**:

- **TF** — how often the term appears in *this* document, divided by the
  document's length, so long documents don't win just for being long.
- **IDF** — `log(1 + N / documentsContainingTheTerm)`. A word in every document
  tells you nothing; a word in one document is a strong signal.

Two adjustments on top of that:

- a **title boost**, because a filename match is usually what was meant;
- a **coverage multiplier**, squared. TF-IDF scores each word independently, so
  searching *"delta time"* would otherwise let a document that just says "time"
  a lot beat one that actually discusses both words.

**3. Presentation.** Snippets are cut from around the first match rather than
from the start of the file, and the API returns which terms matched so the
frontend can wrap them in `<mark>`.

**4. Typos.** When a query word is missing from the vocabulary, the engine finds
the closest real word by **Damerau-Levenshtein distance** — Levenshtein plus the
transposition case, so `dgos` → `dogs` costs 1 edit instead of 2. That case
matters: swapping two adjacent letters is the most common way people mistype.
Candidates whose length differs by more than the edit budget are rejected
without computing the distance at all.

### API

| Endpoint | Returns |
|---|---|
| `GET /api/search?q=&page=` | ranked results, total, page count, timing, matched terms, spelling suggestion |
| `GET /api/suggest?q=` | autocomplete terms for the search box |
| `GET /api/file/:filename` | one full document |
| `GET /api/stats` | corpus size |

## How the game works

`src/game/dinoEngine.js` holds the rules and knows nothing about React:
`createGame()`, `updateGame(state, dt)`, `drawGame(ctx, state)`. `DinoGame.jsx`
only owns the canvas, the loop and the keyboard.

That split is why the physics can be tested at all — the test suite runs three
simulated minutes of gameplay in Node, with a stub canvas context that records
draw calls instead of painting them. It checks that a jump clears the tallest
cactus, that movement is frame-rate independent, that nothing leaks, and that
**every obstacle gap stays wider than the distance one jump covers** — that
last check caught a real bug where obstacles at high speed spawned closer than
a jump was long, so the player landed on the next cactus with no way to avoid it.

A few details worth knowing:

- **Delta time.** Every movement is multiplied by the seconds since the last
  frame. Moving a fixed number of pixels per frame would run the game at double
  speed on a 120hz monitor.
- **The world lives in a `useRef`, not `useState`.** Nothing in the JSX depends
  on the score — the canvas draws it — so the component never re-renders during
  play.
- **Cleanup.** The effect returns a function that cancels the animation frame
  and removes the key listeners. Without it, closing the modal would leave the
  loop running forever.

## Adding documents

Drop `.txt` files into `search-exe/backend/data/` and re-run `npm run ingest`.
The server notices the index file's modified time has changed and reloads it, so
no restart is needed. UTF-16 files (what Notepad produces by default on Windows)
are decoded by their byte-order mark.
