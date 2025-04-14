import { NextResponse } from 'next/server';
import { Pool } from 'pg';

// Verify we're running on the server
const isServer = typeof window === 'undefined';

// Create a database connection pool with the same configuration as your other routes
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? {
    rejectUnauthorized: false
  } : false
});

export async function GET(request) {
  // Return an error if somehow this is being executed on the client
  if (!isServer) {
    return NextResponse.json({
      error: "This API route must run on the server",
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }

  const info = {
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'unknown',
    databaseInfo: null,
    error: null,
    tables: [],
    connectionString: process.env.DATABASE_URL ? 
      `${process.env.DATABASE_URL.split('@')[0].split(':')[0]}:****@${process.env.DATABASE_URL.split('@')[1]}` 
      : 'not available'
  };
  
  try {
    const client = await pool.connect();
    try {
      // Get database and schema info
      const dbResult = await client.query(`
        SELECT 
          current_database() as database,
          current_schema() as schema,
          current_user as user
      `);
      
      info.databaseInfo = dbResult.rows[0];
      
      // Check if team_auth table exists
      const tableCheck = await client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = current_schema()
          AND table_name = 'team_auth'
        ) as exists
      `);
      
      info.tableExists = tableCheck.rows[0].exists;
      
      // List all tables in current schema
      const tablesResult = await client.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = current_schema()
        ORDER BY table_name
      `);
      
      info.tables = tablesResult.rows.map(row => row.table_name);
      
    } finally {
      client.release();
    }
  } catch (error) {
    info.error = {
      message: error.message,
      code: error.code,
      stack: error.stack,
      detail: error.detail
    };
  }
  
  // Return the detailed information
  return NextResponse.json(info);
} 