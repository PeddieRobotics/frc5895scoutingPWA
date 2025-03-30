import { NextResponse } from 'next/server';

export const config = {
  // Apply to all paths except the auth API route itself
  matcher: [
    '/((?!api/auth).*)'
  ],
};

export function middleware(req) {
  const basicAuth = req.headers.get('authorization');
  const url = req.nextUrl;  // URL we might rewrite to

  if (basicAuth) {
    // Authorization header is present. Decode it from "Basic base64encodedUserPass".
    const authValue = basicAuth.split(' ')[1];
    const [user, pwd] = Buffer.from(authValue, 'base64').toString().split(':');

    // Check credentials against our expected username and password
    const expectedUser = process.env.BASIC_AUTH_USERNAME;
    const expectedPass = process.env.BASIC_AUTH_PASSWORD;
    if (user === expectedUser && pwd === expectedPass) {
      return NextResponse.next();  // Credentials are correct; allow request to proceed
    }
    // If credentials are wrong, we'll fall through to redirect to /api/auth
  }

  // No authorization or invalid credentials:
  url.pathname = '/api/auth';             // rewrite to our auth handler
  return NextResponse.rewrite(url);       // redirect the request to /api/auth
} 