import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function POST(request) {
  console.log("Admin logout API called - clearing all auth cookies");
  
  // Get the user agent to check for Firefox-specific issues
  const userAgent = request.headers.get('user-agent') || '';
  const isFirefox = userAgent.includes('Firefox');
  
  console.log(`Browser appears to be: ${isFirefox ? 'Firefox' : 'Other browser'}`);
  
  // Clear both auth cookies with proper options to ensure deletion
  const cookieStore = cookies();
  const allCookies = cookieStore.getAll();
  console.log(`Current cookies in store (${allCookies.length}):`, 
    allCookies.map(c => c.name).join(', '));
  
  // Use every possible combination to delete cookies
  const cookiesToClear = ['admin_auth', 'auth_credentials'];
  
  cookiesToClear.forEach(cookieName => {
    // Try with various combinations of settings
    [true, false].forEach(secure => {
      ['none', 'lax', 'strict'].forEach(sameSite => {
        // Skip invalid combinations (SameSite=None requires Secure)
        if (sameSite === 'none' && !secure) return;
        
        cookieStore.delete(cookieName, {
          path: '/',
          secure,
          httpOnly: true,
          sameSite: sameSite.toLowerCase()
        });
        
        // Also try without httpOnly
        cookieStore.delete(cookieName, {
          path: '/',
          secure,
          httpOnly: false,
          sameSite: sameSite.toLowerCase()
        });
      });
    });
    
    // Also try without any specific options
    cookieStore.delete(cookieName);
    
    // And with just path
    cookieStore.delete(cookieName, { path: '/' });
  });
  
  // Create response with aggressive cookie clearing
  const response = NextResponse.json({
    success: true,
    message: 'Successfully logged out - cookies cleared'
  });
  
  // Set expired cookies in the response with various configurations
  cookiesToClear.forEach(cookieName => {
    // Set expired cookies with all possible combinations
    [true, false].forEach(secure => {
      ['none', 'lax', 'strict', ''].forEach(sameSite => {
        // Skip invalid combinations (SameSite=None requires Secure)
        if (sameSite === 'none' && !secure) return;
        
        const cookieOptions = {
          path: '/',
          expires: new Date(0),
          httpOnly: true
        };
        
        if (secure) cookieOptions.secure = true;
        if (sameSite) cookieOptions.sameSite = sameSite.toLowerCase();
        
        response.cookies.set(cookieName, '', cookieOptions);
        
        // Also try without httpOnly
        const nonHttpOnlyOptions = {...cookieOptions, httpOnly: false};
        response.cookies.set(cookieName, '', nonHttpOnlyOptions);
      });
    });
    
    // Also set with minimal options
    response.cookies.set(cookieName, '', {
      path: '/',
      expires: new Date(0)
    });
    
    // And clear without path
    response.cookies.set(cookieName, '', {
      expires: new Date(0)
    });
    
    // Firefox-specific approach - overwrite with invalid cookie value
    if (isFirefox) {
      response.cookies.set(cookieName, 'DELETED', {
        path: '/',
        expires: new Date(0)
      });
    }
  });
  
  // Add a Clear-Site-Data header for browsers that support it
  response.headers.set('Clear-Site-Data', '"cookies"');
  
  // Double check what cookies we're sending back
  const setCookieHeader = response.headers.get('Set-Cookie');
  console.log("Set-Cookie header:", setCookieHeader ? 
    `${setCookieHeader.length} bytes, ${setCookieHeader.split(',').length} entries` : 'none');
  
  return response;
} 