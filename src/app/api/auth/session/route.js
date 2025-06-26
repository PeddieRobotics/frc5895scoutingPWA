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
function setCrossPlatformCookie(response, name, value, options = {}, request = null) {
  // Determine whether we are genuinely being served over HTTPS.  
  // We cannot rely on NODE_ENV alone because the scout app often runs on
  // a plain-HTTP local network even when built in "production" mode.
  // 
  // Rules:
  // 1.  If the connection/forwarded protocol is https → Secure cookie.
  // 2.  If the admin explicitly forces secure via env → Secure cookie.
  // 3.  Vercel preview deployments are always https → Secure cookie.
  // 4.  Otherwise (http) we write a non-Secure cookie so the browser will
  //     actually send it back.
  const requestProtocol = (request?.headers?.get('x-forwarded-proto') || '').toLowerCase();
  const isHttps = requestProtocol === 'https' || (request?.url?.startsWith('https://'));
  const isSecureEnv = (process.env.FORCE_SECURE === 'true') ||
                      (process.env.VERCEL_ENV === 'preview') ||
                      isHttps;
  
  const defaultOptions = {
    maxAge: 30 * 24 * 60 * 60, // 30 days in seconds
    path: '/',
    secure: isSecureEnv,
    httpOnly: true,
    sameSite: isSecureEnv ? 'none' : 'lax' // Use 'none' for secure environments, 'lax' for development
  };
  
  // ENHANCED DEBUGGING: Log environment and host details
  const host = request?.headers.get('host') || 'unknown';
  const userAgent = request?.headers.get('user-agent')?.substring(0, 100) || 'unknown';
  
  console.log(`[Session Cookie] === COOKIE SETTING DEBUG START ===`);
  console.log(`[Session Cookie] Environment: NODE_ENV=${process.env.NODE_ENV}, VERCEL_ENV=${process.env.VERCEL_ENV}`);
  console.log(`[Session Cookie] isSecureEnv: ${isSecureEnv}`);
  console.log(`[Session Cookie] Host: ${host}`);
  console.log(`[Session Cookie] User-Agent: ${userAgent}`);
  console.log(`[Session Cookie] Setting cookie: ${name}`);
  
  const cookieOptions = { ...defaultOptions, ...options };
  const expires = options.expires || new Date(Date.now() + (30 * 24 * 60 * 60 * 1000)); // 30 days default
  
  // Encode the value consistently - use single encoding to avoid double-encoding issues
  const encodedValue = encodeURIComponent(value);
  console.log(`[Session Cookie] Original value length: ${value.length}`);
  console.log(`[Session Cookie] Encoded value length: ${encodedValue.length}`);
  console.log(`[Session Cookie] Value preview: ${value.substring(0, 100)}...`);

  // Set primary cookie
  const primaryCookieOptions = {
    ...cookieOptions,
    expires
  };
  console.log(`[Session Cookie] Primary cookie options:`, primaryCookieOptions);
  response.cookies.set(name, encodedValue, primaryCookieOptions);

  // For compatibility, also set _lax variant
  const laxCookieOptions = {
    ...cookieOptions,
    sameSite: 'lax',
    expires
  };
  console.log(`[Session Cookie] Lax cookie options:`, laxCookieOptions);
  response.cookies.set(`${name}_lax`, encodedValue, laxCookieOptions);

  // For secure environments, also set _secure variant with SameSite=None
  if (isSecureEnv) {
    const secureCookieOptions = {
      ...cookieOptions,
      sameSite: 'none',
      secure: true,
      expires
    };
    console.log(`[Session Cookie] Secure cookie options:`, secureCookieOptions);
    response.cookies.set(`${name}_secure`, encodedValue, secureCookieOptions);
  }
  
  console.log(`[Session Cookie] Successfully set cookies: ${name} (primary), ${name}_lax${isSecureEnv ? `, and ${name}_secure` : ''}`);
  
  // Log what cookies should be in the response
  const responseCookies = response.cookies.getAll();
  console.log(`[Session Cookie] Response cookies count: ${responseCookies.length}`);
  responseCookies.forEach((cookie, index) => {
    console.log(`[Session Cookie] Response cookie ${index}: ${cookie.name}=${cookie.value?.substring(0, 30)}...`);
  });
  
  console.log(`[Session Cookie] === COOKIE SETTING DEBUG END ===`);
  
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
    const isAutoCleanup = request.headers.get('x-auto-cleanup') === 'true';
    
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
      
      // SECURITY FIX: Block ALL auto-cleanup session creation
      // Sessions should only be created during explicit user login, never automatically
      if (isAutoCleanup) {
        console.log(`[Session] 🚫 BLOCKING auto-cleanup session creation for ${username} - automatic session creation disabled for security`);
        return NextResponse.json({ 
          success: false,
          message: 'Automatic session creation is disabled. Please log in manually.'
        }, { 
          status: 403, // Forbidden
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
        
        // Add token_version and revoked columns if they don't exist
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
            
            IF NOT EXISTS (
              SELECT column_name 
              FROM information_schema.columns 
              WHERE table_name='user_sessions' AND column_name='revoked'
            ) THEN
              ALTER TABLE user_sessions ADD COLUMN revoked BOOLEAN DEFAULT FALSE;
            END IF;
          END $$;
        `);
      } catch (error) {
        console.error("Error setting up user_sessions table:", error);
        throw error;
      }
      
      // Create a new session
      try {
        console.log(`[Session] Creating session for ${username} with ID: ${sessionId}`);
        console.log(`[Session] Session expires at: ${expiresAt}`);
        console.log(`[Session] Token version: ${tokenVersion}`);
        
        const insertResult = await client.query(`
          INSERT INTO user_sessions (
            session_id, team_name, expires_at, ip_address, user_agent, token_version
          ) VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING session_id, team_name, created_at, expires_at
        `, [
          sessionId,
          username,
          expiresAt,
          clientId,
          userAgent,
          tokenVersion
        ]);
        
        console.log(`[Session] Session inserted successfully:`, insertResult.rows[0]);
        
        // Verify the session was actually inserted
        const verifyResult = await client.query(
          'SELECT session_id, team_name, created_at, expires_at, token_version FROM user_sessions WHERE session_id = $1',
          [sessionId]
        );
        
        if (verifyResult.rows.length === 0) {
          console.error(`[Session] ERROR: Session ${sessionId} was not found after insertion!`);
          throw new Error('Session was not saved to database');
        } else {
          console.log(`[Session] Session verification successful:`, verifyResult.rows[0]);
        }
        
      } catch (error) {
        console.error("Session insertion error:", error);
        console.error("Session insertion error details:", {
          sessionId,
          username,
          expiresAt: expiresAt.toISOString(),
          clientId,
          userAgent,
          tokenVersion
        });
        throw error;
      }
      
      // Update last login timestamp
      await client.query(
        'UPDATE team_auth SET last_login = CURRENT_TIMESTAMP WHERE team_name = $1',
        [username]
      );
      
      // Create a unified session data object
      const sessionData = {
        id: sessionId,
        team: username,
        v: tokenVersion,
        created: Date.now()
      };
      
      // Create response with session info
      let response = NextResponse.json({ 
        success: true,
        message: 'Session created successfully',
        team: username,
        sessionId: sessionId,
        expires: expiresAt.getTime()
      }, { 
        headers
      });
      
      console.log(`Setting consolidated auth cookies for team ${username}${isAutoCleanup ? ' (auto-cleanup)' : ''}`);
      console.log(`Environment detection: NODE_ENV=${process.env.NODE_ENV}, VERCEL_ENV=${process.env.VERCEL_ENV}`);
      console.log(`Session data being set:`, sessionData);
      
      // Use the consolidated cookie approach - this eliminates conflicts
      response = setCrossPlatformCookie(response, 'auth_session', JSON.stringify(sessionData), {
        expires: expiresAt,
        sameSite: 'lax'
      }, request);
      
      // Clear any conflicting cookies that might exist
      const conflictingCookies = ['auth_credentials', 'auth_token'];
      conflictingCookies.forEach(cookieName => {
        response.cookies.set(cookieName, '', {
          maxAge: 0,
          path: '/',
          expires: new Date(0)
        });
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
    
    // Clear all possible auth cookies
    const cookiesToClear = [
      'auth_token', 
      'auth_credentials', 
      'auth_session', 
      'auth_session_lax', 
      'auth_session_secure'
    ];
    
    cookiesToClear.forEach(cookieName => {
      // Clear with standard attributes
      response.cookies.set(cookieName, '', {
        maxAge: 0,
        path: '/',
        expires: new Date(0)
      });
      
      // Clear with SameSite=Lax
      response.cookies.set(cookieName, '', {
        maxAge: 0,
        path: '/',
        sameSite: 'lax',
        expires: new Date(0)
      });
      
      // Clear with SameSite=None; Secure
      response.cookies.set(cookieName, '', {
        maxAge: 0,
        path: '/',
        sameSite: 'none',
        secure: true,
        expires: new Date(0)
      });
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