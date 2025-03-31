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