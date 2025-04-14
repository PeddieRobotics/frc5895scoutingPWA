import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function GET(request) {
  try {
    // Get admin auth cookie
    const adminAuth = cookies().get('admin_auth')?.value;
    
    if (!adminAuth) {
      return NextResponse.json(
        { authenticated: false, message: 'Not authenticated' },
        { status: 401 }
      );
    }
    
    try {
      // Decode and check credentials
      const credentials = atob(adminAuth);
      const [username, password] = credentials.split(':');
      
      if (username === 'admin' && password === process.env.ADMIN_PASSWORD) {
        return NextResponse.json({ authenticated: true });
      }
    } catch (e) {
      console.error('Admin auth decode error:', e);
    }
    
    // If we reach here, authentication failed
    return NextResponse.json(
      { authenticated: false, message: 'Invalid credentials' },
      { status: 401 }
    );
  } catch (error) {
    console.error('Admin validation error:', error);
    return NextResponse.json(
      { authenticated: false, message: 'Server error' },
      { status: 500 }
    );
  }
} 