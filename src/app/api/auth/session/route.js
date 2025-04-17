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
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true
  };
  
  const cookieOptions = { ...defaultOptions, ...options };
  
  // First: Standard cookie with no SameSite attribute for maximum compatibility
  // This is especially important for iOS Safari
  response.cookies.set(name, value, {
    ...cookieOptions,
    sameSite: undefined // Explicitly unset SameSite
  });
  
  // Second: Set with SameSite=Lax for standard browsers
  response.cookies.set(`${name}_lax`, value, {
    ...cookieOptions,
    sameSite: 'lax'
  });
  
  // Third: Set with SameSite=None+Secure for cross-origin contexts
  if (process.env.NODE_ENV === 'production' || process.env.FORCE_SECURE === 'true') {
    response.cookies.set(`${name}_secure`, value, {
      ...cookieOptions,
      sameSite: 'none',
      secure: true
    });
  }
  
  console.log(`Setting cookies for ${name} with multiple compatibility approaches`);
  
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
    const base64Credentials = authHeader.split(' ')[1];
    let credentials, username, password;
    
    try {
      credentials = atob(base64Credentials);
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
      
      // Check if the user_sessions table exists, create if not
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
      
      // Create a new session
      await client.query(`
        INSERT INTO user_sessions (
          session_id, team_name, expires_at, ip_address, user_agent
        ) VALUES ($1, $2, $3, $4, $5)
      `, [
        sessionId,
        username,
        expiresAt,
        clientId,
        userAgent
      ]);
      
      // Update last login timestamp
      await client.query(
        'UPDATE team_auth SET last_login = CURRENT_TIMESTAMP WHERE team_name = $1',
        [username]
      );
      
      // Create response with session cookie
      let response = NextResponse.json({ 
        success: true,
        message: 'Session created successfully',
        team: username
      }, { 
        headers
      });
      
      // Set the session cookie with multiple approaches for cross-platform support
      response = setCrossPlatformCookie(response, 'auth_session', sessionId, {
        expires: expiresAt,
        // Safari/iOS needs these settings to work properly
        sameSite: 'lax' 
      });
      
      return response;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Session creation error:", error);
    
    return NextResponse.json({ 
      success: false,
      message: 'Session creation error'
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
    
    // Get the session cookie
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
    
    const sessionId = cookies['auth_session'];
    
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
    
    // Clear all session cookie variants
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