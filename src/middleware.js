import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

// PUBLIC PATHS - no auth needed
const PUBLIC_PATHS = [
  '/',
  '/admin',  // Admin page is public, authentication happens client-side
  '/login',
  '/register',
  '/favicon.ico',
  '/manifest.json',
  '/api/admin/debug',
  '/api/auth/validate-token',
  '/auth-handler.js',
  '/fix-auth.js',
  '/ios-auth.js',
  '/reset-auth.html',
  '/reset-auth', // Add path without extension for flexibility
  '/auto-auth-cleanup.js',
  '/clear-auth-conflicts.js'
];

const PUBLIC_PATH_PREFIXES = [
  '/_next/',
  '/icons/',
  '/apple-touch-icon',
  '/api/auth/',
  '/api/admin/' // All admin API routes are allowed through middleware
];

// Admin API routes that use cookies instead of Authorization headers
const ADMIN_COOKIE_ROUTES = [
  '/api/admin/auth',
  '/api/admin/validate',
  '/api/admin/teams'
];

// Detect environment type
function getEnvironmentType(request) {
  const hostname = request.headers.get('host') || '';
  
  // Check for Vercel preview deployments
  const isVercelPreview = 
    hostname.includes('.vercel.app') || 
    process.env.VERCEL_ENV === 'preview';
  
  // Check for production
  const isProduction = 
    process.env.NODE_ENV === 'production' && 
    !isVercelPreview;
  
  // Check for development
  const isDevelopment = 
    process.env.NODE_ENV === 'development' || 
    hostname === 'localhost' || 
    hostname.includes('127.0.0.1');
  
  return {
    isVercelPreview,
    isProduction,
    isDevelopment
  };
}

// Helper function to safely decode cookie values
function safeCookieDecode(value) {
  if (!value) return null;
  
  try {
    // First try to URL decode
    let decoded = decodeURIComponent(value);
    
    // Then try to parse as JSON
    try {
      return JSON.parse(decoded);
    } catch (e) {
      // If not JSON, return the decoded string
      return decoded;
    }
  } catch (e) {
    // If URL decode fails, try to parse the original value as JSON
    try {
      return JSON.parse(value);
    } catch (e2) {
      // If all fails, return the original value
      return value;
    }
  }
}

// Helper function to extract auth data from cookies
function extractAuthFromCookies(request) {
  const authCookie = request.cookies.get('auth_session');
  const authCookieLax = request.cookies.get('auth_session_lax');
  const authCookieSecure = request.cookies.get('auth_session_secure');
  const authCredentials = request.cookies.get('auth_credentials');
  
  // Priority order: secure > lax > regular > credentials
  // This ensures we use the most reliable cookie available
  const cookieValue = authCookieSecure?.value || authCookieLax?.value || authCookie?.value || authCredentials?.value;
  
  if (!cookieValue) {
    return null;
  }
  
  const decodedValue = safeCookieDecode(cookieValue);
  
  if (typeof decodedValue === 'object' && decodedValue.id) {
    // It's a proper JSON token (from server-side auth)
    return {
      sessionId: decodedValue.id,
      team: decodedValue.team,
      version: decodedValue.v || decodedValue.version || '2',
      source: 'session_cookie'
    };
  } else if (typeof decodedValue === 'string') {
    // It's either a plain session ID or base64 credentials
    
    // Check if it looks like base64 credentials (contains = or is long enough)
    if (decodedValue.includes('=') || decodedValue.length > 20) {
      // Likely base64 credentials, try to decode
      try {
        const decoded = atob(decodedValue);
        if (decoded.includes(':')) {
          // It's username:password format
          const [username] = decoded.split(':');
          return {
            sessionId: decodedValue, // Use the base64 as session ID
            team: username,
            version: '2',
            source: 'credentials_cookie'
          };
        }
      } catch (e) {
        // Not valid base64, treat as plain session ID
      }
    }
    
    // Treat as plain session ID
    return {
      sessionId: decodedValue,
      team: 'pending_lookup',
      version: '2',
      source: 'plain_session'
    };
  }
  
  return null;
}

