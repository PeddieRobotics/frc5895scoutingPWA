import { NextResponse } from 'next/server';
import { nanoid } from 'nanoid';

// PUBLIC PATHS - no auth needed
const PUBLIC_PATHS = [
  '/',
  '/admin',
  '/login',
  '/register',
  '/favicon.ico',
  '/manifest.json'
];

const PUBLIC_PATH_PREFIXES = [
  '/_next/',
  '/icons/',
  '/apple-touch-icon',
  '/api/auth/',
  '/auth/'
];

export async function middleware(request) {
  const { pathname } = request.nextUrl;
  
  // Allow public paths without auth
  if (PUBLIC_PATHS.includes(pathname) || 
      PUBLIC_PATH_PREFIXES.some(prefix => pathname.startsWith(prefix))) {
    return NextResponse.next();
  }

  // Special handling for API routes
  if (pathname.startsWith('/api/')) {
    // API routes should use Authorization header instead of cookies
    const authHeader = request.headers.get('authorization');
    if (authHeader?.startsWith('Basic ')) {
      return NextResponse.next();
    }
    
    // If no auth header for API routes, return 401
    return new NextResponse(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  // For all non-API protected routes, check for session cookie
  const authCookie = request.cookies.get('auth_session');
  const authCookieLax = request.cookies.get('auth_session_lax');
  const authCookieSecure = request.cookies.get('auth_session_secure');
  const adminAuthCookie = request.cookies.get('admin_auth');
  
  // If we have any auth cookie, proceed without trying to validate
  // The actual validation will happen on the server side when the page loads
  if (authCookie?.value || authCookieLax?.value || authCookieSecure?.value || adminAuthCookie?.value) {
    return NextResponse.next();
  }
  
  // No valid auth cookie found - redirect to login with original destination
  const url = new URL('/', request.url);
  url.searchParams.set('authRequired', 'true');
  url.searchParams.set('redirect', pathname);
  return NextResponse.redirect(url);
} 