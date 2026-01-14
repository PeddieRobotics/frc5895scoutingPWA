import { Pool } from 'pg';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import crypto from 'crypto';

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

// Export the pool for use in other modules
export { pool };

/**
 * Generate a dynamic build ID based on environment variables
 * This helps ensure that preview deployments have consistent build IDs
 * @returns {string} A unique build ID for this deployment
 */
export function getDynamicBuildId() {
  // Start with environment-specific values
  const envValues = [
    process.env.VERCEL_ENV || process.env.NODE_ENV || 'development',
    process.env.VERCEL_GIT_COMMIT_SHA || '',
    process.env.VERCEL_GIT_COMMIT_MESSAGE || '',
    process.env.VERCEL_URL || ''
  ];
  
  // Create a hash of these values
  const hash = crypto.createHash('md5').update(envValues.join('-')).digest('hex');
  
  // Return a prefixed hash to make it identifiable
  return `build_${hash.substring(0, 8)}`;
}

/**
 * Validates the auth token for protected pages/routes
 * Call this function at the top of your protected routes
 * @param {Request} request - The request object
 * @returns {Promise<{isValid: boolean, teamName: string|null, error: string|null}>}
 */
export async function validateAuthToken(request) {
  // Check headers first (set by middleware)
  const teamName = request.headers.get('X-Auth-Team');
  const sessionId = request.headers.get('X-Auth-Session'); 
  const validated = request.headers.get('X-Auth-Validated');
  
  console.log(`[Auth] Validating auth token, headers: validated=${validated}, team=${teamName}, sessionId=${sessionId?.substring(0,8) || 'none'}`);
  
  // Check if already validated by middleware
  if (validated === 'true' && teamName && sessionId) {
    try {
      // Double-check in the database to be extra secure
      const client = await pool.connect();
      try {
        // Check if the session exists and is valid
        const sessionResult = await client.query(`
          SELECT s.team_name, s.token_version, t.token_version as current_version, s.revoked, s.expires_at
          FROM user_sessions s
          JOIN team_auth t ON s.team_name = t.team_name
          WHERE s.session_id = $1 AND s.expires_at > NOW() AND s.team_name = $2 AND s.revoked = FALSE
        `, [sessionId, teamName]);
        
        if (sessionResult.rowCount === 0) {
          console.log(`[Auth] Session not found or invalid: ${sessionId}, team ${teamName}`);
          return { isValid: false, teamName: null, error: 'Invalid or expired session' };
        }
        
        const session = sessionResult.rows[0];
        
        // Check if token version matches
        if (session.token_version !== session.current_version) {
          console.log(`[Auth] Token version mismatch: ${session.token_version} vs ${session.current_version}`);
          return { isValid: false, teamName: null, error: 'Session has been invalidated' };
        }
        
        // Update last accessed time
        await client.query(`
          UPDATE user_sessions SET last_accessed = NOW()
          WHERE session_id = $1
        `, [sessionId]);
        
        return { isValid: true, teamName: session.team_name, error: null };
      } finally {
        client.release();
      }
    } catch (error) {
      console.error("[Auth] Token validation error:", error);
      return { isValid: false, teamName: null, error: 'Token validation error' };
    }
  }
  
  // Middleware didn't validate, let's try to get info from cookies directly
  console.log('[Auth] Headers not validated by middleware, trying cookies');
  
  // Get cookies from request headers
  const cookieHeader = request.headers.get('cookie') || '';
  let authCookie = null;
  let authData = null;
  
  // Parse cookies
  const cookieEntries = cookieHeader.split(';')
    .map(cookie => cookie.trim())
    .filter(Boolean)
    .map(cookie => {
      const [name, ...rest] = cookie.split('=');
      return [name.trim(), rest.join('=')];
    });
    
  const cookies = Object.fromEntries(cookieEntries);
  
  // Try all possible cookie names
  authCookie = cookies['auth_session'] || cookies['auth_session_lax'] || cookies['auth_session_secure'];
  
  if (authCookie) {
    try {
      // URL decode the cookie value first (handles cases where JSON is URL encoded)
      try {
        authCookie = decodeURIComponent(authCookie);
      } catch (decodeError) {
        console.log('[Auth] Failed to URL decode cookie, will use as-is');
        // Continue with the original value if decoding fails
      }
      
      // First try to parse as JSON (new format)
      try {
        authData = JSON.parse(authCookie);
        console.log(`[Auth] Found JSON auth data in cookies: team=${authData?.team}, sessionId=${authData?.id?.substring(0,8) || 'none'}`);
      } catch (e) {
        // May be double-encoded. Try one more pass.
        try {
          const secondDecode = decodeURIComponent(authCookie);
          authData = JSON.parse(secondDecode);
          console.log(`[Auth] Found JSON auth data after second decode: team=${authData?.team}, sessionId=${authData?.id?.substring(0,8)}`);
        } catch (_ignored) {
          // If parsing fails, treat as a plain session ID (old format)
          console.log(`[Auth] Cookie is not JSON, treating as plain session ID: ${authCookie.substring(0,8)}...`);
          
          // Create basic auth data with just the session ID
          authData = { id: authCookie };
          
          // Try to look up the session in the database to get the team
          const client = await pool.connect();
          try {
            const sessionResult = await client.query(`
              SELECT s.team_name FROM user_sessions s
              WHERE s.session_id = $1 AND s.expires_at > NOW() AND s.revoked = FALSE
            `, [authCookie]);
            
            if (sessionResult.rowCount > 0) {
              authData.team = sessionResult.rows[0].team_name;
              console.log(`[Auth] Found team ${authData.team} for session ID ${authCookie.substring(0,8)}...`);
            } else {
              console.log(`[Auth] No valid session found for ID ${authCookie.substring(0,8)}...`);
            }
          } finally {
            client.release();
          }
        }
      }
      
      if (authData?.id && authData?.team) {
        const client = await pool.connect();
        try {
          // Check if the session exists and is valid
          const sessionResult = await client.query(`
            SELECT s.team_name, s.token_version, t.token_version as current_version, s.revoked, s.expires_at
            FROM user_sessions s
            JOIN team_auth t ON s.team_name = t.team_name
            WHERE s.session_id = $1 AND s.expires_at > NOW() AND s.team_name = $2 AND s.revoked = FALSE
          `, [authData.id, authData.team]);
          
          if (sessionResult.rowCount === 0) {
            console.log(`[Auth] Cookie session not found or invalid: ${authData.id.substring(0,8)}..., team ${authData.team}`);
            return { isValid: false, teamName: null, error: 'Invalid or expired session' };
          }
          
          const session = sessionResult.rows[0];
          
          // Check if token version matches (if version is provided)
          if (authData.v && session.token_version !== session.current_version) {
            console.log(`[Auth] Cookie token version mismatch: ${session.token_version} vs ${session.current_version}`);
            return { isValid: false, teamName: null, error: 'Session has been invalidated' };
          }
          
          // Update last accessed time
          await client.query(`
            UPDATE user_sessions SET last_accessed = NOW()
            WHERE session_id = $1
          `, [authData.id]);
          
          return { isValid: true, teamName: session.team_name, error: null };
        } finally {
          client.release();
        }
      } else if (authData?.id) {
        // We have a session ID but couldn't get the team
        console.log(`[Auth] Have session ID ${authData.id.substring(0,8)}... but no team name`);
        return { isValid: false, teamName: null, error: 'Invalid session format' };
      }
    } catch (e) {
      console.error('[Auth] Error processing auth cookie:', e);
    }
  } else {
    console.log('[Auth] No auth cookies found in request');
  }
  
  console.log('[Auth] No valid authentication found');
  return { isValid: false, teamName: null, error: 'Authentication required' };
}

