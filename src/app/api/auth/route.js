import { NextResponse } from 'next/server';

export async function GET() {
  return new NextResponse('Auth Required.', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Secure Area"' }
  });
}

// Handle POST or other methods similarly, so all request types prompt for auth
export async function POST() {
  return GET();
} 