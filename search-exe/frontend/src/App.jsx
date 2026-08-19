import { useEffect, useState } from 'react';
import Logo from './components/Logo';
import SearchBar from './components/SearchBar';
import DinoGame from './components/DinoGame';
import SearchResults, { ResultsSkeleton } from './components/SearchResults';
import Highlight from './components/Highlight';

// A few queries to show off on the landing page. They double as a hint about
// what is actually in the index.
const EXAMPLE_QUERIES = ['inverted index', 'tf-idf', 'react hooks', 'event loop', 'big o'];

export default function App() {
  const [playDino, setPlayDino] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState(null);
  const [theme, setTheme] = useState(
    // Remember the choice, but start from whatever the operating system prefers.
    () =>
      localStorage.getItem('theme') ||
      (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),
  );

  // --- Browser-style history stack ----------------------------------------
  // Rather than pull in a router, the app keeps its own stack of views plus a
  // pointer into it. Back and forward just move the pointer, which is exactly
  // how a browser's session history works.
  const [history, setHistory] = useState([{ view: 'home' }]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const current = history[currentIndex];

  const navigate = (nextView) => {
    // Navigating after going back discards the forward entries, same as a browser.
    const trimmed = history.slice(0, currentIndex + 1);
    setHistory([...trimmed, nextView]);
    setCurrentIndex(trimmed.length);
  };

  const goBack = () => currentIndex > 0 && setCurrentIndex(currentIndex - 1);
  const goForward = () => currentIndex < history.length - 1 && setCurrentIndex(currentIndex + 1);
  const goHome = () => navigate({ view: 'home' });

  // Apply the theme by setting one attribute on <html>; all the colours are CSS
  // variables that key off it, so no component needs to know about theming.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  // Corpus size for the footer. Fetched once; failure is not worth reporting.
  useEffect(() => {
    fetch('/api/stats')
      .then((r) => (r.ok ? r.json() : null))
      .then(setStats)
      .catch(() => {});
  }, []);

  // --- API calls ----------------------------------------------------------
  const runSearch = async (query, page = 1) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/search?q=${encodeURIComponent(query)}&page=${page}`,
      );
      // fetch only rejects on a network failure, so a 500 still lands here as a
      // resolved promise. The status has to be checked explicitly.
      if (!response.ok) throw new Error(`Search failed (${response.status})`);

      const data = await response.json();
      navigate({ view: 'results', query, ...data });
    } catch {
      setError('Could not reach the search backend. Is it running on port 5000?');
    } finally {
      setIsLoading(false);
    }
  };

  const openFile = async (filename) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/file/${encodeURIComponent(filename)}`);
      if (!response.ok) throw new Error(`File fetch failed (${response.status})`);

      const doc = await response.json();
      // Carry the current query's terms through so the open document can keep
      // the matched words highlighted.
      navigate({ view: 'file', doc, terms: current.terms || [] });
    } catch {
      setError('Could not load that document.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="app">
      <button
        className="theme-toggle"
        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        title="Toggle theme"
      >
        {theme === 'dark' ? '☀' : '☾'}
      </button>

      {/* Sticky header, on every page except the landing page */}
      {current.view !== 'home' && (
        <header className="header">
          <div className="nav-buttons">
            <button
              className="icon-button"
              onClick={goBack}
              disabled={currentIndex === 0}
              aria-label="Back"
            >
              &#8592;
            </button>
            <button
              className="icon-button"
              onClick={goForward}
              disabled={currentIndex === history.length - 1}
              aria-label="Forward"
            >
              &#8594;
            </button>
          </div>

          <button className="header__logo" onClick={goHome} title="Home">
            <span style={{ color: 'var(--blue)' }}>s</span>
            <span style={{ color: 'var(--red)' }}>.</span>
            <span style={{ color: 'var(--yellow)' }}>e</span>
            <span style={{ color: 'var(--green)' }}>x</span>
            <span style={{ color: 'var(--blue)' }}>e</span>
          </button>

          <div className="header__search">
            {/* Keying on the query makes React build a fresh SearchBar whenever
                the query changes, so the input shows the query that produced
                the results currently on screen. */}
            <SearchBar
              key={current.query || ''}
              initialQuery={current.query || ''}
              onSearch={runSearch}
            />
          </div>
        </header>
      )}

      {/* Landing page */}
      {current.view === 'home' && (
        <main className="home">
          <Logo />
          <SearchBar onSearch={runSearch} />

          <div className="button-row">
            {EXAMPLE_QUERIES.map((query) => (
              <button key={query} className="chip" onClick={() => runSearch(query)}>
                {query}
              </button>
            ))}
          </div>

          <div className="button-row">
            <button className="button" onClick={() => setPlayDino(true)}>
              🦖 Play T-Rex Runner
            </button>
          </div>
        </main>
      )}

      {/* Results and document pages */}
      {current.view !== 'home' && (
        <main className="page">
          {error && <div className="error">⚠ {error}</div>}

          {isLoading && <ResultsSkeleton />}

          {!isLoading && current.view === 'results' && (
            <SearchResults
              search={current}
              onOpenFile={openFile}
              onSearch={runSearch}
              onPageChange={(page) => runSearch(current.query, page)}
            />
          )}

          {!isLoading && current.view === 'file' && (
            <article className="doc">
              <h1 className="doc__title">{current.doc.title}</h1>
              <p className="doc__meta">
                data / {current.doc.filename} &middot; {current.doc.wordCount} words
              </p>

              <div className="doc__summary">
                <strong>Summary</strong>
                <p>{current.doc.summary}</p>
              </div>

              {/* The words that matched stay highlighted in the full text, so
                  the reader can see why this document came back. */}
              <div className="doc__body">
                <Highlight text={current.doc.content} terms={current.terms} />
              </div>
            </article>
          )}
        </main>
      )}

      {/* Errors on the landing page have no <main> to live in, so render here. */}
      {current.view === 'home' && error && (
        <div className="page">
          <div className="error">⚠ {error}</div>
        </div>
      )}

      {playDino && <DinoGame onClose={() => setPlayDino(false)} />}

      <footer className="footer">
        {stats
          ? `${stats.documents} documents · ${stats.terms} indexed terms · ${stats.words} words`
          : 'search.exe'}
      </footer>
    </div>
  );
}
