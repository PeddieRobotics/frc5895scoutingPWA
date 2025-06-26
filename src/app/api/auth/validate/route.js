import { NextResponse } from 'next/server';
import { Pool } from 'pg';

// Store failed attempts with timestamps for rate limiting
const failedAttempts = new Map();
const MAX_ATTEMPTS = 10; // Max failed attempts per IP in a 15-minute window
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

// Create a database connection pool with more explicit configuration
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? {
    rejectUnauthorized: false
  } : false,
  // Add explicit configuration to ensure we connect to the right schema
  schema: 'public'
});

// Add connection error logging
pool.on('error', (err) => {
  console.error('Unexpected database error:', err);
});

// Helper to get IP-based identifier for rate limiting
function getClientIdentifier(request) {
  // Try to get IP from headers first (for proxied requests)
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    const firstIp = forwardedFor.split(',')[0].trim();
    return `ip:${firstIp}`;
  }
  
  // Fallback to a request hash if IP can't be determined
  const userAgent = request.headers.get('user-agent') || 'unknown';
  const requestTime = new Date().getTime();
  return `req:${userAgent.substring(0, 20)}:${requestTime % 1000}`;
}

// Rate limiter check
function isRateLimited(identifier) {
  // Clean up old entries first
  const now = Date.now();
  for (const [key, timestamps] of failedAttempts.entries()) {
    // Remove timestamps older than the window
    const recent = timestamps.filter(time => (now - time) < WINDOW_MS);
    if (recent.length === 0) {
      failedAttempts.delete(key);
    } else {
      failedAttempts.set(key, recent);
    }
  }
  
  // Check if current identifier is rate limited
  const attempts = failedAttempts.get(identifier) || [];
  return attempts.length >= MAX_ATTEMPTS;
}

// Record a failed attempt
function recordFailedAttempt(identifier) {
  const now = Date.now();
  const attempts = failedAttempts.get(identifier) || [];
  attempts.push(now);
  failedAttempts.set(identifier, attempts);
}

