import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function POST(request) {
  console.log("Admin logout API called - clearing all auth cookies");
  
  // Create response with status
  const response = NextResponse.json({
    success: true,
    message: 'Successfully logged out - cookies cleared'
  });
  
  // Define cookie configurations to clear
  const cookieDeletionVariants = [
    { path: '/', sameSite: 'lax', secure: false, httpOnly: false },
    { path: '/', sameSite: 'lax', secure: false, httpOnly: true },
    { path: '/', sameSite: 'none', secure: true, httpOnly: false },
    { path: '/', sameSite: 'none', secure: true, httpOnly: true },
    { path: '/' } // Minimal option
  ];
  
  // Clear admin_auth cookie with all variants
  for (const options of cookieDeletionVariants) {
    response.cookies.set('admin_auth', '', {
      ...options,
      maxAge: 0,
      expires: new Date(0)
    });
  }
  
  // Add a Clear-Site-Data header for browsers that support it
  response.headers.set('Clear-Site-Data', '"cookies"');
  
  return response;
} 