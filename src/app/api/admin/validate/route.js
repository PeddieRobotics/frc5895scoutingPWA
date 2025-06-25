import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function GET(request) {
  try {
    // Retrieve the admin password from environment variable
    const adminPassword = process.env.ADMIN_PASSWORD;
    
    if (!adminPassword) {
      console.error('Admin validation error: ADMIN_PASSWORD environment variable not set');
      return NextResponse.json(
        { authenticated: false, message: 'Server configuration error' },
        { status: 500 }
      );
    }
    
    // Get admin auth cookie (await required)
    const cookieStore = await cookies();
    const adminAuth = cookieStore.get('admin_auth');
    
    console.log('Admin validation attempt, cookie found:', !!adminAuth);
    
    // Check the admin_auth cookie - this is the only way to authenticate
    if (adminAuth?.value) {
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
    }
    
    // If we reach here, authentication failed
    console.log('No valid admin authentication found');
    return NextResponse.json(
      { authenticated: false, message: 'Not authenticated' },
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