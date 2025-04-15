import { NextResponse } from 'next/server';

// Skip database validation completely for now to fix the login loop
export async function middleware(request) {
  // ALWAYS ALLOW ACCESS TO THESE RESOURCES
  if (
    // Entry points and public pages
    request.nextUrl.pathname === '/' || 
    request.nextUrl.pathname === '' ||
    request.nextUrl.pathname === '/admin' ||
    
    // Static assets and internals
    request.nextUrl.pathname.startsWith('/_next/') ||
    request.nextUrl.pathname === '/favicon.ico' ||
    request.nextUrl.pathname === '/manifest.json' ||
    request.nextUrl.pathname.startsWith('/icons/') ||
    request.nextUrl.pathname.startsWith('/apple-touch-icon') ||
    request.nextUrl.pathname === '/sw.js' ||
    request.nextUrl.pathname.startsWith('/workbox-') ||
    
    // API endpoints - authentication handled internally
    request.nextUrl.pathname.startsWith('/api/') ||
    
    // Auth related paths
    request.nextUrl.pathname === '/login' ||
    request.nextUrl.pathname === '/register' ||
    request.nextUrl.pathname.startsWith('/auth/')
  ) {
    return NextResponse.next();
  }

  console.log(`Middleware checking auth for: ${request.nextUrl.pathname}`);
  
  // For all other routes, check for auth cookie
  let authCredentials = request.cookies.get('auth_credentials');
  let adminAuth = request.cookies.get('admin_auth');
  
  console.log(`Auth cookie from request.cookies: ${authCredentials ? 'EXISTS' : 'MISSING'}`);
  console.log(`Admin auth cookie from request.cookies: ${adminAuth ? 'EXISTS' : 'MISSING'}`);
  
  // Try to get from cookie header as a fallback
  if (!authCredentials?.value) {
    const cookieHeader = request.headers.get('cookie');
    console.log(`Raw cookie header: ${cookieHeader ? `present (${cookieHeader.length} bytes)` : 'missing'}`);
    
    if (cookieHeader) {
      const cookies = cookieHeader.split(';').map(c => c.trim());
      
      const authCookie = cookies.find(c => c.startsWith('auth_credentials='));
      if (authCookie) {
        const value = authCookie.substring('auth_credentials='.length);
        console.log(`Found auth_credentials in raw cookie header: ${value ? 'has value' : 'empty'}`);
        authCredentials = { value };
      }

      const adminCookie = cookies.find(c => c.startsWith('admin_auth='));
      if (adminCookie) {
        const value = adminCookie.substring('admin_auth='.length);
        console.log(`Found admin_auth in raw cookie header: ${value ? 'has value' : 'empty'}`);
        adminAuth = { value };
      }
    }
  }
  
  // Also check authorization header
  const authorization = request.headers.get('authorization');
  if (!authCredentials?.value && authorization?.startsWith('Basic ')) {
    console.log('Found auth in Authorization header');
    const value = authorization.substring('Basic '.length);
    authCredentials = { value };
  }
  
  // SIMPLIFIED AUTH CHECK - If any auth exists, allow access
  if (authCredentials?.value || adminAuth?.value) {
    console.log("Auth found, allowing access");
    
    // Create persistent response with cookie reinforcement
    const response = NextResponse.next();
    
    // Re-establish the cookie to ensure it persists
    if (authCredentials?.value) {
      response.cookies.set('auth_credentials', authCredentials.value, {
        maxAge: 30 * 24 * 60 * 60, // 30 days
        path: '/',
        httpOnly: true,
        sameSite: 'lax'
      });
    }
    
    if (adminAuth?.value) {
      response.cookies.set('admin_auth', adminAuth.value, {
        maxAge: 30 * 24 * 60 * 60, // 30 days
        path: '/',
        httpOnly: true,
        sameSite: 'lax'
      });
    }
    
    return response;
  }
  
  // Development mode testing hook
  if (process.env.NODE_ENV !== 'production' && request.headers.get('x-override-auth') === 'true') {
    console.log("Dev auth override header found, allowing access");
    return NextResponse.next();
  }
  
  // If no auth found, redirect to homepage
  console.log("Auth not found, redirecting to homepage");
  const url = new URL('/', request.url);
  url.searchParams.set('authRequired', 'true');
  url.searchParams.set('redirect', request.nextUrl.pathname);
  return NextResponse.redirect(url);
} 