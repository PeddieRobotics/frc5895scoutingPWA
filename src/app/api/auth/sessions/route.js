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

export async function GET(request) {
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

  // Only admins can view all sessions
  const adminToken = cookies['admin_auth'];
  if (!adminToken) {
    return NextResponse.json({ 
      error: 'Unauthorized' 
    }, { 
      status: 401,
      headers
    });
  }

  try {
    // Connect to database
    const client = await pool.connect();
    try {
      // Create the sessions table if it doesn't exist
      await client.query(`
        CREATE TABLE IF NOT EXISTS user_sessions (
          session_id TEXT PRIMARY KEY,
          team_name TEXT NOT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          last_accessed TIMESTAMP NOT NULL DEFAULT NOW(),
          expires_at TIMESTAMP NOT NULL,
          ip_address TEXT,
          user_agent TEXT,
          device_info TEXT,
          token_version INTEGER DEFAULT 1,
          revoked BOOLEAN DEFAULT FALSE
        )
      `);

      // Add revoked and token_version columns if they don't exist
      await client.query(`
        DO $$ 
        BEGIN 
          BEGIN
            ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS token_version INTEGER DEFAULT 1;
          EXCEPTION
            WHEN duplicate_column THEN NULL;
          END;
          
          BEGIN
            ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS revoked BOOLEAN DEFAULT FALSE;
          EXCEPTION
            WHEN duplicate_column THEN NULL;
          END;
        END $$;
      `);

      // Query active sessions
      const result = await client.query(`
        SELECT * FROM user_sessions 
        WHERE expires_at > NOW() 
        ORDER BY last_accessed DESC
      `);

      return NextResponse.json({ 
        sessions: result.rows 
      }, { 
        headers
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Error fetching sessions:", error);
    
    return NextResponse.json({ 
      error: 'Failed to fetch sessions' 
    }, { 
      status: 500,
      headers
    });
  }
} 