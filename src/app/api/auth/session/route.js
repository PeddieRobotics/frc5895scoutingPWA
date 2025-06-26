import { NextResponse } from 'next/server';
import { Pool } from 'pg';
import { nanoid } from 'nanoid';

// Create a database connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? {
    rejectUnauthorized: false
  } : false,
  schema: 'public'
});

// Add connection error logging
pool.on('error', (err) => {
  console.error('Unexpected database error:', err);
});

// Helper to get IP-based identifier for logging
function getClientIdentifier(request) {
  // Try to get IP from headers first (for proxied requests)
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    const firstIp = forwardedFor.split(',')[0].trim();
    return firstIp;
  }
  
  // Fallback to user agent if IP can't be determined
  const userAgent = request.headers.get('user-agent') || 'unknown';
  return userAgent.substring(0, 50);
}

// Helper to set a secure cross-platform cookie
function setCrossPlatformCookie(response, name, value, options = {}) {
  const defaultOptions = {
    maxAge: 30 * 24 * 60 * 60, // 30 days in seconds
    path: '/',
    secure: process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'preview',
    httpOnly: true
  };
  
  const cookieOptions = { ...defaultOptions, ...options };
  
  // Ensure Secure is always set for production or preview environments
  const isSecureEnv = process.env.NODE_ENV === 'production' || 
                      process.env.VERCEL_ENV === 'preview' || 
                      process.env.FORCE_SECURE === 'true';
  
  const encodedValue = encodeURIComponent(value);

  // Primary cookie without suffix (helps some browsers/extensions)
  response.cookies.set(`${name}`, encodedValue, {
    ...cookieOptions,
    sameSite: 'lax',
    expires: options.expires || new Date(Date.now() + (30 * 24 * 60 * 60 * 1000)) // 30 days default
  });

  // 1) SameSite=Lax works for normal same-origin navigation and API calls.
  response.cookies.set(`${name}_lax`, encodedValue, {
    ...cookieOptions,
    sameSite: 'lax',
    expires: options.expires || new Date(Date.now() + (30 * 24 * 60 * 60 * 1000)) // 30 days default
  });

  // 2) SameSite=None + Secure is required when the site is embedded or served from a
  //    different origin (e.g. Vercel preview on *.vercel.app).
  if (isSecureEnv) {
    response.cookies.set(`${name}_secure`, encodedValue, {
      ...cookieOptions,
      sameSite: 'none',
      secure: true,
      expires: options.expires || new Date(Date.now() + (30 * 24 * 60 * 60 * 1000)) // 30 days default
    });
  }
  
  console.log(`setCrossPlatformCookie → wrote ${name}_lax and${isSecureEnv ? ` ${name}_secure` : ''}`);
  
  return response;
}

