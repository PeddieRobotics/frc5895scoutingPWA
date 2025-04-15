import { NextResponse } from 'next/server';

// Only essential allowed paths to prevent security issues
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
  
  // Allow public paths
  if (PUBLIC_PATHS.includes(pathname) || 
      PUBLIC_PATH_PREFIXES.some(prefix => pathname.startsWith(prefix))) {
    console.log(`Public path allowed: ${pathname}`);
    return NextResponse.next();
  }
  
  console.log(`Auth check for: ${pathname}`);
  
  // Check for auth in all possible locations
  let authCredentials = request.cookies.get('auth_credentials');
  let adminAuth = request.cookies.get('admin_auth');
  
  // Fallback to cookie header
  if (!authCredentials?.value) {
    const cookieHeader = request.headers.get('cookie');
    if (cookieHeader) {
      const cookies = cookieHeader.split(';').map(c => c.trim());
      
      const authCookie = cookies.find(c => c.startsWith('auth_credentials='));
      if (authCookie) {
        authCredentials = { value: authCookie.substring('auth_credentials='.length) };
      }
      
      const adminCookie = cookies.find(c => c.startsWith('admin_auth='));
      if (adminCookie) {
        adminAuth = { value: adminCookie.substring('admin_auth='.length) };
      }
    }
  }
  
  // Check authorization header for API clients
  const authorization = request.headers.get('authorization');
  if (!authCredentials?.value && authorization?.startsWith('Basic ')) {
    authCredentials = { value: authorization.substring('Basic '.length) };
  }
  
  if (authCredentials?.value || adminAuth?.value) {
    console.log('Auth found, allowing access');
    
    // MULTIPLE BROWSER SUPPORT STRATEGY
    // Create a response with multiple cookie settings to cover all browsers
    const response = NextResponse.next();
    
    // iOS compatibility mode - use both secure and non-secure cookies
    if (authCredentials?.value) {
      // Standard cookie (works in most browsers)
      response.cookies.set('auth_credentials', authCredentials.value, {
        maxAge: 30 * 24 * 60 * 60, // 30 days
        path: '/',
        httpOnly: true
      });
      
      // iOS Safari cookie (secure, but no SameSite to maximize compat)
      response.cookies.set('auth_credentials_ios', authCredentials.value, {
        maxAge: 30 * 24 * 60 * 60,
        path: '/',
        httpOnly: true,
        secure: true
      });
      
      // Session cookie (for browsers that don't support maxAge)
      response.cookies.set('auth_credentials_session', authCredentials.value, {
        path: '/',
        httpOnly: true
      });
    }
    
    if (adminAuth?.value) {
      response.cookies.set('admin_auth', adminAuth.value, {
        maxAge: 30 * 24 * 60 * 60,
        path: '/',
        httpOnly: true
      });
    }
    
    return response;
  }
  
  // Dev mode override
  if (process.env.NODE_ENV !== 'production' && 
      request.headers.get('x-override-auth') === 'true') {
    return NextResponse.next();
  }
  
  // Redirect to login page
  console.log("Auth not found, redirecting to login page");
  const url = new URL('/', request.url);
  url.searchParams.set('authRequired', 'true');
  url.searchParams.set('redirect', pathname);
  return NextResponse.redirect(url);
} 