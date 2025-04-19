import { NextResponse } from 'next/server';
import { Pool } from 'pg';
import { cookies } from 'next/headers';

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

// Verify admin authentication similar to other routes
async function verifyAdminAuth(request) {
  try {
    // Retrieve the admin password from environment variable
    const adminPassword = process.env.ADMIN_PASSWORD;
    
    if (!adminPassword) {
      console.error('Admin authentication error: ADMIN_PASSWORD environment variable not set');
      return false;
    }
    
    // Check for admin_auth cookie first (using headers directly since it's already parsed above)
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
    
    const adminToken = cookies['admin_auth'];
    if (adminToken) {
      try {
        // Decode the token
        const decodedValue = decodeURIComponent(adminToken);
        const decoded = Buffer.from(decodedValue, 'base64').toString('utf-8');
        const [username, password] = decoded.split(':');
        
        if (username === 'admin' && password === adminPassword) {
          console.log('Admin authenticated via admin_auth cookie');
          return true;
        }
      } catch (e) {
        console.error('Admin auth decode error:', e.message || e);
      }
    }
    
    // Check for regular auth cookies that might have team with admin privileges
    const authTokenStr = cookies['auth_session'] || cookies['auth_session_lax'] || cookies['auth_session_secure'];
    
    if (authTokenStr) {
      try {
        // Try to URL decode and parse the cookie
        let decodedTokenStr = authTokenStr;
        try {
          decodedTokenStr = decodeURIComponent(authTokenStr);
        } catch (e) {
          console.log('Failed to decode auth cookie, using as-is');
        }
        
        // Try to parse the JSON
        let tokenData;
        try {
          tokenData = JSON.parse(decodedTokenStr);
          console.log('Parsed token data:', { team: tokenData.team });
          
          if (tokenData.team) {
            // Check if the team has admin access by looking up in database
            const client = await pool.connect();
            try {
              // Create admin_teams table if it doesn't exist (should have been created in other routes)
              await client.query(`
                CREATE TABLE IF NOT EXISTS admin_teams (
                  team_name TEXT PRIMARY KEY,
                  created_at TIMESTAMP NOT NULL DEFAULT NOW()
                )
              `);
              
              // Check if team is in admin_teams table
              const result = await client.query(
                'SELECT team_name FROM admin_teams WHERE team_name = $1',
                [tokenData.team]
              );
              
              if (result.rowCount > 0) {
                console.log(`Team ${tokenData.team} has admin access (database)`);
                return true;
              }
            } finally {
              client.release();
            }
          }
        } catch (e) {
          console.log('Failed to parse token as JSON:', e.message);
        }
      } catch (e) {
        console.error('Error processing auth cookie:', e);
      }
    }
    
    // Check for X-Auth headers that might have been added by the middleware
    const authTeam = request.headers.get('X-Auth-Team');
    if (authTeam) {
      // Check if the team has admin access by looking up in database
      const client = await pool.connect();
      try {
        // Check if team is in admin_teams table
        const result = await client.query(
          'SELECT team_name FROM admin_teams WHERE team_name = $1',
          [authTeam]
        );
        
        if (result.rowCount > 0) {
          console.log(`Team ${authTeam} has admin access via X-Auth-Team header (database)`);
          return true;
        }
      } finally {
        client.release();
      }
    }
    
    return false;
  } catch (e) {
    console.error('Admin auth verification error:', e.message || e);
    return false;
  }
}

export async function GET(request) {
  // Set no-cache headers
  const headers = new Headers({
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Surrogate-Control': 'no-store'
  });

  // Check admin authentication using the comprehensive function
  if (!await verifyAdminAuth(request)) {
    return NextResponse.json({ 
      error: 'Unauthorized' 
    }, { 
      status: 401,
      headers
    });
  }
  
  // Check if revoked sessions should be included
  const { searchParams } = new URL(request.url);
  const includeRevoked = searchParams.get('includeRevoked') === 'true';

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

      // Query sessions, including revoked ones if requested
      let query = `
        SELECT * FROM user_sessions 
        WHERE expires_at > NOW() 
        ${includeRevoked ? '' : 'AND revoked = FALSE'} 
        ORDER BY last_accessed DESC
      `;
      
      const result = await client.query(query);

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