import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { Pool } from 'pg';

// Create a database connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? {
    rejectUnauthorized: false
  } : false
});

// Verify admin authentication
async function verifyAdminAuth(request) {
  try {
    // Retrieve the admin password from environment variable
    const adminPassword = process.env.ADMIN_PASSWORD;
    
    if (!adminPassword) {
      console.error('Admin authentication error: ADMIN_PASSWORD environment variable not set');
      return false;
    }
    
    // cookies() is not a promise, so don't use await
    const cookieStore = cookies();
    
    // Check for admin_auth cookie first
    const adminAuthCookie = cookieStore.get('admin_auth');
    
    if (adminAuthCookie) {
      try {
        // First try to decode URI component (for %3D etc.)
        const decodedValue = decodeURIComponent(adminAuthCookie.value);
        
        // Use Buffer for Node.js environments instead of atob
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
    
    // If admin_auth failed, check for regular user auth that has admin privileges
    const authCookie = cookieStore.get('auth_session');
    const authCookieLax = cookieStore.get('auth_session_lax');
    const authCookieSecure = cookieStore.get('auth_session_secure');
    
    // Get the token from any available auth cookie
    const tokenStr = authCookie?.value || authCookieLax?.value || authCookieSecure?.value;
    
    if (tokenStr) {
      try {
        // Try to URL decode and parse the cookie
        let decodedTokenStr = tokenStr;
        try {
          decodedTokenStr = decodeURIComponent(tokenStr);
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
            // Connect to database
            const client = await pool.connect();
            try {
              // Create admin_teams table if it doesn't exist (this should have been created in validate route)
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
          console.log('Failed to parse token as JSON, trying as direct session ID');
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

// GET handler to list all teams
export async function GET(request) {
  try {
    if (!await verifyAdminAuth(request)) {
      return NextResponse.json(
        { success: false, message: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    const client = await pool.connect();
    try {
      const result = await client.query(`
        SELECT id, team_name, created_at, last_login
        FROM team_auth
        ORDER BY team_name ASC
      `);
      
      return NextResponse.json({
        success: true,
        teams: result.rows
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error listing teams:', error);
    return NextResponse.json(
      { success: false, message: 'Server error' },
      { status: 500 }
    );
  }
}

// POST handler to add a new team
export async function POST(request) {
  try {
    // Dynamically import bcrypt to avoid mocks in production
    const bcrypt = await import('bcrypt').then(mod => mod.default);
    
    if (!await verifyAdminAuth(request)) {
      return NextResponse.json(
        { success: false, message: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    const { teamName, password } = await request.json();
    
    // Validate input
    if (!teamName || !password) {
      return NextResponse.json(
        { success: false, message: 'Team name and password are required' },
        { status: 400 }
      );
    }
    
    if (password.length < 6) {
      return NextResponse.json(
        { success: false, message: 'Password must be at least 6 characters' },
        { status: 400 }
      );
    }
    
    const client = await pool.connect();
    try {
      // Check if team already exists
      const checkResult = await client.query(
        'SELECT id FROM team_auth WHERE team_name = $1',
        [teamName]
      );
      
      if (checkResult.rowCount > 0) {
        return NextResponse.json(
          { success: false, message: 'Team name already exists' },
          { status: 400 }
        );
      }
      
      // Hash the password
      const saltRounds = 10;
      const passwordHash = await bcrypt.hash(password, saltRounds);
      
      // Insert the new team
      await client.query(
        'INSERT INTO team_auth (team_name, password_hash) VALUES ($1, $2)',
        [teamName, passwordHash]
      );
      
      return NextResponse.json({
        success: true,
        message: 'Team added successfully'
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error adding team:', error);
    return NextResponse.json(
      { success: false, message: 'Server error' },
      { status: 500 }
    );
  }
}

// DELETE handler to remove a team
export async function DELETE(request) {
  try {
    if (!await verifyAdminAuth(request)) {
      return NextResponse.json(
        { success: false, message: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    const { searchParams } = new URL(request.url);
    const teamName = searchParams.get('team');
    
    if (!teamName) {
      return NextResponse.json(
        { success: false, message: 'Team name is required' },
        { status: 400 }
      );
    }
    
    const client = await pool.connect();
    try {
      // First mark all sessions for this team as revoked
      await client.query(
        'UPDATE user_sessions SET revoked = TRUE WHERE team_name = $1',
        [teamName]
      );
      
      // Then delete the team
      const result = await client.query(
        'DELETE FROM team_auth WHERE team_name = $1 RETURNING id',
        [teamName]
      );
      
      if (result.rowCount === 0) {
        return NextResponse.json(
          { success: false, message: 'Team not found' },
          { status: 404 }
        );
      }
      
      return NextResponse.json({
        success: true,
        message: 'Team deleted successfully'
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error deleting team:', error);
    return NextResponse.json(
      { success: false, message: 'Server error' },
      { status: 500 }
    );
  }
} 