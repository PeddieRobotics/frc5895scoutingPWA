import { NextResponse } from 'next/server';

export function middleware(request) {
  // Skip auth check for API routes, Next.js internals, favicon, and PWA resources
  if (
    request.nextUrl.pathname.startsWith('/api/') ||
    request.nextUrl.pathname.startsWith('/_next/') ||
    request.nextUrl.pathname === '/favicon.ico' ||
    // Allow manifest.json
    request.nextUrl.pathname === '/manifest.json' ||
    // Allow all icon files
    request.nextUrl.pathname.startsWith('/icons/') ||
    // Allow Apple touch icons (used by iOS for home screen icons)
    request.nextUrl.pathname.startsWith('/apple-touch-icon') ||
    // Allow service worker files
    request.nextUrl.pathname === '/sw.js' ||
    request.nextUrl.pathname.startsWith('/workbox-')
  ) {
    return NextResponse.next();
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
  
  // Skip authentication for standalone PWA mode 
  if (isPWA) {
    return NextResponse.next();
  }
  
  const basicAuth = request.headers.get('Authorization');
  
  if (basicAuth) {
    const authValue = basicAuth.split(' ')[1];
    const [user, pwd] = atob(authValue).split(':');
    
    // Perform exact string comparison for authentication
    if (
      user === process.env.BASIC_AUTH_USERNAME && 
      pwd === process.env.BASIC_AUTH_PASSWORD
    ) {
      return NextResponse.next();
    }
  }
  
  // Return the 401 response
  return new NextResponse(null, {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Secure Area"'
    }
  });
} 