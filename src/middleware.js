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
  
  console.log(`Auth Debug - Path: ${pathname}, iOS: ${isIOS}, URL param: ${iosAuthFromUrl ? 'present' : 'absent'}, Cookie: ${iOSAuth?.value ? 'present' : 'absent'}, Auth: ${authCredentials?.value ? 'present' : 'absent'}`);

  // Try authorization header for API
  const authorization = request.headers.get('authorization');
  if (!authCredentials?.value && authorization?.startsWith('Basic ')) {
    authCredentials = { value: authorization.substring('Basic '.length) };
  }

  // AUTHORIZATION CHECK (middleware never sets cookies)
  if (authCredentials?.value || adminAuth?.value || iOSAuth?.value) {
    return NextResponse.next();
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
  
  // Preserve iOS auth parameter if present
  if (isIOS && iosAuthFromUrl) {
    url.searchParams.set('ios_auth', iosAuthFromUrl);
    console.log(`Preserving iOS auth during redirect to: ${url.toString()}`);
  }
  
  return NextResponse.redirect(url);
} 