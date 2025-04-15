import { NextResponse } from 'next/server';

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
  '/api/',
  '/auth/'
];

export async function middleware(request) {
  const { pathname } = request.nextUrl;
  
  // Allow public paths without auth
  if (PUBLIC_PATHS.includes(pathname) || 
      PUBLIC_PATH_PREFIXES.some(prefix => pathname.startsWith(prefix))) {
    return NextResponse.next();
  }
  
  // Get auth from cookies, URL params, or headers
  let authenticated = false;
  
  // 1. Check cookies first (most common auth method)
  const authCookie = request.cookies.get('auth_credentials');
  const adminAuthCookie = request.cookies.get('admin_auth');
  
  // 2. Check URL params (for redirects from auth flow)
  const urlParams = new URL(request.url).searchParams;
  const authFromUrl = urlParams.get('auth_token');
  
  // 3. Check authorization header (for API requests)
  const authorization = request.headers.get('authorization');
  let authFromHeader = null;
  if (authorization?.startsWith('Basic ')) {
    authFromHeader = authorization.substring('Basic '.length);
  }
  
  // Determine which auth credential to use
  const authCredential = authCookie?.value || authFromUrl || authFromHeader;
  
  if (authCredential || adminAuthCookie?.value) {
    authenticated = true;
    
    // Create response with standard cookie handling
    const response = NextResponse.next();
    
    // If we have auth from URL or header, set it as a cookie for future requests
    if ((authFromUrl || authFromHeader) && !authCookie?.value) {
      response.cookies.set('auth_credentials', authCredential, {
        // Universal cookie settings that work across devices
        maxAge: 30 * 24 * 60 * 60, // 30 days
        path: '/',
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax'
      });
    }
    
    // Preserve admin auth if present
    if (adminAuthCookie?.value) {
      response.cookies.set('admin_auth', adminAuthCookie.value, {
        maxAge: 30 * 24 * 60 * 60,
        path: '/',
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax'
      });
    }
    
    return response;
  }
  
  // Dev mode override
  if (process.env.NODE_ENV !== 'production' && 
      request.headers.get('x-override-auth') === 'true') {
    return NextResponse.next();
  }
  
  // No auth found - redirect to login
  const url = new URL('/', request.url);
  url.searchParams.set('authRequired', 'true');
  url.searchParams.set('redirect', pathname);
  return NextResponse.redirect(url);
} 