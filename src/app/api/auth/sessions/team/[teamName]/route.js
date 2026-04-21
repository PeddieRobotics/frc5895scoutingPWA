import { NextResponse } from 'next/server';
import { Pool } from 'pg';

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

export async function DELETE(request, { params }) {
  // Set no-cache headers
  const headers = new Headers({
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Surrogate-Control': 'no-store'
  });

  // Check admin authentication
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

  // Only admins can delete sessions
  const adminToken = cookies['admin_auth'];
  if (!adminToken) {
    return NextResponse.json({ 
      error: 'Unauthorized' 
    }, { 
      status: 401,
      headers
    });
  }

  // Get team name from URL params
  const { teamName } = await params;
  if (!teamName) {
    return NextResponse.json({ 
      error: 'Team name is required' 
    }, { 
      status: 400,
      headers
    });
  }

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
        return NextResponse.json({ 
          error: 'Team not found' 
        }, { 
          status: 404,
          headers
        });
      }
      
      const newTokenVersion = result.rows[0].token_version;
      
      // BUGFIX: Also set revoked flag to TRUE for all sessions of this team
      // This ensures sessions are immediately invalidated even if token version check is bypassed
      // Also update last_accessed to track revocation time
      const revokeResult = await client.query(`
        UPDATE user_sessions 
        SET revoked = TRUE, last_accessed = NOW()
        WHERE team_name = $1 AND expires_at > NOW() AND revoked = FALSE
        RETURNING session_id
      `, [teamName]);
      
      const revokedCount = revokeResult.rowCount;
      console.log(`[TeamSessions] Revoked ${revokedCount} sessions for team ${teamName}`);
      
      // Admin action logging removed - auto-session creation is now completely disabled
      
      // Optionally, count the active sessions that will be invalidated
      const sessionsResult = await client.query(`
        SELECT COUNT(*) FROM user_sessions 
        WHERE team_name = $1 AND expires_at > NOW()
      `, [teamName]);
      
      const sessionCount = parseInt(sessionsResult.rows[0].count, 10);

      return NextResponse.json({ 
        success: true, 
        message: `Invalidated all sessions for team ${teamName}`,
        tokenVersion: newTokenVersion,
        sessionsAffected: sessionCount,
        revokedCount: revokedCount
      }, { 
        headers
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Error invalidating team sessions:", error);
    
    return NextResponse.json({ 
      error: 'Failed to invalidate team sessions' 
    }, { 
      status: 500,
      headers
    });
  }
} 