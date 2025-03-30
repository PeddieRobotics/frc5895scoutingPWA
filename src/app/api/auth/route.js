import { NextResponse } from 'next/server';

export async function GET() {
  console.log('Auth API route hit');
  return new NextResponse('Authentication Required', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Secure Area"',
      'Content-Type': 'text/plain'
    }
  });
}

// Handle POST or other methods similarly, so all request types prompt for auth
export async function POST() {
  return GET();
} 