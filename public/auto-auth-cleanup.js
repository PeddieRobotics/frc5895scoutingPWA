/**
 * Automatic Authentication Cleanup
 * Runs on every page load to detect and fix conflicting auth cookies
 * Designed for non-technical users - works silently in the background
 */

(function() {
  // CRITICAL: This script is temporarily disabled because it's incompatible with HttpOnly session cookies.
  // The script cannot see HttpOnly cookies from JavaScript, so it incorrectly thinks there's a mismatch
  // and deletes the very session cookies that were just set, causing redirect loops and JSON parse errors.
  // 
  // The server-side middleware is now the single source of truth for authentication validation.
  console.log('[Auto Auth Cleanup] Script disabled - HttpOnly cookies are handled server-side');
  return;
  
  console.log('[Auto Auth Cleanup] Checking authentication state...');
  
  // Disable notifications for normal page navigation (only show for real problems)
  const SHOW_NOTIFICATIONS = window.location.search.includes('authRequired') || 
                             window.location.search.includes('cleaned') ||
                             window.location.pathname.includes('reset-auth');
  
  // Function to get all cookies as an object
  function getAllCookies() {
    const cookies = {};
    document.cookie.split(';').forEach(cookie => {
      const [name, value] = cookie.trim().split('=').map(part => part.trim());
      if (name && value) {
        cookies[name] = value;
      }
    });
    return cookies;
  }
  
  // Function to detect if cookies are in a conflicting state
  function detectConflictingCookies() {
    const cookies = getAllCookies();
    const issues = [];
    
    // Check for multiple auth cookie types (indicates conflict)
    const authCookieTypes = [
      'auth_credentials',
      'auth_token', 
      'auth_session'
    ];
    
    const presentTypes = authCookieTypes.filter(type => cookies[type]);
    
    if (presentTypes.length > 1) {
      issues.push('multiple_auth_types');
      console.log('[Auto Auth Cleanup] ⚠️ Multiple auth cookie types detected:', presentTypes);
    }
    
    // Check for malformed session cookies
    ['auth_session', 'auth_session_lax', 'auth_session_secure'].forEach(cookieName => {
      if (cookies[cookieName]) {
        try {
          const decoded = decodeURIComponent(cookies[cookieName]);
          const parsed = JSON.parse(decoded);
          
          // Check if it has required fields
          if (!parsed.id || !parsed.team || !parsed.v) {
            issues.push('malformed_session_cookie');
            console.log('[Auto Auth Cleanup] ⚠️ Malformed session cookie:', cookieName);
          }
        } catch (e) {
          issues.push('invalid_session_format');
          console.log('[Auto Auth Cleanup] ⚠️ Invalid session cookie format:', cookieName);
        }
      }
    });
    
    // Check for auth data in storage but no proper session cookies
    const hasStorageAuth = localStorage.getItem('auth_credentials') || sessionStorage.getItem('auth_credentials');
    const hasValidSessionCookie = cookies['auth_session'] || cookies['auth_session_lax'] || cookies['auth_session_secure'];
    
    // Only flag this as an issue if we're on a page that requires auth and user seems to expect to be logged in
    const isAuthRequiredPage = window.location.search.includes('authRequired') || 
                              window.location.pathname !== '/';
    
    if (hasStorageAuth && !hasValidSessionCookie && isAuthRequiredPage) {
      issues.push('storage_cookie_mismatch');
      console.log('[Auto Auth Cleanup] ⚠️ Auth in storage but no session cookies on auth-required page');
    }
    
    return issues;
  }
  
  // Function to clean up conflicting cookies
  function cleanupConflictingCookies() {
    console.log('[Auto Auth Cleanup] 🧹 Cleaning up conflicting authentication data...');
    
    // List of all possible conflicting cookie names
    const conflictingCookies = [
      'auth_credentials',
      'auth_token',
      'auth_token_expiry',
      'auth_token_version'
    ];
    
    // Clear conflicting cookies (keep session cookies)
    conflictingCookies.forEach(name => {
      // Standard clearing
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
      
      // Clear with SameSite=Lax
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax`;
      
      // Clear with SameSite=None; Secure
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=None; Secure`;
    });
    
    console.log('[Auto Auth Cleanup] ✅ Conflicting cookies cleared');
  }
  
  // Function to handle authentication issues - NO MORE AUTO-SESSION CREATION
  function handleAuthIssues() {
    console.log('[Auto Auth Cleanup] 🚫 Authentication issues detected - clearing invalid auth data');
    
    // Check if the current page indicates specific auth issues
    const urlParams = new URLSearchParams(window.location.search);
    const sessionRevoked = urlParams.get('sessionRevoked') === 'true';
    const tokenInvalidated = urlParams.get('tokenInvalidated') === 'true';
    const dbError = urlParams.get('dbError') === 'true';
    
    if (sessionRevoked || tokenInvalidated) {
      console.log('[Auto Auth Cleanup] 🚫 Session was explicitly revoked/invalidated by admin');
      
      // Clear stored credentials since the session was revoked
      localStorage.removeItem('auth_credentials');
      sessionStorage.removeItem('auth_credentials');
      
      showCleanupNotification('Your session was revoked. Please log in again.', 'warning', true);
      return;
    }
    
    if (dbError) {
      console.log('[Auto Auth Cleanup] 🚫 Database error detected');
      showCleanupNotification('Authentication system temporarily unavailable. Please try again.', 'warning', true);
      return;
    }
    
    // For any other auth issues, just clear invalid data and ask user to log in
    console.log('[Auto Auth Cleanup] 🧹 Clearing potentially invalid auth data');
    
    // Clear invalid session cookies but keep credentials for manual login
    document.cookie = 'auth_session=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
    document.cookie = 'auth_session_lax=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax';
    document.cookie = 'auth_session_secure=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=None; Secure';
    
    showCleanupNotification('Please log in to continue', 'info');
  }
  
  // Function to show a subtle notification to the user (only for significant issues)
  function showCleanupNotification(message, type = 'info', force = false) {
    // Only show notifications when explicitly enabled or forced
    if (!SHOW_NOTIFICATIONS && !force) {
      console.log('[Auto Auth Cleanup] Notifications disabled for normal navigation:', message);
      return;
    }
    
    // Only show notifications for major issues or when forced
    if (!force && type === 'success' && !message.includes('refreshed')) {
      console.log('[Auto Auth Cleanup] Skipping notification (minor cleanup):', message);
      return;
    }
    
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 12px 20px;
      border-radius: 6px;
      color: white;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      z-index: 10000;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      max-width: 300px;
      opacity: 0;
      transition: opacity 0.3s ease;
      ${type === 'success' ? 'background-color: #10b981;' : 
        type === 'warning' ? 'background-color: #f59e0b;' : 
        'background-color: #3b82f6;'}
    `;
    
    notification.textContent = message;
    document.body.appendChild(notification);
    
    // Fade in
    setTimeout(() => {
      notification.style.opacity = '1';
    }, 100);
    
    // Fade out and remove
    setTimeout(() => {
      notification.style.opacity = '0';
      setTimeout(() => {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification);
        }
      }, 300);
    }, 3000);
  }
  
  // Main cleanup logic
  function runAutoCleanup() {
    // Prevent double-running from multiple scripts
    if (window.authCleanupRunning) {
      console.log('[Auto Auth Cleanup] Already running, skipping...');
      return;
    }
    window.authCleanupRunning = true;
    
    // Check if we're on a page that indicates session revocation or auth errors
    const urlParams = new URLSearchParams(window.location.search);
    const sessionRevoked = urlParams.get('sessionRevoked') === 'true';
    const tokenInvalidated = urlParams.get('tokenInvalidated') === 'true';
    const dbError = urlParams.get('dbError') === 'true';
    
    if (sessionRevoked || tokenInvalidated) {
      console.log('[Auto Auth Cleanup] 🚫 Session revocation detected - clearing all auth data');
      
      // Clear all authentication data
      localStorage.removeItem('auth_credentials');
      sessionStorage.removeItem('auth_credentials');
      cleanupConflictingCookies();
      
      // Clear session cookies too
      document.cookie = 'auth_session=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
      document.cookie = 'auth_session_lax=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax';
      document.cookie = 'auth_session_secure=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=None; Secure';
      
      window.authCleanupRunning = false;
      return;
    }
    
    if (dbError) {
      console.log('[Auto Auth Cleanup] 🚫 Database error detected - not running cleanup');
      window.authCleanupRunning = false;
      return;
    }
    
    const issues = detectConflictingCookies();
    
    if (issues.length === 0) {
      console.log('[Auto Auth Cleanup] ✅ Authentication state looks good');
      window.authCleanupRunning = false;
      return;
    }
    
    console.log('[Auto Auth Cleanup] 🔧 Issues detected, running automatic cleanup:', issues);
    
    // Only show notifications for significant issues
    const hasSignificantIssues = issues.includes('multiple_auth_types') || 
                                 issues.includes('malformed_session_cookie') ||
                                 issues.includes('invalid_session_format');
    
    // Clean up conflicting cookies
    cleanupConflictingCookies();
    
    // If we have any auth issues, just clean up and ask user to log in manually
    if (issues.includes('storage_cookie_mismatch') || hasSignificantIssues) {
      handleAuthIssues();
    }
    
    window.authCleanupRunning = false;
  }
  
  // Throttle cleanup to prevent excessive runs
  let lastCleanupTime = 0;
  const CLEANUP_THROTTLE = 5000; // 5 seconds minimum between cleanups
  
  function throttledCleanup() {
    const now = Date.now();
    if (now - lastCleanupTime < CLEANUP_THROTTLE) {
      console.log('[Auto Auth Cleanup] Throttled - too soon since last cleanup');
      return;
    }
    lastCleanupTime = now;
    runAutoCleanup();
  }
  
  // Run cleanup when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', throttledCleanup);
  } else {
    // DOM is already ready, but wait a moment to avoid conflicts
    setTimeout(throttledCleanup, 1000);
  }
  
  // Also run cleanup when the page becomes visible (handles tab switching)
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      setTimeout(throttledCleanup, 1000); // Longer delay and throttled
    }
  });
  
  console.log('[Auto Auth Cleanup] 🚀 Auto cleanup system initialized');
})(); 