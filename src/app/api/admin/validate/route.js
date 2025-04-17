import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

// DEVELOPMENT HARDCODED PASSWORD - remove in production
const DEV_PASSWORD = 'admin123';

export async function GET(request) {
  try {
    // Simple authentication logic for development
    const adminPassword = process.env.ADMIN_PASSWORD || DEV_PASSWORD;
    
    // Get admin auth cookie
    const cookieStore = cookies();
    const adminAuth = cookieStore.get('admin_auth');
    
    console.log('Admin validation attempt, cookie found:', !!adminAuth);
    
    if (!adminAuth?.value) {
      console.log('No admin_auth cookie found');
      return NextResponse.json(
        { authenticated: false, message: 'Not authenticated' },
        { status: 401 }
      );
    }
    
    try {
      // Simple base64 decoding
      const decoded = Buffer.from(adminAuth.value, 'base64').toString('utf-8');
      const [username, password] = decoded.split(':');
      
      console.log(`Admin validation: username=${username}, password length=${password?.length || 0}`);
      
      if (username === 'admin' && password === adminPassword) {
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