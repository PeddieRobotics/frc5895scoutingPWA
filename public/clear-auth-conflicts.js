/**
 * Clear Authentication Conflicts Script
 * Run this in the browser console to clear conflicting auth cookies
 * that might be causing inconsistent login behavior.
 */

(function() {
  console.log('[Auth Cleanup] Starting authentication cleanup...');
  
  // List of all possible conflicting cookie names
  const authCookieNames = [
    'auth_credentials',
    'auth_token',
    'auth_token_expiry',
    'auth_token_version',
    'auth_session',
    'auth_session_lax', 
    'auth_session_secure'
  ];
  
  // Clear localStorage
  authCookieNames.forEach(name => {
    localStorage.removeItem(name);
  });
  console.log('[Auth Cleanup] Cleared localStorage');
  
  // Clear sessionStorage
  authCookieNames.forEach(name => {
    sessionStorage.removeItem(name);
  });
  console.log('[Auth Cleanup] Cleared sessionStorage');
  
  // Clear cookies with all possible attributes
  authCookieNames.forEach(name => {
    // Standard clearing
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
    
    // Clear with SameSite=Lax
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax`;
    
    // Clear with SameSite=None; Secure
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=None; Secure`;
    
    // Clear with domain variations
    const hostname = window.location.hostname;
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=${hostname}`;
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=.${hostname}`;
  });
  console.log('[Auth Cleanup] Cleared all auth cookies');
  
  // Clear any cached authentication state
  try {
    if (window.AuthHandler && typeof window.AuthHandler.logout === 'function') {
      window.AuthHandler.logout();
      console.log('[Auth Cleanup] Called AuthHandler logout');
    }
  } catch (e) {
    console.log('[Auth Cleanup] AuthHandler not available');
  }
  
  console.log('[Auth Cleanup] ✅ Cleanup complete!');
  console.log('[Auth Cleanup] Please refresh the page and log in again.');
  console.log('[Auth Cleanup] The new consolidated auth system should now work consistently.');
  
  // Optionally redirect to clear URL parameters
  if (window.location.search) {
    const cleanUrl = window.location.origin + window.location.pathname;
    console.log('[Auth Cleanup] Redirecting to clean URL...');
    setTimeout(() => {
      window.location.href = cleanUrl + '?authRequired=true&cleaned=true';
    }, 2000);
  }
})(); 