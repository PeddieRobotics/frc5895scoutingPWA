import { NextResponse } from 'next/server';

// Store failed attempts with timestamps for rate limiting
const failedAttempts = new Map();
const MAX_ATTEMPTS = 10; // Max failed attempts per IP in a 15-minute window
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

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
  // Get client identifier for rate limiting
  const clientId = getClientIdentifier(request);
  
  // Check if rate limited
  if (isRateLimited(clientId)) {
    return NextResponse.json({ 
      authenticated: false,
      message: 'Too many failed attempts. Please try again later.'
    }, { status: 429 });
  }
  
  // Get the Authorization header
  const authHeader = request.headers.get('Authorization');
  
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    recordFailedAttempt(clientId);
    return NextResponse.json({ 
      authenticated: false,
      message: 'Authentication required'
    }, { status: 401 });
  }
  
  try {
    // Extract and decode credentials
    const base64Credentials = authHeader.split(' ')[1];
    const credentials = atob(base64Credentials);
    const [username, password] = credentials.split(':');
    
    // Basic validation
    if (!username || !password) {
      recordFailedAttempt(clientId);
      return NextResponse.json({ 
        authenticated: false,
        message: 'Invalid credentials format'
      }, { status: 401 });
    }
    
    // Check credentials against environment variables
    if (
      username === process.env.BASIC_AUTH_USERNAME && 
      password === process.env.BASIC_AUTH_PASSWORD
    ) {
      return NextResponse.json({ 
        authenticated: true,
        message: 'Authentication successful'
      });
    }
    
    // Failed authentication
    recordFailedAttempt(clientId);
    return NextResponse.json({ 
      authenticated: false,
      message: 'Invalid credentials'
    }, { status: 401 });
    
  } catch (error) {
    console.error("Auth error:", error);
    recordFailedAttempt(clientId);
    return NextResponse.json({ 
      authenticated: false,
      message: 'Authentication error'
    }, { status: 400 });
  }
} 