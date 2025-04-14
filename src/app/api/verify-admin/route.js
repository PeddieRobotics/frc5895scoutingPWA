import { NextResponse } from 'next/server';

export async function POST(request) {
  const res = await request.json();
  const { password } = res;
  
  // Check if password matches the admin password
  if (password === process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ 
      authenticated: true,
      message: "Admin authentication successful" 
    }, { status: 200 });
  } else {
    return NextResponse.json({ 
      authenticated: false,
      error: "Invalid admin password" 
    }, { status: 401 });
  }
} 