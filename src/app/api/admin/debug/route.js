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

  try {
    // Connect to database
    const client = await pool.connect();
    try {
      // Get tables
      const tablesResult = await client.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public'
      `);

      const tables = tablesResult.rows.map(row => row.table_name);
      
      // Get user_sessions columns
      const columnsResult = await client.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'user_sessions'
      `);

      // Get sample of user sessions
      const sessionsResult = await client.query(`
        SELECT * FROM user_sessions 
        LIMIT 5
      `);

      // Check if revoked column exists
      const revokedColumnExists = columnsResult.rows.some(column => 
        column.column_name === 'revoked'
      );

      // Get revoked sessions 
      let revokedSessions = [];
      if (revokedColumnExists) {
        const revokedResult = await client.query(`
          SELECT * FROM user_sessions 
          WHERE revoked = TRUE
          LIMIT 10
        `);
        revokedSessions = revokedResult.rows;
      }
      
      return NextResponse.json({
        tables,
        user_sessions_columns: columnsResult.rows,
        has_revoked_column: revokedColumnExists,
        sample_sessions: sessionsResult.rows,
        revoked_sessions: revokedSessions,
        database_env: process.env.DATABASE_URL ? 'Present' : 'Missing',
        node_env: process.env.NODE_ENV || 'Not set'
      }, { 
        headers
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Debug endpoint error:", error);
    
    return NextResponse.json({ 
      error: error.message,
      stack: error.stack
    }, { 
      status: 500,
      headers
    });
  }
} 