/**
 * Use this in server components to protect a page
 * Redirects to login if authentication is invalid
 */
export async function requireAuth(request) {
  const { isValid, teamName, error } = await validateAuthToken(request);
  
  if (!isValid) {
    const params = new URLSearchParams();
    params.set('authRequired', 'true');
    params.set('error', error || 'Authentication required');
    redirect(`/?${params.toString()}`);
  }
  
  return teamName;
}

/**
 * Invalidate all sessions for a team
 * @param {string} teamName - The team name
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function invalidateTeamSessions(teamName) {
  try {
    // Connect to database
    const client = await pool.connect();
    try {
      // Ensure token_version column exists
      await client.query(`
        ALTER TABLE IF EXISTS team_auth 
        ADD COLUMN IF NOT EXISTS token_version INTEGER DEFAULT 1
      `);
      
      // Instead of deleting sessions, increment the token version
      // This will invalidate all existing tokens
      const result = await client.query(`
        UPDATE team_auth 
        SET token_version = COALESCE(token_version, 1) + 1 
        WHERE team_name = $1
        RETURNING token_version
      `, [teamName]);
      
      if (result.rowCount === 0) {
        return { success: false, message: 'Team not found' };
      }
      
      const newTokenVersion = result.rows[0].token_version;
      
      return { 
        success: true, 
        message: `Invalidated all sessions for team ${teamName}`,
        tokenVersion: newTokenVersion
      };
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Error invalidating team sessions:", error);
    return { success: false, message: 'Failed to invalidate team sessions' };
  }
}

// Helper function to consolidate authentication cookies
export function consolidateAuthCookies(response, sessionData, options = {}) {
  const isSecureEnv = process.env.NODE_ENV === 'production' || 
                      process.env.VERCEL_ENV === 'preview' || 
                      process.env.FORCE_SECURE === 'true';
  
  const cookieOptions = {
    maxAge: 30 * 24 * 60 * 60, // 30 days
    path: '/',
    httpOnly: true,
    secure: isSecureEnv,
    ...options
  };
  
  const encodedValue = encodeURIComponent(JSON.stringify(sessionData));
  
  // Clear any conflicting cookies first
  const cookiesToClear = ['auth_credentials', 'auth_token'];
  cookiesToClear.forEach(name => {
    response.cookies.set(name, '', {
      maxAge: 0,
      path: '/',
      expires: new Date(0)
    });
  });
  
  // Set the primary session cookie with different SameSite options
  response.cookies.set('auth_session', encodedValue, {
    ...cookieOptions,
    sameSite: 'lax',
    expires: options.expires || new Date(Date.now() + (30 * 24 * 60 * 60 * 1000))
  });
  
  response.cookies.set('auth_session_lax', encodedValue, {
    ...cookieOptions,
    sameSite: 'lax',
    expires: options.expires || new Date(Date.now() + (30 * 24 * 60 * 60 * 1000))
  });
  
  if (isSecureEnv) {
    response.cookies.set('auth_session_secure', encodedValue, {
      ...cookieOptions,
      sameSite: 'none',
      secure: true,
      expires: options.expires || new Date(Date.now() + (30 * 24 * 60 * 60 * 1000))
    });
  }
  
  console.log(`[Auth] Consolidated auth cookies: auth_session, auth_session_lax${isSecureEnv ? ', auth_session_secure' : ''}`);
  
  return response;
} 