import { NextResponse } from 'next/server';

export function middleware(request) {
  // Allow public access to landing page
  if (
    request.nextUrl.pathname === '/' || 
    request.nextUrl.pathname === ''
  ) {
    return NextResponse.next();
  }
  
  // Skip auth check for PWA resources, static files, and API endpoints that don't write data
  if (
    // Public API routes (read-only)
    (request.nextUrl.pathname.startsWith('/api/get-') && request.method === 'GET') ||
    // Auth validation endpoint
    request.nextUrl.pathname.startsWith('/api/auth/validate') ||
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
  
  // Check for authentication credentials in cookies
  const authCookie = request.cookies.get('auth_credentials')?.value;
  if (authCookie) {
    try {
      const [user, pwd] = atob(authCookie).split(':');
      if (
        user === process.env.BASIC_AUTH_USERNAME && 
        pwd === process.env.BASIC_AUTH_PASSWORD
      ) {
        return NextResponse.next();
      }
    } catch (error) {
      console.error("Auth cookie error:", error);
    }
  }
  
  // Check if the app is being accessed from a standalone PWA context
  const userAgent = request.headers.get('user-agent') || '';
  const displayMode = request.headers.get('sec-fetch-dest') || '';
  const pwaStandaloneCookie = request.cookies.get('pwa-standalone')?.value;
  
  const isPWA = 
    displayMode === 'standalone' || 
    pwaStandaloneCookie === 'true' ||
    userAgent.includes('Mobile Safari') && (
      userAgent.includes('standalone') || 
      userAgent.includes('navigator.standalone=true')
    );
  
  // Skip authentication for standalone PWA mode on the main page
  // but still require auth for API write operations
  if (isPWA && !request.nextUrl.pathname.startsWith('/api/add-')) {
    return NextResponse.next();
  }
  
  const basicAuth = request.headers.get('Authorization');
  
  if (basicAuth && basicAuth.startsWith('Basic ')) {
    const authValue = basicAuth.split(' ')[1];
    try {
      const [user, pwd] = atob(authValue).split(':');
      
      // Perform exact string comparison for authentication
      if (
        user === process.env.BASIC_AUTH_USERNAME && 
        pwd === process.env.BASIC_AUTH_PASSWORD
      ) {
        return NextResponse.next();
      }
    } catch (error) {
      console.error("Auth decoding error:", error);
    }
  }
  
  // For API endpoints, return a 401 JSON response instead of WWW-Authenticate challenge
  if (request.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 }
    );
  }
  
  // For other pages, redirect to the main page with an auth query parameter
  const url = new URL('/', request.url);
  url.searchParams.set('authRequired', 'true');
  url.searchParams.set('redirect', request.nextUrl.pathname);
  return NextResponse.redirect(url);
} 