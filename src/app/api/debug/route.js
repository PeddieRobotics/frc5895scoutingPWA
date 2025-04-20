import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getEnvironmentInfo } from '../../../util/buildId';

/**
 * Debug endpoint to troubleshoot authentication and environment issues
 * This is especially useful for diagnosing session problems in preview deployments
 */
export async function GET(request) {
  // Get cookie store
  const cookieStore = cookies();
  
  // Get all cookies
  const allCookies = cookieStore.getAll();
  
  // Get environment info
  const envInfo = getEnvironmentInfo();
  
  // Create a safe version of cookies for debugging
  // This avoids exposing actual credentials
  const safeCookies = allCookies.map(cookie => {
    // For auth cookies, mask the actual value
    if (cookie.name.includes('auth') || cookie.name.includes('session')) {
      return {
        name: cookie.name,
        value: cookie.value ? `${cookie.value.substring(0, 8)}...` : null,
        attributes: {
          path: cookie.path || '/',
          sameSite: cookie.sameSite || 'unspecified',
          secure: !!cookie.secure,
          httpOnly: !!cookie.httpOnly
        }
      };
    }
    
    // For other cookies, return normally
    return {
      name: cookie.name,
      value: cookie.value,
      attributes: {
        path: cookie.path || '/',
        sameSite: cookie.sameSite || 'unspecified',
        secure: !!cookie.secure,
        httpOnly: !!cookie.httpOnly
      }
    };
  });
  
  // Get headers for debugging
  const headers = {};
  request.headers.forEach((value, key) => {
    // Skip authorization header
    if (key.toLowerCase() === 'authorization') {
      headers[key] = 'REDACTED';
    } else {
      headers[key] = value;
    }
  });
  
  // Create debug info response
  const debugInfo = {
    environment: envInfo,
    cookies: {
      count: safeCookies.length,
      items: safeCookies
    },
    headers: headers,
    url: request.url,
    timestamp: new Date().toISOString(),
    serverTime: {
      local: new Date().toLocaleString(),
      utc: new Date().toUTCString()
    }
  };
  
  // Add server-side environment variables (safely)
  debugInfo.serverEnv = {
    NODE_ENV: process.env.NODE_ENV || 'unknown',
    VERCEL_ENV: process.env.VERCEL_ENV || 'unknown',
    IS_VERCEL_DEPLOYMENT: !!process.env.VERCEL,
    HAS_DATABASE_URL: !!process.env.DATABASE_URL
  };
  
  return NextResponse.json(debugInfo, {
    headers: {
      'Cache-Control': 'no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    }
  });
} 