export async function middleware(request) {
  const { pathname } = request.nextUrl;
  const { isVercelPreview, isProduction, isDevelopment } = getEnvironmentType(request);
  
  // Log environment type for debugging
  console.log(`[Middleware] Environment: preview=${isVercelPreview}, prod=${isProduction}, dev=${isDevelopment}`);
  
  // Create headers for cache prevention
  const cacheHeaders = {
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
  };
  
  console.log(`[Middleware] Processing request for ${pathname}`);
  
  // Prevent redirect loops - check for excessive redirects
  const redirectCount = parseInt(request.nextUrl.searchParams.get('rc') || '0', 10);
  if (redirectCount > 2) { // Reduced from 3 to 2 for faster detection
    console.log(`[Middleware] Detected potential redirect loop for ${pathname}, redirecting to reset-auth`);
    return NextResponse.redirect(new URL('/reset-auth.html', request.url));
  }
  
  // Allow public paths without auth
  if (PUBLIC_PATHS.includes(pathname) || 
      PUBLIC_PATH_PREFIXES.some(prefix => pathname.startsWith(prefix))) {
    console.log(`[Middleware] Public path access: ${pathname}`);
    const response = NextResponse.next();
    
    // Only add cache prevention headers to non-icon files
    // Icons need to be cached for PWA functionality
    const isIconFile = pathname.includes('icon') || pathname.includes('favicon') || pathname.includes('manifest');
    if (!isIconFile) {
      Object.entries(cacheHeaders).forEach(([key, value]) => {
        response.headers.set(key, value);
      });
    }
    
    return response;
  }

  // Check if this is a client-initiated validation request
  const clientValidating = request.headers.get('x-client-validating') === 'true';
  if (clientValidating) {
    console.log(`[Middleware] Client-side validation in progress, skipping middleware validation`);
    return NextResponse.next();
  }

  // Extract auth data from cookies
  const authData = extractAuthFromCookies(request);
  
  if (!authData) {
    console.log(`[Middleware] No valid auth data found, redirecting to login`);
    
    // No valid auth data found - redirect to login with original destination
    const url = new URL('/', request.url);
    url.searchParams.set('authRequired', 'true');
    url.searchParams.set('redirect', pathname);
    url.searchParams.set('t', Date.now().toString());
    url.searchParams.set('rc', (redirectCount + 1).toString());
    
    return NextResponse.redirect(url);
  }

  // Special handling for admin API routes that use cookies
  if (ADMIN_COOKIE_ROUTES.includes(pathname)) {
    console.log(`[Middleware] Processing cookie-based API route: ${pathname}`);
    
    // Add auth headers to the request
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('X-Auth-Session', authData.sessionId);
    requestHeaders.set('X-Auth-Team', authData.team);
    requestHeaders.set('X-Auth-Version', authData.version);
    requestHeaders.set('X-Auth-Environment', isVercelPreview ? 'preview' : isProduction ? 'production' : 'development');
    
    console.log(`[Middleware] Added auth headers for ${pathname}`);
    
    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
      headers: cacheHeaders
    });
  }

  // Special handling for API routes
  if (pathname.startsWith('/api/')) {
    // Get the auth header
    const authHeader = request.headers.get('authorization');
    
    // If it's a Basic auth header, validate it
    if (authHeader?.startsWith('Basic ')) {
      try {
        // Decode the Basic auth header
        const encodedCredentials = authHeader.replace('Basic ', '');
        const decodedCredentials = atob(encodedCredentials);
        const [teamName, password] = decodedCredentials.split(':');
        
        // Here you should validate the credentials against your database
        // For now, we'll just pass it through and let the API route handle validation
        const response = NextResponse.next();
        
        // Add cache prevention headers
        Object.entries(cacheHeaders).forEach(([key, value]) => {
          response.headers.set(key, value);
        });
        
        return response;
      } catch (e) {
        console.error('Error validating Basic auth:', e);
        // Invalid Basic auth header
        return new NextResponse(JSON.stringify({ error: 'Invalid authorization header' }), {
          status: 401,
          headers: { 
            'Content-Type': 'application/json',
            ...cacheHeaders
          }
        });
      }
    }
    
    // If we have valid auth data from cookies, add it to headers for API routes
    if (authData) {
      console.log(`[Middleware] Adding auth headers for API request: ${pathname}`);
      
      const requestHeaders = new Headers(request.headers);
      requestHeaders.set('X-Auth-Session', authData.sessionId);
      requestHeaders.set('X-Auth-Team', authData.team);
      requestHeaders.set('X-Auth-Version', authData.version);
      requestHeaders.set('X-Auth-Environment', isVercelPreview ? 'preview' : isProduction ? 'production' : 'development');
      
      return NextResponse.next({
        request: {
          headers: requestHeaders,
        },
        headers: cacheHeaders
      });
    }
    
    // If no auth header or valid cookie for API routes, return 401
    console.log(`[Middleware] No valid authentication found for API request: ${pathname}`);
    return new NextResponse(JSON.stringify({ error: 'Authentication required' }), {
      status: 401,
      headers: { 
        'Content-Type': 'application/json',
        ...cacheHeaders
      }
    });
  }
  
    // For non-API protected routes, validate session directly in middleware
  // This avoids internal API calls that get intercepted by Vercel SSO in production
  
  if (authData.sessionId && authData.team && authData.team !== 'pending_lookup') {
    console.log(`[Middleware] Auth data found, validating session ${authData.sessionId.substring(0,8)}... for team ${authData.team} via direct DB`);
    
    try {
      // Create direct database connection using neon serverless (Edge Runtime compatible)
      const sql = neon(process.env.DATABASE_URL);
      
      // Handle the case where the middleware couldn't determine the team name
      let teamName = authData.team;
      
      if (authData.team === 'pending_lookup') {
        console.log('[Middleware] Looking up team name for session ID:', authData.sessionId.substring(0,8));
        
        // Look up the team name from the session ID
        const teamLookupResult = await sql`
          SELECT team_name 
          FROM user_sessions 
          WHERE session_id = ${authData.sessionId} AND expires_at > NOW() AND revoked = FALSE
        `;
        
        if (teamLookupResult.length === 0) {
          console.log('[Middleware] No team found for session ID:', authData.sessionId.substring(0,8));
          
          // Session not found, redirect to login
          const url = new URL('/', request.url);
          url.searchParams.set('authRequired', 'true');
          url.searchParams.set('redirect', pathname);
          url.searchParams.set('error', 'session_not_found');
          url.searchParams.set('t', Date.now().toString());
          url.searchParams.set('rc', (redirectCount + 1).toString());

          const response = NextResponse.redirect(url);
          ['auth_session','auth_session_lax','auth_session_secure','auth_credentials']
            .forEach(name => {
              response.cookies.set(name, '', {
                maxAge: 0,
                path: '/',
                expires: new Date(0)
              });
            });

          return response;
        }
        
        teamName = teamLookupResult[0].team_name;
        console.log('[Middleware] Found team name for session:', teamName);
      }
      
      console.log('[Middleware] Checking database for session:', { sessionId: authData.sessionId, team: teamName });
      
      // Check if the session exists and is valid
      const sessionResult = await sql`
        SELECT s.session_id, s.team_name, s.token_version, t.token_version as current_version, s.revoked, s.expires_at
        FROM user_sessions s
        JOIN team_auth t ON s.team_name = t.team_name
        WHERE s.session_id = ${authData.sessionId} AND s.expires_at > NOW() AND s.team_name = ${teamName} AND s.revoked = FALSE
      `;
      
      console.log('[Middleware] Query result rows:', sessionResult.length);
      
      if (sessionResult.length === 0) {
        console.log('[Middleware] No active session found - session deleted or invalid');
        
        // Session is invalid (deleted/revoked/expired), redirect to login and clear auth cookies
        const url = new URL('/', request.url);
        url.searchParams.set('authRequired', 'true');
        url.searchParams.set('redirect', pathname);
        url.searchParams.set('error', 'session_deleted');
        url.searchParams.set('t', Date.now().toString());
        url.searchParams.set('rc', (redirectCount + 1).toString());

        const response = NextResponse.redirect(url);
        ['auth_session','auth_session_lax','auth_session_secure','auth_credentials']
          .forEach(name => {
            response.cookies.set(name, '', {
              maxAge: 0,
              path: '/',
              expires: new Date(0)
            });
          });

        return response;
      }
      
      const session = sessionResult[0];
      console.log('[Middleware] Session found:', session);
      
      // Check if token version matches the current team version
      const sessionVersion = session.token_version || 1;
      const currentVersion = session.current_version || 1;
      
      if (sessionVersion !== currentVersion) {
        console.log('[Middleware] Token version mismatch:', { 
          sessionVersion: sessionVersion, 
          currentVersion: currentVersion 
        });
        
        // Token version mismatch, redirect to login
        const url = new URL('/', request.url);
        url.searchParams.set('authRequired', 'true');
        url.searchParams.set('redirect', pathname);
        url.searchParams.set('error', 'token_invalidated');
        url.searchParams.set('t', Date.now().toString());
        url.searchParams.set('rc', (redirectCount + 1).toString());

        const response = NextResponse.redirect(url);
        ['auth_session','auth_session_lax','auth_session_secure','auth_credentials']
          .forEach(name => {
            response.cookies.set(name, '', {
              maxAge: 0,
              path: '/',
              expires: new Date(0)
            });
          });

        return response;
      }
      
      // Update last accessed time
      await sql`
        UPDATE user_sessions SET last_accessed = NOW()
        WHERE session_id = ${authData.sessionId}
      `;
      
      console.log(`[Middleware] Session validation successful for ${authData.sessionId.substring(0,8)}... team ${teamName}`);
      
      // Session is valid, add auth headers to the request
      const requestHeaders = new Headers(request.headers);
      requestHeaders.set('X-Auth-Session', authData.sessionId);
      requestHeaders.set('X-Auth-Team', teamName);
      requestHeaders.set('X-Auth-Version', authData.version);
      requestHeaders.set('X-Auth-Environment', isVercelPreview ? 'preview' : isProduction ? 'production' : 'development');
      
      return NextResponse.next({
        request: {
          headers: requestHeaders,
        },
      });
      
    } catch (error) {
      console.error(`[Middleware] Database validation error:`, error);
      
      // On database error, we should fail closed and redirect to login.
      // This maintains security by not allowing potentially invalid sessions through
      console.log(`[Middleware] Redirecting to login due to database validation error`);
      
      const url = new URL('/', request.url);
      url.searchParams.set('authRequired', 'true');
      url.searchParams.set('redirect', pathname);
      url.searchParams.set('error', 'validation_db_failed');
      url.searchParams.set('t', Date.now().toString());
      url.searchParams.set('rc', (redirectCount + 1).toString());

      const response = NextResponse.redirect(url);
      ['auth_session','auth_session_lax','auth_session_secure','auth_credentials']
        .forEach(name => {
          response.cookies.set(name, '', {
            maxAge: 0,
            path: '/',
            expires: new Date(0)
          });
        });

      return response;
    }
  }
  
  console.log(`[Middleware] Auth data incomplete, redirecting to login`);
  
  // Auth data is incomplete - redirect to login
  const url = new URL('/', request.url);
  url.searchParams.set('authRequired', 'true');
  url.searchParams.set('redirect', pathname);
  url.searchParams.set('t', Date.now().toString());
  url.searchParams.set('rc', (redirectCount + 1).toString());

  const response = NextResponse.redirect(url);
  ['auth_session','auth_session_lax','auth_session_secure','auth_credentials']
    .forEach(name => {
      response.cookies.set(name, '', {
        maxAge: 0,
        path: '/',
        expires: new Date(0)
      });
    });

  return response;
}

// Configure which paths the middleware should run on
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (images, icons, etc.)
     * We DO want to include API routes for authentication
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}