export async function GET(request) {
  // Dynamically import bcrypt to avoid mocks in production
  const bcrypt = await import('bcrypt').then(mod => mod.default);
  
  // Set no-cache headers
  const headers = new Headers({
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Surrogate-Control': 'no-store'
  });

  // Get client identifier for rate limiting
  const clientId = getClientIdentifier(request);
  
  // Check if rate limited
  if (isRateLimited(clientId)) {
    return NextResponse.json({ 
      authenticated: false,
      message: 'Too many failed attempts. Please try again later.'
    }, { 
      status: 429,
      headers: {
        ...Object.fromEntries(headers.entries()),
        'Retry-After': '60'
      }
    });
  }
  
  // Get auth from cookies
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
  
  // Check for token-based authentication first
  const authHeader = request.headers.get('Authorization');
  
  // Check for Bearer token (new token-based auth)
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    let tokenData;
    
    try {
      // Parse the token
      tokenData = JSON.parse(token);
      if (!tokenData.id || !tokenData.team) {
        throw new Error('Invalid token format');
      }
      
      console.log(`Token validation for team: ${tokenData.team} with session ID: ${tokenData.id.substring(0, 8)}...`);
      
      // Validate session in database
      const client = await pool.connect();
      try {
        // Check if the session exists and is valid
        const sessionResult = await client.query(`
          SELECT s.team_name, s.token_version, t.token_version as current_version
          FROM user_sessions s
          JOIN team_auth t ON s.team_name = t.team_name
          WHERE s.session_id = $1 AND s.expires_at > NOW()
        `, [tokenData.id]);
        
        if (sessionResult.rowCount === 0) {
          console.log(`Session not found or expired: ${tokenData.id.substring(0, 8)}...`);
          return NextResponse.json({ 
            authenticated: false,
            message: 'Invalid or expired session'
          }, { 
            status: 401,
            headers
          });
        }
        
        const session = sessionResult.rows[0];
        
        // Check if token version matches
        if (session.token_version !== session.current_version) {
          console.log(`Token version mismatch. Session: ${session.token_version}, Current: ${session.current_version}`);
          return NextResponse.json({ 
            authenticated: false,
            message: 'Session has been invalidated'
          }, { 
            status: 401,
            headers
          });
        }
        
        // Update last accessed time
        await client.query(`
          UPDATE user_sessions SET last_accessed = NOW()
          WHERE session_id = $1
        `, [tokenData.id]);
        
        console.log(`Token validation successful for team: ${session.team_name}`);
        
        // Create response with success message
        const response = NextResponse.json({ 
          authenticated: true,
          message: 'Authentication successful',
          scoutTeam: session.team_name
        }, { 
          headers
        });
        
        // Refresh the cookie with each successful validation to extend session
        const cookieValue = JSON.stringify({
          id: tokenData.id,
          team: session.team_name,
          v: session.token_version
        });
        
        // Set cookie with various attributes for best cross-browser compatibility
        const expires = new Date();
        expires.setDate(expires.getDate() + 30); // 30 days
        
        // Standard cookie
        response.cookies.set('auth_token', token, {
          expires: expires,
          path: '/',
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'preview',
          sameSite: 'lax'
        });
        
        // Also set session cookie
        response.cookies.set('auth_session', cookieValue, {
          expires: expires,
          path: '/',
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'preview',
          sameSite: 'lax'
        });
        
        // For cross-site contexts
        if (process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'preview') {
          response.cookies.set('auth_session_secure', cookieValue, {
            expires: expires,
            path: '/',
            httpOnly: true,
            secure: true,
            sameSite: 'none'
          });
        }
        
        return response;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error("Token validation error:", error);
      return NextResponse.json({ 
        authenticated: false,
        message: 'Invalid token format'
      }, { 
        status: 401,
        headers
      });
    }
  }
  
  // Fall back to Basic authentication
  if (authHeader && authHeader.startsWith('Basic ')) {
    try {
      // Extract and decode credentials
      const base64CredentialsRaw = authHeader.split(' ')[1];
      let credentials;
      try {
        credentials = atob(base64CredentialsRaw);
      } catch (e) {
        try {
          credentials = atob(decodeURIComponent(base64CredentialsRaw));
        } catch (e2) {
          // Do not count decoding errors against rate limits to avoid accidental lockouts
          return NextResponse.json({ 
            authenticated: false,
            message: 'Authentication error'
          }, { 
            status: 400,
            headers
          });
        }
      }
      const [username, password] = credentials.split(':');
      
      console.log(`Validation request for team: ${username} with params: ${request.nextUrl.search}`);
      
      // Basic validation
      if (!username || !password) {
        recordFailedAttempt(clientId);
        console.error(`Invalid credential format: username=${!!username}, password=${!!password}`);
        return NextResponse.json({ 
          authenticated: false,
          message: 'Invalid credentials format'
        }, { 
          status: 401,
          headers
        });
      }

      // Always check team authentication from database - no caching
      const client = await pool.connect();
      try {
        console.log(`Ensuring team_auth table exists before querying`);
        await client.query(`
          CREATE TABLE IF NOT EXISTS team_auth (
            team_name TEXT PRIMARY KEY,
            password_hash TEXT NOT NULL,
            last_login TIMESTAMP,
            token_version INTEGER DEFAULT 1
          )
        `);

        console.log(`Checking database for team: ${username}`);
        const result = await client.query(
          'SELECT password_hash FROM team_auth WHERE team_name = $1',
          [username]
        );
        
        if (result.rowCount === 0) {
          // Team not found
          console.log(`Team not found: ${username}`);
          recordFailedAttempt(clientId);
          return NextResponse.json({ 
            authenticated: false,
            message: 'Invalid credentials'
          }, { 
            status: 401,
            headers
          });
        }
        
        // Check password using bcrypt
        const { password_hash } = result.rows[0];
        const passwordMatches = await bcrypt.compare(password, password_hash);
        
        if (passwordMatches) {
          // Update last login timestamp
          await client.query(
            'UPDATE team_auth SET last_login = CURRENT_TIMESTAMP WHERE team_name = $1',
            [username]
          );
          
          console.log(`Successful authentication for team: ${username}`);
          
          return NextResponse.json({ 
            authenticated: true,
            message: 'Authentication successful',
            scoutTeam: username
          }, { 
            headers
          });
        } else {
          // Password incorrect
          console.log(`Password mismatch for team: ${username}`);
          recordFailedAttempt(clientId);
          return NextResponse.json({ 
            authenticated: false,
            message: 'Invalid credentials'
          }, { 
            status: 401,
            headers
          });
        }
      } finally {
        client.release();
      }
    } catch (error) {
      console.error("Auth error:", error);
      recordFailedAttempt(clientId);
      return NextResponse.json({ 
        authenticated: false,
        message: 'Authentication error'
      }, { 
        status: 400,
        headers
      });
    }
  }
  
  // No valid authentication method found
  recordFailedAttempt(clientId);
  return NextResponse.json({ 
    authenticated: false,
    message: 'Authentication required'
  }, { 
    status: 401,
    headers
  });
}

