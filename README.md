# search.exe

A small Google-style search engine. An Express backend indexes the text files in
`search-exe/backend/data/` and exposes a search API; a React (Vite) frontend
provides the search UI, result pages, and a T-Rex runner easter egg.

## Project layout

```
search-exe/
  backend/    Express API (port 5000)
    data/     Text documents to index
    ingest.js Builds searchIndex.json from data/
    server.js API: /api/search?q=... and /api/file/:filename
  frontend/   React + Vite UI (port 5173, proxies /api to the backend)
```

## Running it

You need Node.js 18+ and two terminals.

**Terminal 1 — backend:**

```sh
cd search-exe/backend
npm install
npm run ingest   # rebuild searchIndex.json from the data/ folder
npm start        # serves the API on http://localhost:5000
```

**Terminal 2 — frontend:**

```sh
cd search-exe/frontend
npm install
npm run dev      # serves the UI on http://localhost:5173
```

Then open http://localhost:5173 and search for something like `react` or `node`.

## Adding documents

Drop `.txt` files into `search-exe/backend/data/` and re-run `npm run ingest`
in the backend folder (restarting the server is not required — it reloads the
index automatically when the file changes).
