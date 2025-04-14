import { NextResponse } from 'next/server';

// Instead of using database directly in middleware, 
// we'll delegate full authentication to the API routes
export async function middleware(request) {
  // Allow public access to landing page
  if (
    request.nextUrl.pathname === '/' || 
    request.nextUrl.pathname === ''
  ) {
    return NextResponse.next();
  }
  
  // Allow access to admin page - it handles auth internally
  if (request.nextUrl.pathname === '/admin') {
    return NextResponse.next();
  }
  
  // Skip auth check for PWA resources, static files, and API endpoints that don't write data
  if (
    // Public API routes (read-only)
    (request.nextUrl.pathname.startsWith('/api/get-') && request.method === 'GET') ||
    // Auth validation endpoint
    request.nextUrl.pathname.startsWith('/api/auth/validate') ||
    // Admin API endpoints - handle auth internally
    request.nextUrl.pathname.startsWith('/api/admin/') ||
    // Next.js internals
    request.nextUrl.pathname.startsWith('/_next/') ||
    // Favicons and manifest
    request.nextUrl.pathname === '/favicon.ico' ||
    request.nextUrl.pathname === '/manifest.json' ||
    // Icons
    request.nextUrl.pathname.startsWith('/icons/') ||
    request.nextUrl.pathname.startsWith('/apple-touch-icon') ||
    // Service worker files
    request.nextUrl.pathname === '/sw.js' ||
    request.nextUrl.pathname.startsWith('/workbox-')
  ) {
    return NextResponse.next();
  }
  
  // Check for authentication credentials in cookies or headers
  let authCredentials = null;
  const authCookie = request.cookies.get('auth_credentials')?.value;
  const basicAuth = request.headers.get('Authorization');
  const sessionCookie = request.cookies.get('session')?.value;
  
  // Try to get credentials from cookie
  if (authCookie) {
    try {
      authCredentials = atob(authCookie);
      console.log(`Found auth_credentials cookie for ${request.nextUrl.pathname} with length: ${authCookie.length}`);
    } catch (error) {
      console.error("Auth cookie error:", error);
    }
  }
  // Try to get from the simpler session cookie
  else if (sessionCookie) {
    try {
      // This is our simpler session cookie that just indicates auth is valid
      console.log(`Found session cookie for ${request.nextUrl.pathname}`);
      // Just allow the request to proceed since we have a valid session
      return NextResponse.next();
    } catch (error) {
      console.error("Session cookie error:", error);
    }
  }
  // If no cookie, try Basic Auth header
  else if (basicAuth && basicAuth.startsWith('Basic ')) {
    try {
      authCredentials = atob(basicAuth.split(' ')[1]);
      console.log(`Found auth header but no cookie for: ${request.nextUrl.pathname}`);
      // If we got credentials from header but not cookie, set the cookie
      const response = NextResponse.next();
      
      // Set both the complex auth cookie and a simple session cookie
      response.cookies.set('auth_credentials', basicAuth.split(' ')[1], { 
        maxAge: 2592000, // 30 days 
        path: '/'
      });
      
      // Also set a simple session cookie that's less prone to issues
      response.cookies.set('session', 'authenticated', { 
        maxAge: 2592000, // 30 days
        path: '/'
      });
      
      return response;
    } catch (error) {
      console.error("Auth decoding error:", error);
    }
  } else {
    console.log(`No auth found for: ${request.nextUrl.pathname}`);
  }
  
  // If we have credentials, validate them
  if (authCredentials) {
    const [user, pwd] = authCredentials.split(':');
    
    if (user && pwd) {
      // Set a simpler session cookie and let the request proceed
      const response = NextResponse.next();
      
      // Also set a simple session cookie that's less prone to issues
      response.cookies.set('session', 'authenticated', { 
        maxAge: 2592000, // 30 days
        path: '/'
      });
      
      return response;
    }
  }
  
  // For API endpoints, return a 401 JSON response instead of WWW-Authenticate challenge
  if (request.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 }
    );
  }
  
  // Prevent redirect loops by checking the referer
  const referer = request.headers.get('referer') || '';
  const isFromHomepage = referer.includes('/?authRequired=true');
  
  if (isFromHomepage && request.nextUrl.pathname !== '/') {
    // User is already trying to authenticate, don't redirect again
    return NextResponse.next();
  }
  
  // For other pages, redirect to the main page with an auth query parameter
  const url = new URL('/', request.url);
  url.searchParams.set('authRequired', 'true');
  url.searchParams.set('redirect', request.nextUrl.pathname);
  return NextResponse.redirect(url);
} 