// Add a new POST endpoint for server-side cookie setting
export async function POST(request) {
  const bcrypt = await import('bcrypt').then(mod => mod.default);
  
  // Set no-cache headers
  const headers = new Headers({
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Surrogate-Control': 'no-store'
  });

  // Get the Authorization header
  const authHeader = request.headers.get('Authorization');
  
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    return NextResponse.json({ 
      authenticated: false,
      message: 'Authentication required'
    }, { 
      status: 401,
      headers
    });
  }
  
  try {
    // Extract and decode credentials
    const base64CredentialsRaw = authHeader.split(' ')[1];
    let credentials;
    try {
      credentials = atob(base64CredentialsRaw);
    } catch (e) {
      try {
        credentials = atob(decodeURIComponent(base64CredentialsRaw));
      } catch (e2) {
        throw e; // rethrow original
      }
    }
    const [username, password] = credentials.split(':');
    
    // Authenticate with database
    const client = await pool.connect();
    try {
      // Ensure table exists
      await client.query(`
        CREATE TABLE IF NOT EXISTS team_auth (
          team_name TEXT PRIMARY KEY,
          password_hash TEXT NOT NULL,
          last_login TIMESTAMP,
          token_version INTEGER DEFAULT 1
        )
      `);

      const result = await client.query(
        'SELECT password_hash FROM team_auth WHERE team_name = $1',
        [username]
      );
      
      if (result.rowCount === 0) {
        // Team not found
        return NextResponse.json({ 
          authenticated: false,
          message: 'Invalid credentials'
        }, { 
          status: 401,
          headers
        });
      }
      
      // Check password
      const { password_hash } = result.rows[0];
      const passwordMatches = await bcrypt.compare(password, password_hash);
      
      if (passwordMatches) {
        // If authenticated, create a secure response with cookies
        const isProduction = process.env.NODE_ENV === 'production';
        const now = Date.now();
        
        // Create a response with authenticated cookies
        const response = NextResponse.json({ 
          authenticated: true,
          message: 'Authentication successful',
          scoutTeam: username,
          cookiesSet: true,
          timestamp: now
        }, { 
          status: 200,
          headers
        });
        
        console.log(`Setting auth cookies for team ${username}, isProduction=${isProduction}`);
        
        // First set a cookie with SameSite=Lax (works on localhost)
        response.cookies.set('auth_credentials', base64CredentialsRaw, { 
          maxAge: 2592000, // 30 days
          path: '/',
          httpOnly: false,
          secure: isProduction,
          sameSite: 'lax'
        });
        
        // Also set a SameSite=None cookie with Secure (required for cross-site in production)
        response.cookies.set('auth_credentials', base64CredentialsRaw, { 
          maxAge: 2592000, // 30 days
          path: '/',
          httpOnly: false, 
          secure: true, // Always use secure when sameSite is 'none'
          sameSite: 'none', // Changed from 'lax' to 'none' to fix cross-page issues
          domain: null // Let browser determine the domain
        });
        
        console.log(`Set server-side cookies for team: ${username} with both SameSite modes`);
        return response;
      } else {
        // Password incorrect
        return NextResponse.json({ 
          authenticated: false,
          message: 'Invalid credentials'
        }, { 
          status: 401,
          headers
        });
      }
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Auth error:", error);
    return NextResponse.json({ 
      authenticated: false,
      message: 'Authentication error'
    }, { 
      status: 400,
      headers
    });
  }
}

// Add a new endpoint for logout
export async function DELETE(request) {
  // Set no-cache headers
  const headers = new Headers({
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Surrogate-Control': 'no-store'
  });
  
  // Create a response with cleared cookies
  const response = NextResponse.json({ 
    success: true,
    message: 'Logged out successfully'
  }, { 
    status: 200,
    headers
  });
  
  // Clear auth_credentials cookie
  const isProduction = process.env.NODE_ENV === 'production';
  
  // Clear SameSite=Lax cookie (for localhost)
  response.cookies.set('auth_credentials', '', { 
    maxAge: 0,
    path: '/',
    expires: new Date(0),
    sameSite: 'lax',
    secure: isProduction
  });
  
  // Clear SameSite=None cookie (for production)
  response.cookies.set('auth_credentials', '', { 
    maxAge: 0,
    path: '/',
    expires: new Date(0),
    sameSite: 'none',
    secure: true // Always use secure when sameSite is 'none'
  });
  
  console.log('Server-side logout: cleared authentication cookies with both SameSite modes');
  return response;
} 