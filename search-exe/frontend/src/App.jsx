import { useState } from 'react';
import Logo from './components/Logo';
import SearchBar from './components/SearchBar';
import DinoGame from './components/DinoGame';

function App() {
  const [playDino, setPlayDino] = useState(false);
  
  // The History Stack System
  const [history, setHistory] = useState([{ view: 'home', data: null }]);
  const [currentIndex, setCurrentIndex] = useState(0);

  const currentView = history[currentIndex];

  // Navigation Helpers
  const navigate = (newViewState) => {
    const newHistory = history.slice(0, currentIndex + 1);
    newHistory.push(newViewState);
    setHistory(newHistory);
    setCurrentIndex(newHistory.length - 1);
  };

  const goBack = () => { if (currentIndex > 0) setCurrentIndex(currentIndex - 1); };
  const goForward = () => { if (currentIndex < history.length - 1) setCurrentIndex(currentIndex + 1); };
  const goHome = () => navigate({ view: 'home', data: null });

  // API Handlers
  const handleSearch = async (query) => {
    const response = await fetch(`http://localhost:5000/api/search?q=${query}`);
    const data = await response.json();
    navigate({ view: 'results', data: data.results, query: query });
  };

  const handleFileClick = async (filename) => {
    const response = await fetch(`http://localhost:5000/api/file/${filename}`);
    const data = await response.json();
    navigate({ view: 'file', data: data });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', padding: '20px', alignItems: 'center' }}>
      
      {/* Top Search Bar & Navigation (Appears on Results and File pages) */}
      {currentView.view !== 'home' && (
        <div style={{ width: '100%', display: 'flex', gap: '20px', alignItems: 'center', borderBottom: '1px solid #ebebeb', paddingBottom: '20px', marginBottom: '20px' }}>
           
           {/* Back / Forward Buttons */}
           <div style={{ display: 'flex', gap: '10px' }}>
             <button onClick={goBack} disabled={currentIndex === 0} style={{ cursor: currentIndex === 0 ? 'not-allowed' : 'pointer', background: 'none', border: 'none', fontSize: '20px', color: currentIndex === 0 ? '#ccc' : '#5f6368' }}>&#8592;</button>
             <button onClick={goForward} disabled={currentIndex === history.length - 1} style={{ cursor: currentIndex === history.length - 1 ? 'not-allowed' : 'pointer', background: 'none', border: 'none', fontSize: '20px', color: currentIndex === history.length - 1 ? '#ccc' : '#5f6368' }}>&#8594;</button>
           </div>

           {/* Clickable Home Logo */}
           <h2 
            onClick={goHome} 
            style={{margin: 0, color: '#4285F4', fontSize: '1.5rem', letterSpacing: '-0.5px', cursor: 'pointer'}}
            title="Go to Homepage"
           >
             S.exe
           </h2>
           
           <div style={{ flex: 1, maxWidth: '600px' }}>
             <SearchBar onSearch={handleSearch} />
           </div>
        </div>
      )}

      {/* Main Centered Landing Page */}
      {currentView.view === 'home' && (
        <div style={{ marginTop: '20vh', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <Logo />
          <SearchBar onSearch={handleSearch} />
          
          <div style={{ marginTop: '30px' }}>
            <button 
              onClick={() => setPlayDino(true)} 
              style={{ padding: '10px 24px', cursor: 'pointer', backgroundColor: '#f8f9fa', border: '1px solid #f8f9fa', borderRadius: '4px', color: '#3c4043', fontSize: '14px', transition: 'all 0.2s ease' }}
              onMouseOver={(e) => { e.target.style.border = '1px solid #dadce0'; e.target.style.boxShadow = '0 1px 1px rgba(0,0,0,.1)'; }}
              onMouseOut={(e) => { e.target.style.border = '1px solid #f8f9fa'; e.target.style.boxShadow = 'none'; }}
            >
              DinoGame
            </button>
          </div>
        </div>
      )}

      {/* Modal Game Panel */}
      {playDino && <DinoGame onClose={() => setPlayDino(false)} />}

      {/* Search Results View */}
      {currentView.view === 'results' && (
        <div style={{ width: '600px', maxWidth: '100%', alignSelf: 'flex-start', marginLeft: '10%' }}>
          <p style={{ color: '#70757a', fontSize: '14px' }}>Found {currentView.data.length} results for "{currentView.query}"</p>
          {currentView.data.map((result, index) => (
            <div key={index} style={{ marginBottom: '25px' }}>
              <span style={{ fontSize: '14px', color: '#202124' }}>data/{result.filename}</span>
              <h3 
                onClick={() => handleFileClick(result.filename)}
                style={{ color: '#1a0dab', margin: '4px 0', cursor: 'pointer', fontSize: '20px', fontWeight: '400', textDecoration: 'none' }}
                onMouseOver={(e) => e.target.style.textDecoration = 'underline'}
                onMouseOut={(e) => e.target.style.textDecoration = 'none'}
              >
                {result.filename}
              </h3>
              <p style={{ color: '#4d5156', margin: 0, lineHeight: '1.58' }}>{result.summary}</p>
            </div>
          ))}
        </div>
      )}

      {/* Single File View */}
      {currentView.view === 'file' && currentView.data && (
        <div style={{ width: '600px', maxWidth: '100%', alignSelf: 'flex-start', marginLeft: '10%' }}>
          <h2 style={{ marginTop: 0 }}>{currentView.data.filename}</h2>
          <div style={{ backgroundColor: '#f1f3f4', padding: '15px', borderRadius: '8px', marginBottom: '20px' }}>
            <strong>Generated Summary:</strong>
            <p style={{ margin: '10px 0 0 0' }}>{currentView.data.summary}</p>
          </div>
          <div style={{ whiteSpace: 'pre-wrap', lineHeight: '1.6' }}>
            {currentView.data.content}
          </div>
        </div>
      )}

    </div>
  );
}

export default App;