// Create a new session
export async function POST(request) {
  // Dynamically import bcrypt to avoid mocks in production
  const bcrypt = await import('bcrypt').then(mod => mod.default);
  
  try {
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
        success: false,
        message: 'Authentication required'
      }, { 
        status: 401,
        headers
      });
    }
    
    // Extract and decode credentials
    const base64CredentialsRaw = authHeader.split(' ')[1];
    let credentials, username, password;
    
    try {
      try {
        credentials = atob(base64CredentialsRaw);
      } catch (e) {
        credentials = atob(decodeURIComponent(base64CredentialsRaw));
      }
      [username, password] = credentials.split(':');
      
      if (!username || !password) {
        throw new Error('Invalid credential format');
      }
    } catch (error) {
      return NextResponse.json({ 
        success: false,
        message: 'Invalid credentials format'
      }, { 
        status: 400,
        headers
      });
    }
    
    // Get client info for logging
    const clientId = getClientIdentifier(request);
    const userAgent = request.headers.get('user-agent') || 'unknown';
    
    // Connect to database
    const client = await pool.connect();
    try {
      // Ensure team_auth table exists
      await client.query(`
        CREATE TABLE IF NOT EXISTS team_auth (
          team_name TEXT PRIMARY KEY,
          password_hash TEXT NOT NULL,
          last_login TIMESTAMP,
          token_version INTEGER DEFAULT 1
        )
      `);

      // Verify credentials against team_auth table
      const authResult = await client.query(
        'SELECT password_hash FROM team_auth WHERE team_name = $1',
        [username]
      );
      
      if (authResult.rowCount === 0) {
        return NextResponse.json({ 
          success: false,
          message: 'Invalid credentials'
        }, { 
          status: 401,
          headers
        });
      }
      
      // Check password
      const { password_hash } = authResult.rows[0];
      const passwordMatches = await bcrypt.compare(password, password_hash);
      
      if (!passwordMatches) {
        return NextResponse.json({ 
          success: false,
          message: 'Invalid credentials'
        }, { 
          status: 401,
          headers
        });
      }
      
      // Generate a unique session ID
      const sessionId = nanoid(32);
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30); // 30 days from now
      
      // Try to add token_version to team_auth if it doesn't exist
      try {
        await client.query(`
          DO $$
          BEGIN
            IF NOT EXISTS (
              SELECT column_name 
              FROM information_schema.columns 
              WHERE table_name='team_auth' AND column_name='token_version'
            ) THEN
              ALTER TABLE team_auth ADD COLUMN token_version INTEGER DEFAULT 1;
            END IF;
          END $$;
        `);
      } catch (error) {
        console.error("Failed to update team_auth schema:", error);
        // Continue anyway, we'll use default version
      }
      
      // Get token version
      const versionResult = await client.query(
        'SELECT COALESCE(token_version, 1) as token_version FROM team_auth WHERE team_name = $1',
        [username]
      );
      
      const tokenVersion = versionResult.rows[0]?.token_version || 1;
      
      // Check if the user_sessions table exists, create if not
      try {
        await client.query(`
          CREATE TABLE IF NOT EXISTS user_sessions (
            session_id TEXT PRIMARY KEY,
            team_name TEXT NOT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT NOW(),
            last_accessed TIMESTAMP NOT NULL DEFAULT NOW(),
            expires_at TIMESTAMP NOT NULL,
            ip_address TEXT,
            user_agent TEXT,
            device_info TEXT
          )
        `);
        
        // Add token_version column if it doesn't exist
        await client.query(`
          DO $$
          BEGIN
            IF NOT EXISTS (
              SELECT column_name 
              FROM information_schema.columns 
              WHERE table_name='user_sessions' AND column_name='token_version'
            ) THEN
              ALTER TABLE user_sessions ADD COLUMN token_version INTEGER DEFAULT 1;
            END IF;
          END $$;
        `);
      } catch (error) {
        console.error("Error setting up user_sessions table:", error);
        throw error;
      }
      
      // Create a new session
      try {
        await client.query(`
          INSERT INTO user_sessions (
            session_id, team_name, expires_at, ip_address, user_agent, token_version
          ) VALUES ($1, $2, $3, $4, $5, $6)
        `, [
          sessionId,
          username,
          expiresAt,
          clientId,
          userAgent,
          tokenVersion
        ]);
      } catch (error) {
        console.error("Session insertion error:", error);
        throw error;
      }
      
      // Update last login timestamp
      await client.query(
        'UPDATE team_auth SET last_login = CURRENT_TIMESTAMP WHERE team_name = $1',
        [username]
      );
      
      // Create auth token object
      const authToken = JSON.stringify({
        id: sessionId,
        v: tokenVersion,
        team: username
      });
      
      // Create response with auth token
      let response = NextResponse.json({ 
        success: true,
        message: 'Session created successfully',
        team: username,
        token: authToken,
        expires: expiresAt.getTime()
      }, { 
        headers
      });
      
      // Set HTTP-only cookie as backup security measure
      response.cookies.set('auth_token', encodeURIComponent(authToken), {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        expires: expiresAt
      });
      
      // Create a session data object for cookies (use current token version)
      const sessionData = JSON.stringify({
        id: sessionId,
        team: username,
        v: tokenVersion
      });
      
      console.log(`Setting auth cookies for team ${username}, isProduction=${process.env.NODE_ENV === 'production'}`);
      
      // For backward compatibility, also set session cookies
      response = setCrossPlatformCookie(response, 'auth_session', sessionData, {
        expires: expiresAt,
        sameSite: 'lax'
      });
      
      // Set special header for client detection
      response.headers.set('X-Auth-Token', 'enabled');
      
      return response;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Session creation error:", error);
    
    return NextResponse.json({ 
      success: false,
      message: 'Session creation error: ' + (error.message || 'Unknown error')
    }, { 
      status: 500,
      headers: {
        'Cache-Control': 'no-store'
      }
    });
  }
}

// Delete a session (logout)
export async function DELETE(request) {
  try {
    const headers = new Headers({
      'Cache-Control': 'no-store'
    });
    
    // Get token from Authorization header or cookie
    let token = null;
    
    // Check Authorization header first (client-side logout)
    const authHeader = request.headers.get('Authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    }
    
    // If no token in header, check cookie
    if (!token) {
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
      if (!token && cookies['auth_session']) {
        // Synthesize a simple token from the session ID
        token = JSON.stringify({ id: cookies['auth_session'] });
      }
    }
    
    // Parse the token if found
    let sessionId = null;
    if (token) {
      try {
        const parsedToken = JSON.parse(token);
        sessionId = parsedToken.id;
      } catch (e) {
        // If token isn't JSON, use it directly (old format)
        sessionId = token;
        console.error('Invalid token format during logout:', e);
      }
    }
    
    if (sessionId) {
      // Connect to database
      const client = await pool.connect();
      try {
        // Delete the session
        await client.query(
          'DELETE FROM user_sessions WHERE session_id = $1',
          [sessionId]
        );
      } finally {
        client.release();
      }
    }
    
    // Create response that clears the cookie
    const response = NextResponse.json({ 
      success: true,
      message: 'Logged out successfully'
    }, { 
      headers
    });
    
    // Clear auth token cookie
    response.cookies.set('auth_token', '', {
      maxAge: 0,
      path: '/',
      expires: new Date(0)
    });
    
    // For backward compatibility, clear the old cookie formats too
    response.cookies.set('auth_session', '', {
      maxAge: 0,
      path: '/',
      expires: new Date(0)
    });
    
    response.cookies.set('auth_session_lax', '', {
      maxAge: 0,
      path: '/',
      expires: new Date(0)
    });
    
    response.cookies.set('auth_session_secure', '', {
      maxAge: 0,
      path: '/',
      sameSite: 'none',
      secure: true,
      expires: new Date(0)
    });

    return response;
  } catch (error) {
    console.error("Logout error:", error);
    
    return NextResponse.json({ 
      success: false,
      message: 'Logout error'
    }, { 
      status: 500,
      headers: {
        'Cache-Control': 'no-store'
      }
    });
  }
} 