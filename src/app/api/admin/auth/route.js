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
    cookies().set('admin_auth', adminAuth, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24, // 24 hours
      path: '/',
      sameSite: 'strict'
    });
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Admin auth error:', error);
    return NextResponse.json(
      { success: false, message: 'Server error' },
      { status: 500 }
    );
  }
} 