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
  
  // Try to get credentials from cookie
  if (authCookie) {
    try {
      authCredentials = atob(authCookie);
    } catch (error) {
      console.error("Auth cookie error:", error);
      // Clear invalid cookies and redirect to login
      const response = NextResponse.redirect(new URL('/', request.url));
      response.cookies.set('auth_credentials', '', { maxAge: 0, path: '/' });
      response.cookies.set('auth_validated', '', { maxAge: 0, path: '/' });
      response.cookies.set('auth_token', '', { maxAge: 0, path: '/' });
      return response;
    }
  }
  // If no cookie, try Basic Auth header
  else if (basicAuth && basicAuth.startsWith('Basic ')) {
    try {
      authCredentials = atob(basicAuth.split(' ')[1]);
      // If we got credentials from header but not cookie, set the cookie
      const response = NextResponse.next();
      response.cookies.set('auth_credentials', basicAuth.split(' ')[1], { 
        maxAge: 86400, // 24 hours
        path: '/' 
      });
      
      // Generate a unique session token instead of just 'success'
      const sessionToken = generateSessionToken();
      response.cookies.set('auth_token', sessionToken, { 
        maxAge: 86400, // 24 hours
        path: '/' 
      });
      
      return response;
    } catch (error) {
      console.error("Auth decoding error:", error);
    }
  }
  
  // If we have credentials, check credential format and validation token
  if (authCredentials) {
    const [user, pwd] = authCredentials.split(':');
    
    if (user && pwd) {
      // Check for validation status - now using auth_token instead of auth_validated
      const authToken = request.cookies.get('auth_token')?.value;
      
      // If no token exists or it's expired, we need to validate
      if (!authToken) {
        console.log("Middleware: No auth token found, validating credentials");
        return validateAndRespond(request, user, pwd);
      }
      
      // For API write operations, always validate
      const isWriteOperation = 
        request.nextUrl.pathname.startsWith('/api/add-') || 
        request.nextUrl.pathname.startsWith('/api/delete-') ||
        request.method !== 'GET';
        
      if (isWriteOperation) {
        console.log(`Middleware: Validating credentials for write operation: ${request.nextUrl.pathname}`);
        return validateAndRespond(request, user, pwd);
      }
      
      // For normal page navigation, trust the token and proceed
      return NextResponse.next();
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

// Helper function to validate credentials and return appropriate response
async function validateAndRespond(request, user, pwd) {
  try {
    // Add timestamp and random string to prevent caching
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2);
    const validateUrl = new URL(`/api/auth/validate?_t=${timestamp}&_r=${random}`, request.url);
    const validateResponse = await fetch(validateUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${btoa(`${user}:${pwd}`)}`,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'X-Random': random
      }
    });
    
    // If validation fails, clear cookies and redirect
    if (!validateResponse.ok) {
      console.log("Middleware: Validation request failed");
      // Clear auth cookies to force a new login and redirect to home
      const response = NextResponse.redirect(new URL('/', request.url));
      response.cookies.set('auth_credentials', '', { maxAge: 0, path: '/' });
      response.cookies.set('auth_token', '', { maxAge: 0, path: '/' });
      return response;
    }
    
    // Parse the response JSON
    const responseData = await validateResponse.json();
    
    if (!responseData.authenticated) {
      console.log("Middleware: Authentication rejected by server");
      // Clear auth cookies to force a new login and redirect to home
      const response = NextResponse.redirect(new URL('/', request.url));
      response.cookies.set('auth_credentials', '', { maxAge: 0, path: '/' });
      response.cookies.set('auth_token', '', { maxAge: 0, path: '/' });
      return response;
    }
    
    // If validation succeeds, update the validation cookie
    console.log("Middleware: Authentication succeeded");
    const response = NextResponse.next();
    
    // Update credentials cookie
    response.cookies.set('auth_credentials', btoa(`${user}:${pwd}`), { 
      maxAge: 86400, // 24 hours
      path: '/' 
    });
    
    // Generate a unique session token
    const sessionToken = generateSessionToken();
    response.cookies.set('auth_token', sessionToken, { 
      maxAge: 86400, // 24 hours
      path: '/' 
    });
    
    return response;
  } catch (error) {
    console.error("Middleware: Auth validation error:", error);
    // If there's an error with validation, clear cookies and redirect
    const response = NextResponse.redirect(new URL('/', request.url));
    response.cookies.set('auth_credentials', '', { maxAge: 0, path: '/' });
    response.cookies.set('auth_token', '', { maxAge: 0, path: '/' });
    return response;
  }
}

// Generate a unique session token
function generateSessionToken() {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 10);
  return `${timestamp}-${randomPart}`;
} 