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

export async function POST(request) {
  // Set no-cache headers
  const headers = new Headers({
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Surrogate-Control': 'no-store'
  });
  
  // Check if this is a middleware validation request
  const isMiddlewareValidation = request.headers.get('X-Middleware-Validation') === 'true';

  try {
    // Parse the token data from the request body
    const requestData = await request.json();
    console.log('[Validate] Request body:', requestData);
    
    const { sessionId, team, version, needsTeamLookup } = requestData;
    
    if (!sessionId) {
      console.log('[Validate] Missing required session ID');
      return NextResponse.json({ 
        valid: false,
        message: 'Invalid token format: missing session ID'
      }, { 
        status: 400,
        headers
      });
    }
    
    // Connect to database and validate token
    const client = await pool.connect();
    try {
      // Handle the case where the middleware couldn't determine the team name
      let teamName = team;
      
      if (needsTeamLookup === true || team === 'pending_lookup') {
        console.log('[Validate] Looking up team name for session ID:', sessionId.substring(0,8));
        
        // Look up the team name from the session ID
        const teamLookupResult = await client.query(`
          SELECT team_name 
          FROM user_sessions 
          WHERE session_id = $1 AND expires_at > NOW() AND revoked = FALSE
        `, [sessionId]);
        
        if (teamLookupResult.rowCount === 0) {
          console.log('[Validate] No team found for session ID:', sessionId.substring(0,8));
          return NextResponse.json({ 
            valid: false,
            message: 'No valid session found'
          }, { 
            status: 401,
            headers
          });
        }
        
        teamName = teamLookupResult.rows[0].team_name;
        console.log('[Validate] Found team name for session:', teamName);
      }
      
      // Now continue with regular validation using the resolved team name
      if (!teamName) {
        console.log('[Validate] No team name available');
        return NextResponse.json({ 
          valid: false,
          message: 'Missing team information'
        }, { 
          status: 400,
          headers
        });
      }
      
      console.log('[Validate] Checking database for session:', { sessionId, team: teamName });
      
      // Check if the session exists and is valid
      const sessionQuery = `
        SELECT s.session_id, s.team_name, s.token_version, t.token_version as current_version, s.revoked, s.expires_at
        FROM user_sessions s
        JOIN team_auth t ON s.team_name = t.team_name
        WHERE s.session_id = $1 AND s.expires_at > NOW() AND s.team_name = $2 AND s.revoked = FALSE
      `;
      
      console.log('[Validate] Query:', sessionQuery.replace(/\s+/g, ' ').trim());
      console.log('[Validate] Params:', [sessionId, teamName]);
      
      const sessionResult = await client.query(sessionQuery, [sessionId, teamName]);
      
      console.log('[Validate] Query result rows:', sessionResult.rowCount);
      
      if (sessionResult.rowCount === 0) {
        console.log('[Validate] No active session found');
        
        // Check if it's because the session doesn't exist or the team doesn't exist
        const sessionExistsResult = await client.query(
          'SELECT 1 FROM user_sessions WHERE session_id = $1',
          [sessionId]
        );
        
        const teamExistsResult = await client.query(
          'SELECT 1 FROM team_auth WHERE team_name = $1',
          [teamName]
        );
        
        let errorMessage = 'Invalid or expired session';
        
        if (sessionExistsResult.rowCount === 0) {
          errorMessage = 'Session does not exist or has been deleted';
          console.log('[Validate] Session does not exist in database');
        } else if (teamExistsResult.rowCount === 0) {
          errorMessage = 'Team does not exist or has been deleted';
          console.log('[Validate] Team does not exist in database');
        }
        
        return NextResponse.json({ 
          valid: false,
          message: errorMessage
        }, { 
          status: 401,
          headers
        });
      }
      
      const session = sessionResult.rows[0];
      console.log('[Validate] Session found:', session);
      
      // Check if token has been explicitly revoked
      if (session.revoked) {
        console.log('[Validate] Session is revoked');
        return NextResponse.json({ 
          valid: false,
          message: 'Session has been revoked'
        }, { 
          status: 401,
          headers
        });
      }
      
      // Check if token version matches the current team version
      const sessionVersion = session.token_version || 1;
      const currentVersion = session.current_version || 1;
      
      if (sessionVersion !== currentVersion) {
        console.log('[Validate] Token version mismatch:', { 
          sessionVersion: sessionVersion, 
          currentVersion: currentVersion 
        });
        return NextResponse.json({ 
          valid: false,
          message: 'Session has been invalidated by team version change'
        }, { 
          status: 401,
          headers
        });
      }
      
      // If version is provided, verify it matches the token's version
      if (version && parseInt(version) !== parseInt(sessionVersion)) {
        console.log('[Validate] Client token version mismatch:', { 
          providedVersion: version, 
          actualVersion: sessionVersion 
        });
        
        // Instead of returning 401, return success but with a version update message
        // This allows the client to continue but also updates their version
        return NextResponse.json({ 
          valid: true,
          message: 'Token version updated',
          teamName: session.team_name,
          tokenVersion: sessionVersion, // Send the correct version
          updateVersion: true // Flag to indicate version needs updating
        }, { 
          headers: {
            ...headers,
            'X-Token-Version': sessionVersion.toString()
          }
        });
      }
      
      // Update last accessed time
      await client.query(`
        UPDATE user_sessions SET last_accessed = NOW()
        WHERE session_id = $1
      `, [sessionId]);
      
      console.log('[Validate] Session is valid, updated last_accessed');
      
      return NextResponse.json({ 
        valid: true,
        message: 'Valid session',
        teamName: session.team_name
      }, { 
        headers
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("[Validate] Token validation error:", error);
    
    return NextResponse.json({ 
      valid: false,
      message: 'Token validation error'
    }, { 
      status: 500,
      headers
    });
  }
}