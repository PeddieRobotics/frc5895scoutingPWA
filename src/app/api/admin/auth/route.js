import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { Pool } from 'pg';

// Create a database connection pool for checking admin permissions
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? {
    rejectUnauthorized: false
  } : false
});

export async function POST(request) {
  try {
    const { sudoPassword } = await request.json();
    
    // Required: admin password must be set in environment variables
    const adminPassword = process.env.ADMIN_PASSWORD;
    
    if (!adminPassword) {
      return NextResponse.json(
        { success: false, message: 'Server configuration error: ADMIN_PASSWORD not set' },
        { status: 500 }
      );
    }
    
    // Debug log (no password content)
    console.log(`Auth attempt with password: ${sudoPassword?.length || 0} chars`);
    
    // Simple password check
    if (sudoPassword !== adminPassword) {
      return NextResponse.json(
        { success: false, message: 'Invalid admin password' },
        { status: 401 }
      );
    }
    
    // Create the admin auth token
    const adminAuth = Buffer.from(`admin:${adminPassword}`).toString('base64');
    
    // Get cookie store
    const cookieStore = cookies();
    
    // Set the cookie directly
    cookieStore.set('admin_auth', adminAuth, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24, // 24 hours
      path: '/'
    });
    
    // Create response
    const response = NextResponse.json({ success: true });
    
    // Also set the cookie in the response for client-side access
    response.cookies.set('admin_auth', adminAuth, {
      httpOnly: false, // Readable by client JS
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24, // 24 hours
      path: '/'
    });
    
    // Create admin_teams table if it doesn't exist yet (bootstrap solution)
    try {
      const client = await pool.connect();
      try {
        await client.query(`
          CREATE TABLE IF NOT EXISTS admin_teams (
            team_name TEXT PRIMARY KEY,
            created_at TIMESTAMP NOT NULL DEFAULT NOW()
          )
        `);
        console.log('Admin table created or verified');
      } finally {
        client.release();
      }
    } catch (dbError) {
      console.error('Could not create admin_teams table:', dbError);
      // We continue anyway - this is just a convenience setup
    }
    
    return response;
  } catch (error) {
    console.error('Admin auth error:', error);
    return NextResponse.json(
      { success: false, message: 'Server error' },
      { status: 500 }
    );
  }
} 