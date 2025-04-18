import { NextResponse } from 'next/server';
import { nanoid } from 'nanoid';

// PUBLIC PATHS - no auth needed
const PUBLIC_PATHS = [
  '/',
  '/admin',
  '/login',
  '/register',
  '/favicon.ico',
  '/manifest.json',
  '/api/admin/debug',
  '/api/auth/validate-token',
  '/auth-handler.js',
  '/fix-auth.js',
  '/ios-auth.js',
  '/reset-auth.html'
];

const PUBLIC_PATH_PREFIXES = [
  '/_next/',
  '/icons/',
  '/apple-touch-icon',
  '/api/auth/',
  '/auth/',
  '/ios-auth/'
];

// Admin API routes that use cookies instead of Authorization headers
const ADMIN_COOKIE_ROUTES = [
  '/api/admin/auth',
  '/api/admin/validate',
  '/api/admin/teams'
];

export async function middleware(request) {
  const { pathname } = request.nextUrl;
  
  // Create headers for cache prevention
  const cacheHeaders = {
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
  };
  
  console.log(`[Middleware] Processing request for ${pathname}`);
  
  // Allow public paths without auth
  if (PUBLIC_PATHS.includes(pathname) || 
      PUBLIC_PATH_PREFIXES.some(prefix => pathname.startsWith(prefix))) {
    console.log(`[Middleware] Public path access: ${pathname}`);
    const response = NextResponse.next();
    // Add cache prevention headers
    Object.entries(cacheHeaders).forEach(([key, value]) => {
      response.headers.set(key, value);
    });
    return response;
  }

  // Check if this is a client-initiated validation request
  const clientValidating = request.headers.get('x-client-validating') === 'true';
  if (clientValidating) {
    console.log(`[Middleware] Client-side validation in progress, skipping middleware validation`);
    return NextResponse.next();
  }

  // Special handling for admin API routes that use cookies
  if (ADMIN_COOKIE_ROUTES.includes(pathname)) {
    console.log(`[Middleware] Processing cookie-based API route: ${pathname}`);
    
    // Check for valid session cookies
    const authCookie = request.cookies.get('auth_session');
    const authCookieLax = request.cookies.get('auth_session_lax');
    const authCookieSecure = request.cookies.get('auth_session_secure');
    
    // Try to extract token data from cookies
    let tokenData = null;
    let sessionId = null;
    let teamName = null;
    
    try {
      if (authCookie?.value || authCookieLax?.value || authCookieSecure?.value) {
        const tokenStr = authCookie?.value || authCookieLax?.value || authCookieSecure?.value;
        
        // URL decode the cookie value first (handles cases where JSON is URL encoded)
        let decodedTokenStr = tokenStr;
        try {
          decodedTokenStr = decodeURIComponent(tokenStr);
        } catch (decodeError) {
          console.log(`[Middleware] Failed to URL decode admin cookie, will use as-is`);
          // Continue with the original value if decoding fails
        }
        
        // First try to parse as JSON
        try {
          tokenData = JSON.parse(decodedTokenStr);
          console.log(`[Middleware] Found JSON token data in cookies for ${pathname}: team=${tokenData?.team}, sessionId=${tokenData?.id?.substring(0,8)}`);
          sessionId = tokenData.id;
          teamName = tokenData.team;
        } catch (e) {
          // If not JSON, treat as plain session ID
          console.log(`[Middleware] Cookie is not JSON, treating as plain session ID: ${decodedTokenStr.substring(0,8)}...`);
          sessionId = decodedTokenStr;
          
          // We can't directly look up the team name in Edge Runtime
          // Set a special header to indicate we need to look up the team name
          const requestHeaders = new Headers(request.headers);
          requestHeaders.set('X-Auth-Session', sessionId);
          requestHeaders.set('X-Auth-Team-Lookup-Needed', 'true');
          
          console.log(`[Middleware] Added auth headers with pending team lookup for ${pathname}`);
          
          return NextResponse.next({
            request: {
              headers: requestHeaders,
            },
            headers: cacheHeaders
          });
        }
        
        if (sessionId && teamName) {
          // Add auth headers to the request
          const requestHeaders = new Headers(request.headers);
          requestHeaders.set('X-Auth-Validated', 'true');
          requestHeaders.set('X-Auth-Team', teamName);
          requestHeaders.set('X-Auth-Session', sessionId);
          
          console.log(`[Middleware] Added auth headers for ${pathname}`);
          
          return NextResponse.next({
            request: {
              headers: requestHeaders,
            },
            headers: cacheHeaders
          });
        }
      } else {
        console.log(`[Middleware] No auth cookies found for ${pathname}`);
      }
    } catch (e) {
      console.error(`[Middleware] Error processing auth cookie in ADMIN_COOKIE_ROUTES for ${pathname}:`, e);
    }
    
    // If we get here, there were no valid auth cookies
    console.log(`[Middleware] No valid auth data found for ${pathname}, blocking access`);
    return new NextResponse(JSON.stringify({ error: 'Authentication required' }), {
      status: 401,
      headers: { 
        'Content-Type': 'application/json',
        ...cacheHeaders
      }
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
    
    // If it doesn't have a valid auth header, check for auth cookies
    const authCookie = request.cookies.get('auth_session');
    const authCookieLax = request.cookies.get('auth_session_lax');
    const authCookieSecure = request.cookies.get('auth_session_secure');
    const adminAuthCookie = request.cookies.get('admin_auth');
    
    // Try to extract token data from cookies
    let tokenData = null;
    try {
      if (authCookie?.value || authCookieLax?.value || authCookieSecure?.value) {
        const tokenStr = authCookie?.value || authCookieLax?.value || authCookieSecure?.value;
        
        // URL decode the cookie value first (handles cases where JSON is URL encoded)
        let decodedTokenStr = tokenStr;
        try {
          decodedTokenStr = decodeURIComponent(tokenStr);
        } catch (decodeError) {
          console.log(`[Middleware] Failed to URL decode API cookie, will use as-is`);
          // Continue with the original value if decoding fails
        }
        
        try {
          tokenData = JSON.parse(decodedTokenStr);
        } catch (parseError) {
          console.log(`[Middleware] API Cookie is not JSON, treating as plain session ID: ${decodedTokenStr.substring(0,8)}...`);
          
          // For plain session IDs, we'll use a special format to pass through to API
          // We can't query the database from middleware (Edge Runtime limitation)
          tokenData = {
            id: decodedTokenStr,
            team: 'pending_lookup', // Special marker to indicate we need to look up the team
            v: '2'                  // Use a default version of 2 instead of 1
          };
        }
      }
    } catch (e) {
      console.error('Error parsing auth cookie for API:', e);
    }
    
    // If admin auth cookie exists, proceed (admin validation happens in the routes)
    if (adminAuthCookie?.value) {
      console.log(`[Middleware] Admin auth cookie found for ${pathname}`);
      const response = NextResponse.next();
      // Add cache prevention headers
      Object.entries(cacheHeaders).forEach(([key, value]) => {
        response.headers.set(key, value);
      });
      return response;
    }
    
    // If we have valid tokenData from cookies, validate it
    if (tokenData?.id && tokenData?.team) {
      try {
        // If token doesn't have a version, set a default
        if (!tokenData.v) {
          tokenData.v = '1';
        }
        
        console.log(`[Middleware] Validating token for API request: session ${tokenData.id}, team ${tokenData.team}, version ${tokenData.v}`);
        
        // Use AbortController to set a timeout for the fetch
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
        
        try {
          // Adjust the validation URL based on whether we need to look up the team
          let validationUrl = new URL('/api/auth/validate-token', request.url).toString();
          
          // Perform actual token validation against the database
          const validationResponse = await fetch(validationUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
              'Pragma': 'no-cache',
            },
            body: JSON.stringify({
              sessionId: tokenData.id,
              team: tokenData.team,
              version: tokenData.v,
              needsTeamLookup: tokenData.team === 'pending_lookup'
            }),
            signal: controller.signal
          });
          
          clearTimeout(timeoutId);
          
          if (!validationResponse.ok) {
            console.log(`[Middleware] API token validation HTTP error: ${validationResponse.status}`);
            // Return 401
            return new NextResponse(JSON.stringify({ error: 'Authentication failed' }), {
              status: 401,
              headers: { 
                'Content-Type': 'application/json',
                ...cacheHeaders
              }
            });
          }
          
          const validationResult = await validationResponse.json();
          
          if (!validationResult.valid) {
            console.log(`[Middleware] API token invalid: ${validationResult.message}`);
            // Return 401
            return new NextResponse(JSON.stringify({ error: validationResult.message || 'Authentication failed' }), {
              status: 401,
              headers: { 
                'Content-Type': 'application/json',
                ...cacheHeaders
              }
            });
          }
          
          // Token is valid, proceed with the request
          const requestHeaders = new Headers(request.headers);
          requestHeaders.set('X-Auth-Validated', 'true');
          requestHeaders.set('X-Auth-Team', validationResult.team || tokenData.team);
          requestHeaders.set('X-Auth-Session', tokenData.id);
          
          console.log(`[Middleware] API token validation successful, proceeding`);
          
          return NextResponse.next({
            request: {
              headers: requestHeaders,
            },
            headers: cacheHeaders
          });
        } catch (fetchError) {
          clearTimeout(timeoutId);
          console.log(`[Middleware] Fetch error during API validation:`, fetchError.message);
          
          // CRITICAL CHANGE: No longer allowing requests to proceed on validation errors
          return new NextResponse(JSON.stringify({ error: 'Authentication service unavailable' }), {
            status: 503,
            headers: { 
              'Content-Type': 'application/json',
              ...cacheHeaders
            }
          });
        }
      } catch (error) {
        console.log(`[Middleware] API authentication error: ${error.message}`);
        return new NextResponse(JSON.stringify({ error: 'Authentication failed' }), {
          status: 401,
          headers: { 
            'Content-Type': 'application/json',
            ...cacheHeaders
          }
        });
      }
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
  
  // For all non-API protected routes, check for session cookie
  const authCookie = request.cookies.get('auth_session');
  const authCookieLax = request.cookies.get('auth_session_lax');
  const authCookieSecure = request.cookies.get('auth_session_secure');
  const adminAuthCookie = request.cookies.get('admin_auth');
  
  // If admin auth cookie exists, proceed (admin validation happens in the routes)
  if (adminAuthCookie?.value) {
    console.log(`[Middleware] Admin auth cookie found for ${pathname}`);
    return NextResponse.next();
  }
  
  // If we have any auth cookie, validate it
  if (authCookie?.value || authCookieLax?.value || authCookieSecure?.value) {
    try {
      // Use the first available cookie
      const tokenStr = authCookie?.value || authCookieLax?.value || authCookieSecure?.value;
      let tokenData;
      
      // URL decode the cookie value first (handles cases where JSON is URL encoded)
      let decodedTokenStr = tokenStr;
      try {
        decodedTokenStr = decodeURIComponent(tokenStr);
      } catch (decodeError) {
        console.log(`[Middleware] Failed to URL decode cookie, will use as-is`);
        // Continue with the original value if decoding fails
      }
      
      // Try to parse as JSON, but if it fails, treat as a plain session ID
      try {
        tokenData = JSON.parse(decodedTokenStr);
      } catch (parseError) {
        console.log(`[Middleware] Cookie is not JSON, treating as plain session ID: ${decodedTokenStr.substring(0,8)}...`);
        
        // For plain session IDs, we'll use a special format to pass through to API
        // We can't query the database from middleware (Edge Runtime limitation)
        tokenData = {
          id: decodedTokenStr,
          team: 'pending_lookup', // Special marker to indicate we need to look up the team
          v: '2'                  // Use a default version of 2 instead of 1
        };
      }
      
      if (!tokenData.id) {
        throw new Error('Invalid token format');
      }
      
      // For regular sessions, need team info (except for pending lookups which will be resolved in the API)
      if (tokenData.team !== 'pending_lookup' && !tokenData.team) {
        throw new Error('Missing team information');
      }
      
      // Check if token version is present, use default if not
      if (!tokenData.v) {
        tokenData.v = '1';
      }
      
      console.log(`[Middleware] Validating token: session=${tokenData.id.substring(0,8)}, team=${tokenData.team}, version=${tokenData.v}`);
      
      // Use AbortController to set a timeout for the fetch
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
      
      try {
        // Adjust the validation URL based on whether we need to look up the team
        let validationUrl = new URL('/api/auth/validate-token', request.url).toString();
        
        // Perform actual token validation against the database
        const validationResponse = await fetch(validationUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
            'Pragma': 'no-cache',
          },
          body: JSON.stringify({
            sessionId: tokenData.id,
            team: tokenData.team,
            version: tokenData.v,
            needsTeamLookup: tokenData.team === 'pending_lookup'
          }),
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!validationResponse.ok) {
          console.log(`[Middleware] Token validation HTTP error: ${validationResponse.status}`);
          
          // Create the URL with error params
          const url = new URL('/', request.url);
          url.searchParams.set('authRequired', 'true');
          url.searchParams.set('redirect', pathname);
          url.searchParams.set('error', 'Your session has expired or been invalidated');
          
          // Create response with the URL and delete cookies
          const response = NextResponse.redirect(url);
          response.cookies.delete('auth_session');
          response.cookies.delete('auth_session_lax');
          response.cookies.delete('auth_session_secure');
          
          return response;
        }
        
        const validationResult = await validationResponse.json();
        console.log(`[Middleware] Validation result:`, validationResult);
        
        if (!validationResult.valid) {
          console.log(`[Middleware] Token invalid: ${validationResult.message}`);
          
          // Create the URL with error params
          const url = new URL('/', request.url);
          url.searchParams.set('authRequired', 'true');
          url.searchParams.set('redirect', pathname);
          url.searchParams.set('error', validationResult.message || 'Your session has expired or been invalidated');
          
          // Create response with the URL and delete cookies
          const response = NextResponse.redirect(url);
          response.cookies.delete('auth_session');
          response.cookies.delete('auth_session_lax');
          response.cookies.delete('auth_session_secure');
          
          return response;
        }
        
        // Token is valid, proceed with the request
        const requestHeaders = new Headers(request.headers);
        requestHeaders.set('X-Auth-Validated', 'true');
        // Use the team from validation result if available
        requestHeaders.set('X-Auth-Team', validationResult.team || tokenData.team);
        requestHeaders.set('X-Auth-Session', tokenData.id);
        
        console.log(`[Middleware] Token validation successful, proceeding`);
        
        return NextResponse.next({
          request: {
            headers: requestHeaders,
          },
        });
      } catch (fetchError) {
        clearTimeout(timeoutId);
        console.log(`[Middleware] Fetch error during validation:`, fetchError.message);
        
        // CRITICAL CHANGE: No longer allowing requests to proceed on validation errors
        // Create the URL with error params
        const url = new URL('/', request.url);
        url.searchParams.set('authRequired', 'true');
        url.searchParams.set('redirect', pathname);
        url.searchParams.set('error', 'Authentication service unavailable');
        
        // Create response with the URL and delete cookies
        const response = NextResponse.redirect(url);
        response.cookies.delete('auth_session');
        response.cookies.delete('auth_session_lax');
        response.cookies.delete('auth_session_secure');
        
        return response;
      }
    } catch (error) {
      // Token validation failed, redirect to login
      console.log(`[Middleware] Authentication failed: ${error.message}`);
      
      // Create the URL with error params
      const url = new URL('/', request.url);
      url.searchParams.set('authRequired', 'true');
      url.searchParams.set('redirect', pathname);
      url.searchParams.set('error', 'Your session has expired or been invalidated');
      
      // Create response with the URL and delete cookies
      const response = NextResponse.redirect(url);
      response.cookies.delete('auth_session');
      response.cookies.delete('auth_session_lax');
      response.cookies.delete('auth_session_secure');
      
      return response;
    }
  }
  
  console.log(`[Middleware] No valid auth cookie found, redirecting to login`);
  
  // No valid auth cookie found - redirect to login with original destination
  const url = new URL('/', request.url);
  url.searchParams.set('authRequired', 'true');
  url.searchParams.set('redirect', pathname);
  return NextResponse.redirect(url);
} 