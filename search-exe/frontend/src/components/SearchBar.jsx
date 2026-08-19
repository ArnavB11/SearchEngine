import { useEffect, useRef, useState } from 'react';

// Small inline SVGs so the app needs no icon library.
const MagnifierIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
    <path
      fill="currentColor"
      d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"
    />
  </svg>
);

const CloseIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
    <path
      fill="currentColor"
      d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
    />
  </svg>
);

export default function SearchBar({ onSearch, initialQuery = '' }) {
  const [query, setQuery] = useState(initialQuery);
  const [suggestions, setSuggestions] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  // Which suggestion the arrow keys have landed on. -1 = none, so Enter
  // searches whatever is typed in the box.
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef(null);

  // --- Autocomplete, debounced -------------------------------------------
  // Firing a request per keystroke would send one request per character. This
  // effect instead sets a 180ms timer; because the cleanup function clears the
  // previous timer, every new keystroke cancels the pending request and only
  // the last one in a burst of typing survives to fire.
  useEffect(() => {
    const text = query.trim();

    const timer = setTimeout(async () => {
      // One letter matches almost everything, so it is not a useful suggestion.
      if (text.length < 2) {
        setSuggestions([]);
        return;
      }

      try {
        const response = await fetch(`/api/suggest?q=${encodeURIComponent(text)}`);
        if (!response.ok) return;
        const data = await response.json();
        setSuggestions(data.suggestions);
      } catch {
        setSuggestions([]); // autocomplete is optional, so failures stay silent
      }
    }, 180);

    return () => clearTimeout(timer);
  }, [query]);

  // Clicking anywhere outside the component closes the dropdown.
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const runSearch = (text) => {
    if (!text.trim()) return;
    setQuery(text);
    setIsOpen(false);
    setActiveIndex(-1);
    onSearch(text.trim());
  };

  const showSuggestions = isOpen && suggestions.length > 0;

  // --- Keyboard navigation ------------------------------------------------
  const handleKeyDown = (event) => {
    if (event.key === 'Escape') {
      setIsOpen(false);
      setActiveIndex(-1);
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      // Enter takes the highlighted suggestion if there is one, otherwise the
      // raw text in the input.
      runSearch(activeIndex >= 0 ? suggestions[activeIndex] : query);
      return;
    }

    if (!showSuggestions) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault(); // stop the caret jumping to the end of the input
      setActiveIndex((i) => (i + 1) % suggestions.length); // wrap to the top
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((i) => (i <= 0 ? suggestions.length - 1 : i - 1)); // wrap to the bottom
    }
  };

  return (
    <div className="searchbar" ref={containerRef}>
      <div className={`searchbar__box ${showSuggestions ? 'searchbar__box--open' : ''}`}>
        <span className="searchbar__icon">
          <MagnifierIcon />
        </span>

        <input
          className="searchbar__input"
          type="text"
          aria-label="Search"
          autoComplete="off"
          placeholder="Search the index..."
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
            setActiveIndex(-1); // a new letter invalidates the old highlight
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
        />

        {query && (
          <>
            <button
              className="searchbar__clear"
              type="button"
              aria-label="Clear search"
              onClick={() => {
                setQuery('');
                setSuggestions([]);
              }}
            >
              <CloseIcon />
            </button>
            <span className="searchbar__divider" />
          </>
        )}

        <button
          className="searchbar__clear"
          type="button"
          aria-label="Run search"
          onClick={() => runSearch(query)}
        >
          <MagnifierIcon />
        </button>
      </div>

      {showSuggestions && (
        <ul className="suggestions">
          {suggestions.map((suggestion, i) => (
            <li
              key={suggestion}
              className={`suggestions__item ${i === activeIndex ? 'suggestions__item--active' : ''}`}
              // mouse and keyboard share one notion of "active"
              onMouseEnter={() => setActiveIndex(i)}
              onClick={() => runSearch(suggestion)}
            >
              <MagnifierIcon />
              {suggestion}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
