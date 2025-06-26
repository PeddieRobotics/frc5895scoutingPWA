import { NextResponse } from 'next/server';

/**
 * Debug endpoint to troubleshoot authentication and environment issues
 * This is especially useful for diagnosing session problems in preview deployments
 */
export async function GET(request) {
  try {
    // Get environment info
    const environment = {
      NODE_ENV: process.env.NODE_ENV,
      VERCEL_ENV: process.env.VERCEL_ENV,
      FORCE_SECURE: process.env.FORCE_SECURE
    };
    
    // Get request info
    const requestInfo = {
      url: request.url,
      host: request.headers.get('host'),
      userAgent: request.headers.get('user-agent')?.substring(0, 100),
      protocol: request.headers.get('x-forwarded-proto') || 'unknown'
    };
    
    // Get all cookies
    const allCookies = request.cookies.getAll();
    const rawCookieHeader = request.headers.get('cookie');
    
    const cookieInfo = {
      rawHeader: rawCookieHeader,
      parsedCount: allCookies.length,
      cookies: allCookies.map(cookie => ({
        name: cookie.name,
        valueLength: cookie.value?.length || 0,
        valuePreview: cookie.value?.substring(0, 50) + (cookie.value?.length > 50 ? '...' : ''),
        isAuthCookie: cookie.name.includes('auth') || cookie.name.includes('session')
      }))
    };
    
    // Try to extract auth data using the same logic as middleware
    let authData = null;
    try {
      const authCookie = request.cookies.get('auth_session');
      const authCookieLax = request.cookies.get('auth_session_lax');
      const authCookieSecure = request.cookies.get('auth_session_secure');
      const authCredentials = request.cookies.get('auth_credentials');
      
      const cookieValue = authCookieSecure?.value || authCookieLax?.value || authCookie?.value || authCredentials?.value;
      
      if (cookieValue) {
        try {
          let decodedValue;
          try {
            decodedValue = JSON.parse(decodeURIComponent(cookieValue));
          } catch (e) {
            try {
              decodedValue = JSON.parse(cookieValue);
            } catch (e2) {
              decodedValue = decodeURIComponent(cookieValue);
            }
          }
          
          authData = {
            source: authCookieSecure ? 'auth_session_secure' : 
                   authCookieLax ? 'auth_session_lax' : 
                   authCookie ? 'auth_session' : 'auth_credentials',
            decodedType: typeof decodedValue,
            decodedValue: typeof decodedValue === 'object' ? decodedValue : { raw: decodedValue }
          };
        } catch (e) {
          authData = {
            error: 'Failed to decode auth data',
            errorMessage: e.message
          };
        }
      }
    } catch (e) {
      authData = {
        error: 'Failed to extract auth data',
        errorMessage: e.message
      };
    }
    
    const debugInfo = {
      timestamp: new Date().toISOString(),
      environment,
      requestInfo,
      cookieInfo,
      authData
    };
    
    return NextResponse.json(debugInfo, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Content-Type': 'application/json'
      }
    });
    
  } catch (error) {
    return NextResponse.json({
      error: 'Debug endpoint error',
      message: error.message,
      timestamp: new Date().toISOString()
    }, {
      status: 500,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Content-Type': 'application/json'
      }
    });
  }
} 