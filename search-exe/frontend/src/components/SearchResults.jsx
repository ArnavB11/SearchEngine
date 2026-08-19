import Highlight from './Highlight';

// Grey placeholder rows shown while a search is in flight. They occupy roughly
// the same space as a real result, so the page does not jump when data lands.
export function ResultsSkeleton({ rows = 4 }) {
  return (
    <div aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} style={{ marginBottom: 28 }}>
          <div className="skeleton skeleton--title" />
          <div className="skeleton" />
          <div className="skeleton skeleton--short" />
        </div>
      ))}
    </div>
  );
}

function Pagination({ page, pages, onPageChange }) {
  if (pages <= 1) return null;

  return (
    <nav className="pagination" aria-label="Result pages">
      <button onClick={() => onPageChange(page - 1)} disabled={page === 1}>
        &lsaquo;
      </button>

      {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
        <button
          key={n}
          // aria-current tells screen readers which page is active, and the CSS
          // styles the active button off the same attribute.
          aria-current={n === page}
          onClick={() => onPageChange(n)}
        >
          {n}
        </button>
      ))}

      <button onClick={() => onPageChange(page + 1)} disabled={page === pages}>
        &rsaquo;
      </button>
    </nav>
  );
}

export default function SearchResults({ search, onOpenFile, onSearch, onPageChange }) {
  const { results, total, page, pages, tookMs, terms, suggestion, query } = search;

  return (
    <div>
      <p className="result-meta">
        {total > 0
          ? `About ${total} result${total === 1 ? '' : 's'} (${(tookMs / 1000).toFixed(3)} seconds)`
          : `No results for "${query}"`}
      </p>

      {suggestion && (
        <p className="suggestion-line">
          Did you mean{' '}
          <button onClick={() => onSearch(suggestion)}>{suggestion}</button>?
        </p>
      )}

      {total === 0 && (
        <div className="empty">
          <div className="empty__icon">🔍</div>
          <p>Nothing in the index matched that.</p>
          <p style={{ fontSize: 13 }}>Try "react", "tf-idf", or "event loop".</p>
        </div>
      )}

      {results.map((result, i) => (
        <article
          key={result.filename}
          className="result"
          // Staggering the fade-in makes the list feel like it is arriving
          // rather than snapping into place. Capped so page 2 is not slow.
          style={{ animationDelay: `${Math.min(i, 6) * 45}ms` }}
        >
          <span className="result__path">data / {result.filename}</span>

          <h3>
            <button className="result__title" onClick={() => onOpenFile(result.filename)}>
              <Highlight text={result.title} terms={terms} />
            </button>
          </h3>

          <p className="result__snippet">
            <Highlight text={result.snippet} terms={terms} />
          </p>

          {/* Exposing the score is unusual for a search engine, but it makes the
              ranking visible instead of magic. */}
          <span className="result__stats">
            {result.wordCount} words &middot; relevance {result.score.toFixed(4)}
          </span>
        </article>
      ))}

      <Pagination page={page} pages={pages} onPageChange={onPageChange} />
    </div>
  );
}
