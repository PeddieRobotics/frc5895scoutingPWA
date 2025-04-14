import { NextResponse } from 'next/server';
import { Pool } from 'pg';

// Store failed attempts with timestamps for rate limiting
const failedAttempts = new Map();
const MAX_ATTEMPTS = 10; // Max failed attempts per IP in a 15-minute window
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

// Create a database connection pool with more explicit configuration
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? {
    rejectUnauthorized: false
  } : false,
  // Add explicit configuration to ensure we connect to the right schema
  schema: 'public'
});

// Add connection error logging
pool.on('error', (err) => {
  console.error('Unexpected database error:', err);
});

// Helper to get IP-based identifier for rate limiting
function getClientIdentifier(request) {
  // Try to get IP from headers first (for proxied requests)
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    const firstIp = forwardedFor.split(',')[0].trim();
    return `ip:${firstIp}`;
  }
  
  // Fallback to a request hash if IP can't be determined
  const userAgent = request.headers.get('user-agent') || 'unknown';
  const requestTime = new Date().getTime();
  return `req:${userAgent.substring(0, 20)}:${requestTime % 1000}`;
}

// Rate limiter check
function isRateLimited(identifier) {
  // Clean up old entries first
  const now = Date.now();
  for (const [key, timestamps] of failedAttempts.entries()) {
    // Remove timestamps older than the window
    const recent = timestamps.filter(time => (now - time) < WINDOW_MS);
    if (recent.length === 0) {
      failedAttempts.delete(key);
    } else {
      failedAttempts.set(key, recent);
    }
  }
  
  // Check if current identifier is rate limited
  const attempts = failedAttempts.get(identifier) || [];
  return attempts.length >= MAX_ATTEMPTS;
}

// Record a failed attempt
function recordFailedAttempt(identifier) {
  const now = Date.now();
  const attempts = failedAttempts.get(identifier) || [];
  attempts.push(now);
  failedAttempts.set(identifier, attempts);
}

export async function GET(request) {
  // Dynamically import bcrypt to avoid mocks in production
  const bcrypt = await import('bcrypt').then(mod => mod.default);
  
  // Set no-cache headers
  const headers = new Headers({
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Surrogate-Control': 'no-store'
  });

  // Get client identifier for rate limiting
  const clientId = getClientIdentifier(request);
  
  // Check if rate limited
  if (isRateLimited(clientId)) {
    return NextResponse.json({ 
      authenticated: false,
      message: 'Too many failed attempts. Please try again later.'
    }, { 
      status: 429,
      headers: {
        ...Object.fromEntries(headers.entries()),
        'Retry-After': '60'
      }
    });
  }
  
  // Get the Authorization header
  const authHeader = request.headers.get('Authorization');
  
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    recordFailedAttempt(clientId);
    return NextResponse.json({ 
      authenticated: false,
      message: 'Authentication required'
    }, { 
      status: 401,
      headers
    });
  }
  
  try {
    // Extract and decode credentials
    const base64Credentials = authHeader.split(' ')[1];
    const credentials = atob(base64Credentials);
    const [username, password] = credentials.split(':');
    
    console.log(`Validation request for team: ${username} with params: ${request.nextUrl.search}`);
    
    // Basic validation
    if (!username || !password) {
      recordFailedAttempt(clientId);
      console.error(`Invalid credential format: username=${!!username}, password=${!!password}`);
      return NextResponse.json({ 
        authenticated: false,
        message: 'Invalid credentials format'
      }, { 
        status: 401,
        headers
      });
    }

    // Always check team authentication from database - no caching
    const client = await pool.connect();
    try {
      console.log(`Checking database for team: ${username}`);
      const result = await client.query(
        'SELECT password_hash FROM teamauthnew WHERE team_name = $1',
        [username]
      );
      
      if (result.rowCount === 0) {
        // Team not found
        console.log(`Team not found: ${username}`);
        recordFailedAttempt(clientId);
        return NextResponse.json({ 
          authenticated: false,
          message: 'Invalid credentials'
        }, { 
          status: 401,
          headers
        });
      }
      
      // Check password using bcrypt
      const { password_hash } = result.rows[0];
      const passwordMatches = await bcrypt.compare(password, password_hash);
      
      if (passwordMatches) {
        // Update last login timestamp
        await client.query(
          'UPDATE teamauthnew SET last_login = CURRENT_TIMESTAMP WHERE team_name = $1',
          [username]
        );
        
        console.log(`Successful authentication for team: ${username}`);
        
        return NextResponse.json({ 
          authenticated: true,
          message: 'Authentication successful',
          scoutTeam: username
        }, { 
          headers
        });
      } else {
        // Password incorrect
        console.log(`Password mismatch for team: ${username}`);
        recordFailedAttempt(clientId);
        return NextResponse.json({ 
          authenticated: false,
          message: 'Invalid credentials'
        }, { 
          status: 401,
          headers
        });
      }
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Auth error:", error);
    recordFailedAttempt(clientId);
    return NextResponse.json({ 
      authenticated: false,
      message: 'Authentication error'
    }, { 
      status: 400,
      headers
    });
  }
} 