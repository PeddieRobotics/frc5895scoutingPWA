import { NextResponse } from 'next/server';

// PUBLIC PATHS - no auth needed
const PUBLIC_PATHS = [
  '/',
  '/admin',
  '/login',
  '/register',
  '/favicon.ico',
  '/manifest.json',
  '/ios-auth.js'
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
  
  if (pathname.startsWith('/ios-auth.js')) {
    return NextResponse.next();
  }
  
  // Allow public paths without auth
  if (PUBLIC_PATHS.includes(pathname) || 
      PUBLIC_PATH_PREFIXES.some(prefix => pathname.startsWith(prefix))) {
    return NextResponse.next();
  }
  
  // DETECT iOS DEVICE
  const userAgent = request.headers.get('user-agent') || '';
  const isIOS = /iPad|iPhone|iPod/.test(userAgent);
  
  // Get auth from cookies or headers
  let authCredentials = request.cookies.get('auth_credentials');
  let iOSAuth = request.cookies.get('ios_auth'); // iOS-specific cookie
  let adminAuth = request.cookies.get('admin_auth');
  
  // Check URL param for iOS authentication
  const urlParams = new URL(request.url).searchParams;
  const iosAuthFromUrl = urlParams.get('ios_auth');
  
  if (isIOS && iosAuthFromUrl && !authCredentials?.value) {
    console.log('Found iOS auth from URL parameter');
    authCredentials = { value: iosAuthFromUrl };
  }
  
  // Try authorization header for API
  const authorization = request.headers.get('authorization');
  if (!authCredentials?.value && authorization?.startsWith('Basic ')) {
    authCredentials = { value: authorization.substring('Basic '.length) };
  }
  
  // AUTHORIZATION CHECK
  if (authCredentials?.value || adminAuth?.value || iOSAuth?.value) {
    // Auth found! Create response with enhanced cookie persistence
    const response = NextResponse.next();
    
    // Get the credential value from whichever source had it
    const credValue = authCredentials?.value || iOSAuth?.value;
    
    if (credValue) {
      if (isIOS) {
        console.log('iOS device detected, applying special cookie settings');
        
        // Special iOS cookie settings
        response.cookies.set('ios_auth', credValue, {
          // No expiry - session only for iOS
          path: '/',
          // No httpOnly to allow JS access
          secure: false,
          // No sameSite specification
        });
        
        // Add special header that will be detected by client script
        response.headers.set('X-Auth-Transfer', 'enabled');
        
        // Also set the normal cookie without restrictive flags
        response.cookies.set('auth_credentials', credValue, {
          path: '/',
        });
      } else {
        // Standard settings for non-iOS browsers
        response.cookies.set('auth_credentials', credValue, {
          maxAge: 30 * 24 * 60 * 60, // 30 days
          path: '/',
          httpOnly: true
        });
      }
    }
    
    if (adminAuth?.value) {
      response.cookies.set('admin_auth', adminAuth.value, {
        maxAge: isIOS ? undefined : 30 * 24 * 60 * 60,
        path: '/',
        httpOnly: !isIOS
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