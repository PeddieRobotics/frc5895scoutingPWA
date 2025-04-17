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

  console.log(`[Revoke] Attempting to revoke session, params:`, params);

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

  // Only admins can revoke sessions
  const adminToken = cookies['admin_auth'];
  if (!adminToken) {
    console.log(`[Revoke] Unauthorized attempt to revoke session - no admin token`);
    return NextResponse.json({ 
      error: 'Unauthorized' 
    }, { 
      status: 401,
      headers
    });
  }

  // Get session ID from URL params
  const { sessionId } = params;
  if (!sessionId) {
    console.log(`[Revoke] Missing session ID in params`);
    return NextResponse.json({ 
      error: 'Session ID is required' 
    }, { 
      status: 400,
      headers
    });
  }

  console.log(`[Revoke] Attempting to revoke session ID: ${sessionId}`);

  try {
    // Connect to database
    const client = await pool.connect();
    try {
      // First, check if the session exists and its current status
      const checkResult = await client.query(
        'SELECT * FROM user_sessions WHERE session_id = $1',
        [sessionId]
      );
      
      if (checkResult.rowCount === 0) {
        console.log(`[Revoke] Session ID not found: ${sessionId}`);
        return NextResponse.json({ 
          error: 'Session not found' 
        }, { 
          status: 404,
          headers
        });
      }
      
      console.log(`[Revoke] Current session state:`, checkResult.rows[0]);
      
      // Mark the session as revoked instead of deleting it
      const result = await client.query(
        'UPDATE user_sessions SET revoked = TRUE WHERE session_id = $1 RETURNING *',
        [sessionId]
      );

      if (result.rowCount === 0) {
        console.log(`[Revoke] Update failed, no rows affected for session: ${sessionId}`);
        return NextResponse.json({ 
          error: 'Session update failed' 
        }, { 
          status: 500,
          headers
        });
      }
      
      console.log(`[Revoke] Session successfully revoked:`, result.rows[0]);
      
      // Force invalidation by incrementing token version for this session's team
      // This ensures any cached tokens are invalidated immediately
      try {
        const incrementVersionResult = await client.query(
          'UPDATE team_auth SET token_version = token_version + 1 WHERE team_name = $1 RETURNING token_version',
          [result.rows[0].team_name]
        );
        
        if (incrementVersionResult.rowCount > 0) {
          console.log(`[Revoke] Also incremented team token version to ${incrementVersionResult.rows[0].token_version} for team ${result.rows[0].team_name}`);
        }
      } catch (error) {
        console.error(`[Revoke] Failed to increment team token version:`, error);
        // Continue anyway since the session itself is already revoked
      }

      return NextResponse.json({ 
        success: true, 
        message: 'Session revoked successfully',
        session: result.rows[0]
      }, { 
        headers
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error(`[Revoke] Error revoking session:`, error);
    
    return NextResponse.json({ 
      error: 'Failed to revoke session' 
    }, { 
      status: 500,
      headers
    });
  }
} 