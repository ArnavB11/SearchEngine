import { useState } from 'react';

export default function SearchBar({ onSearch }) {
  const [query, setQuery] = useState('');
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  const handleSearch = (e) => {
    e.preventDefault();
    if (query.trim()) {
      onSearch(query.trim());
    }
  };

  // Dynamic styling for the Google drop-shadow effect
  const containerStyle = {
    display: 'flex',
    alignItems: 'center',
    width: '100%',
    maxWidth: '584px',
    height: '46px',
    padding: '0 14px 0 14px',
    borderRadius: '24px',
    border: '1px solid #dfe1e5',
    backgroundColor: '#fff',
    margin: '0 auto',
    boxShadow: (isHovered || isFocused) ? '0 1px 6px rgba(32,33,36,.28)' : 'none',
    borderColor: (isHovered || isFocused) ? 'rgba(223,225,229,0)' : '#dfe1e5',
    transition: 'box-shadow 200ms cubic-bezier(0.4, 0.0, 0.2, 1)',
  };

  return (
    <form onSubmit={handleSearch} style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
      <div 
        style={containerStyle}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Grey Magnifying Glass Icon */}
        <span style={{ display: 'flex', alignItems: 'center', paddingRight: '12px', color: '#9aa0a6' }}>
          <svg focusable="false" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20">
            <path fill="currentColor" d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"></path>
          </svg>
        </span>

        {/* The Actual Input Field */}
        <input
          type="text"
          aria-label="Search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          style={{ 
            flex: 1, 
            height: '100%', 
            border: 'none', 
            outline: 'none', 
            fontSize: '16px', 
            backgroundColor: 'transparent',
            color: '#202124'
          }}
        />

        {/* Clear 'X' Button (Only shows when there is text) */}
        {query && (
          <button 
            type="button" 
            onClick={() => setQuery('')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 8px', display: 'flex', alignItems: 'center', color: '#70757a' }}
          >
            <svg focusable="false" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20">
              <path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"></path>
            </svg>
          </button>
        )}

        {/* Small Vertical Separator Line (Only shows when 'X' is visible) */}
        {query && <div style={{ height: '60%', width: '1px', backgroundColor: '#dfe1e5', margin: '0 4px 0 0' }}></div>}

        {/* Classic Google Mic Icon */}
        <span style={{ display: 'flex', alignItems: 'center', paddingLeft: '8px', cursor: 'pointer' }}>
          <svg focusable="false" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" width="24" height="24">
            <path fill="#4285f4" d="m12 15c1.66 0 3-1.31 3-2.97v-7.02c0-1.66-1.34-3.01-3-3.01s-3 1.34-3 3.01v7.02c0 1.66 1.34 2.97 3 2.97z"></path>
            <path fill="#34a853" d="m11 18.08h2v3.92h-2z"></path>
            <path fill="#fbbc05" d="m7.05 16.87c-1.27-1.33-2.05-2.8-2.05-4.67h2c0 1.45.56 2.42 1.47 3.38v.32l-1.15 1.18z"></path>
            <path fill="#ea4335" d="m12 16.93a4.97 5.25 0 0 1 -3.54 -1.55l-1.41 1.49c1.26 1.34 3.02 2.13 4.95 2.13 3.87 0 6.99-2.92 6.99-7h-1.99c0 2.92-2.24 4.93-5 4.93z"></path>
          </svg>
        </span>
      </div>
      
      {/* Hidden submit button allows the user to press "Enter" to search seamlessly */}
      <button type="submit" style={{ display: 'none' }}>Search</button>
    </form>
  );
}