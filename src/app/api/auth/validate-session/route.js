import { NextResponse } from 'next/server';
import { Pool } from 'pg';

// Create a database connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? {
    rejectUnauthorized: false
  } : false,
  schema: 'public',
  // Add connection timeout to avoid hanging
  connectionTimeoutMillis: 10000
});

// Add connection error logging
pool.on('error', (err) => {
  console.error('Unexpected database error:', err);
});

export async function GET(request) {
  // Set no-cache headers
  const headers = new Headers({
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Surrogate-Control': 'no-store'
  });

  try {
    // Get auth token from Authorization header or cookie
    let token = null;
    let sessionId = null;
    let tokenVersion = null;
    let teamName = null;
    
    // Check Authorization header first (preferred method)
    const authHeader = request.headers.get('Authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    }
    
    // If no token in header, check cookie
    if (!token) {
      // Get cookies from request
      const cookieHeader = request.headers.get('cookie') || '';
      const cookies = Object.fromEntries(
        cookieHeader.split(';')
          .map(cookie => cookie.trim())
          .filter(Boolean)
          .map(cookie => {
            const [name, value] = cookie.split('=').map(part => part.trim());
            return [name, value];
          })
      );
      
      token = cookies['auth_token'];
      
      // For backward compatibility
      const oldSessionToken = cookies['auth_session'] || cookies['auth_session_lax'] || cookies['auth_session_secure'];
      if (!token && oldSessionToken) {
        // Create a basic token format for old session IDs
        token = JSON.stringify({ id: oldSessionToken });
      }
    }
    
    if (!token) {
      return NextResponse.json({ valid: false, message: 'No session found' }, { 
        status: 401,
        headers 
      });
    }
    
    // Parse the token
    try {
      const parsedToken = JSON.parse(token);
      sessionId = parsedToken.id;
      tokenVersion = parsedToken.v;
      teamName = parsedToken.team;
    } catch (e) {
      console.error('Invalid token format:', e);
      return NextResponse.json({ valid: false, message: 'Invalid token format' }, { 
        status: 401,
        headers 
      });
    }
    
    // Always do full validation for the new token system
    // This is essential for remote session termination to work
    let client;
    try {
      client = await pool.connect();
      
      let isValid = false;
      let dbTokenVersion = null;
      
      // First check if the session exists and is valid
      const sessionResult = await client.query(
        'SELECT team_name, token_version, expires_at FROM user_sessions WHERE session_id = $1 AND expires_at > NOW() AND revoked = FALSE',
        [sessionId]
      );
      
      if (sessionResult.rowCount > 0) {
        // Update last_accessed time
        await client.query(
          'UPDATE user_sessions SET last_accessed = NOW() WHERE session_id = $1',
          [sessionId]
        );
        
        const sessionData = sessionResult.rows[0];
        teamName = sessionData.team_name;
        dbTokenVersion = sessionData.token_version;
        
        // Next verify the token version from team_auth
        const teamResult = await client.query(
          'SELECT token_version FROM team_auth WHERE team_name = $1',
          [teamName]
        );
        
        if (teamResult.rowCount > 0) {
          const currentTokenVersion = teamResult.rows[0].token_version || 1;
          
          // Verify both session token version and team token version
          // This ensures that if admin increments team token version, all sessions become invalid
          if (
            (dbTokenVersion === currentTokenVersion) && 
            (!tokenVersion || tokenVersion === currentTokenVersion)
          ) {
            isValid = true;
          } else {
            console.log(
              `Token version mismatch. Expected: ${currentTokenVersion}, ` +
              `Session has: ${dbTokenVersion}, Token has: ${tokenVersion}`
            );
          }
        } else {
          // Team doesn't exist in the database anymore
          console.log(`Team ${teamName} no longer exists in the database`);
          isValid = false;
        }
      }
      
      client.release();
      
      return NextResponse.json({ 
        valid: isValid,
        team: isValid ? teamName : null,
        message: isValid ? 'Session valid' : 'Session invalid or expired',
        // If token is outdated but otherwise would be valid, indicate this
        tokenOutdated: !isValid && dbTokenVersion !== null
      }, { 
        status: isValid ? 200 : 401,
        headers
      });
    } catch (error) {
      console.error("Database validation error:", error);
      if (client) client.release();
      
      return NextResponse.json({ 
        valid: false,
        message: 'Validation error'
      }, { 
        status: 500,
        headers
      });
    }
  } catch (error) {
    console.error("Session validation error:", error);
    
    return NextResponse.json({ 
      valid: false,
      message: 'Session validation error'
    }, { 
      status: 500,
      headers
    });
  }
} 