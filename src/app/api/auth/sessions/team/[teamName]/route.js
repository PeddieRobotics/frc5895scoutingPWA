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
  const { teamName } = params;
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
      // Delete all sessions for the team
      const result = await client.query(
        'DELETE FROM user_sessions WHERE team_name = $1 RETURNING *',
        [teamName]
      );

      return NextResponse.json({ 
        success: true, 
        message: `Deleted ${result.rowCount} sessions for team ${teamName}`,
        count: result.rowCount
      }, { 
        headers
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Error deleting team sessions:", error);
    
    return NextResponse.json({ 
      error: 'Failed to delete team sessions' 
    }, { 
      status: 500,
      headers
    });
  }
} 