import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

// DEVELOPMENT HARDCODED PASSWORD - remove in production
const DEV_PASSWORD = 'admin123';

export async function POST(request) {
  try {
    const { sudoPassword } = await request.json();
    
    // Simple authentication logic for development
    const adminPassword = process.env.ADMIN_PASSWORD || DEV_PASSWORD;
    
    // Debug log
    console.log(`Auth attempt with password: ${sudoPassword?.length || 0} chars`);
    
    // Simple password check
    if (sudoPassword !== adminPassword) {
      return NextResponse.json(
        { success: false, message: 'Invalid admin password' },
        { status: 401 }
      );
    }
    
    // Create the admin auth token
    const adminAuth = Buffer.from(`admin:${adminPassword}`).toString('base64');
    
    // Get cookie store
    const cookieStore = cookies();
    
    // Set the cookie directly
    cookieStore.set('admin_auth', adminAuth, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24, // 24 hours
      path: '/'
    });
    
    // Create response
    const response = NextResponse.json({ success: true });
    
    // Also set the cookie in the response for client-side access
    response.cookies.set('admin_auth', adminAuth, {
      httpOnly: false, // Readable by client JS
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24, // 24 hours
      path: '/'
    });
    
    return response;
  } catch (error) {
    console.error('Admin auth error:', error);
    return NextResponse.json(
      { success: false, message: 'Server error' },
      { status: 500 }
    );
  }
} 