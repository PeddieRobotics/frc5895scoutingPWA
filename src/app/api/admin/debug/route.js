import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // Collect debug information
    const debugInfo = {
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'unknown',
      adminPasswordConfigured: !!process.env.ADMIN_PASSWORD,
      serverInfo: {
        platform: process.platform,
        nodeVersion: process.version,
      }
    };
    
    // Return debug information
    return NextResponse.json(debugInfo);
  } catch (error) {
    console.error('Debug endpoint error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
} 