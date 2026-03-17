export default function DinoGame({ onClose }) {
  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
      backgroundColor: 'rgba(0, 0, 0, 0.65)', backdropFilter: 'blur(3px)',
      display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000
    }}>
      <div style={{
        backgroundColor: '#fff', padding: '30px 40px 40px 40px', borderRadius: '16px',
        boxShadow: '0 10px 30px rgba(0,0,0,0.3)', position: 'relative', width: '800px',
        maxWidth: '90%', textAlign: 'center'
      }}>
        <button onClick={onClose} style={{ position: 'absolute', top: '15px', right: '20px', background: 'none', border: 'none', fontSize: '28px', cursor: 'pointer', color: '#5f6368' }}>
          &times;
        </button>
        <h2 style={{ marginTop: 0, marginBottom: '20px', color: '#202124', fontFamily: 'sans-serif', fontWeight: '400' }}>T-Rex Runner</h2>
        
        {/* Bulletproof iframe approach */}
        <div style={{ border: '1px solid #dadce0', borderRadius: '8px', overflow: 'hidden', height: '250px', backgroundColor: '#f8f9fa' }}>
          <iframe 
            src="https://wayou.github.io/t-rex-runner/" 
            width="100%" 
            height="100%" 
            frameBorder="0" 
            scrolling="no"
            title="Dino Game"
          ></iframe>
        </div>
        
        <p style={{ color: '#70757a', fontSize: '14px', marginTop: '20px', marginBottom: 0 }}>Click inside the box, then press <strong>Spacebar</strong> to jump.</p>
      </div>
    </div>
  );
}