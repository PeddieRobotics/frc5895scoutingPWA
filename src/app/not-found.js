export const metadata = {
  title: 'Not Found - Team 5895 Analytics App',
  description: 'Page not found'
}

export const viewport = {
  themeColor: '#000000'
}

export default function NotFound() {
  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'center', 
      justifyContent: 'center',
      height: '100vh',
      background: '#0b233b',
      color: '#bd9748',
      textAlign: 'center',
      padding: '20px'
    }}>
      <h1 style={{ fontSize: '2.5rem' }}>404 - Page Not Found</h1>
      <p style={{ fontSize: '1.2rem', marginTop: '20px' }}>The page you are looking for does not exist.</p>
      <a 
        href="/" 
        style={{ 
          marginTop: '30px',
          padding: '10px 20px',
          background: '#bd9748',
          color: '#0b233b',
          textDecoration: 'none',
          borderRadius: '5px',
          fontWeight: 'bold'
        }}
      >
        Return to Home
      </a>
    </div>
  );
} 