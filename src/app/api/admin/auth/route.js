import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function POST(request) {
  try {
    const { sudoPassword } = await request.json();
    
    // Check against environment variable
    if (sudoPassword !== process.env.ADMIN_PASSWORD) {
      return NextResponse.json(
        { success: false, message: 'Invalid admin password' },
        { status: 401 }
      );
    }
    
    // Set admin cookie with expiration (24 hours)
    const adminAuth = btoa(`admin:${process.env.ADMIN_PASSWORD}`);
    const isProduction = process.env.NODE_ENV === 'production';
    
    // Create a response
    const response = NextResponse.json({ success: true });
    
    // Set SameSite=Lax cookie (works well on localhost)
    response.cookies.set('admin_auth', adminAuth, {
      httpOnly: false,
      secure: isProduction,
      maxAge: 60 * 60 * 24, // 24 hours
      path: '/',
      sameSite: 'lax'
    });
    
    // Also set SameSite=None cookie with Secure (required for cross-site in production)
    response.cookies.set('admin_auth', adminAuth, {
      httpOnly: false, 
      secure: true, // Always use secure when sameSite is 'none'
      maxAge: 60 * 60 * 24, // 24 hours
      path: '/',
      sameSite: 'none'
    });
    
    console.log("Set admin_auth cookies with both SameSite modes");
    return response;
  } catch (error) {
    console.error('Admin auth error:', error);
    return NextResponse.json(
      { success: false, message: 'Server error' },
      { status: 500 }
    );
  }
} 