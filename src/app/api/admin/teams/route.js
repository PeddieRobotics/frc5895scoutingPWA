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
  const cookieStore = cookies();
  const adminAuth = cookieStore.get('admin_auth')?.value;
  
  if (!adminAuth) {
    return false;
  }
  
  try {
    const credentials = atob(adminAuth);
    const [username, password] = credentials.split(':');
    
    return username === 'admin' && password === process.env.ADMIN_PASSWORD;
  } catch (e) {
    console.error('Admin auth verification error:', e);
    return false;
  }
}

// GET handler to list all teams
export async function GET(request) {
  try {
    if (!(await verifyAdminAuth(request))) {
      return NextResponse.json(
        { success: false, message: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    const client = await pool.connect();
    try {
      const result = await client.query(`
        SELECT id, team_name, created_at, last_login
        FROM teamauthnew
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
    
    if (!(await verifyAdminAuth(request))) {
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
        'SELECT id FROM teamauthnew WHERE team_name = $1',
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
        'INSERT INTO teamauthnew (team_name, password_hash) VALUES ($1, $2)',
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
    if (!(await verifyAdminAuth(request))) {
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
      const result = await client.query(
        'DELETE FROM teamauthnew WHERE team_name = $1 RETURNING id',
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