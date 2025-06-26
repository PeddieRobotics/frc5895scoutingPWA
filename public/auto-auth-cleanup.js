/**
 * Automatic Authentication Cleanup
 * Runs on every page load to detect and fix conflicting auth cookies
 * Designed for non-technical users - works silently in the background
 */

(function() {
  console.log('[Auto Auth Cleanup] Checking authentication state...');
  
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
    
    if (hasStorageAuth && !hasValidSessionCookie) {
      issues.push('storage_cookie_mismatch');
      console.log('[Auto Auth Cleanup] ⚠️ Auth in storage but no session cookies');
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
  
  // Function to trigger a fresh authentication
  function triggerFreshAuth() {
    console.log('[Auto Auth Cleanup] 🔄 Triggering fresh authentication...');
    
    // Check if we have credentials in storage
    const credentials = localStorage.getItem('auth_credentials') || sessionStorage.getItem('auth_credentials');
    
    if (credentials) {
      // Try to create a fresh session with existing credentials
      fetch('/api/auth/session', {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Content-Type': 'application/json',
          'X-Auto-Cleanup': 'true'
        },
        credentials: 'include'
      })
      .then(response => response.json())
      .then(data => {
        if (data.success) {
          console.log('[Auto Auth Cleanup] ✅ Fresh session created successfully');
          
          // Show a subtle notification to the user
          showCleanupNotification('Authentication refreshed successfully!', 'success');
          
          // Reload the page to ensure everything is fresh (but only if needed)
          if (window.location.search.includes('authRequired')) {
            setTimeout(() => {
              window.location.href = window.location.pathname;
            }, 1500);
          }
        } else {
          console.log('[Auto Auth Cleanup] ❌ Fresh session creation failed');
          showCleanupNotification('Please log in again', 'info');
        }
      })
      .catch(error => {
        console.log('[Auto Auth Cleanup] ❌ Fresh session request failed:', error);
        showCleanupNotification('Please log in again', 'info');
      });
    } else {
      console.log('[Auto Auth Cleanup] No stored credentials found');
    }
  }
  
  // Function to show a subtle notification to the user
  function showCleanupNotification(message, type = 'info') {
    // Only show notifications if there's an actual issue being fixed
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
    const issues = detectConflictingCookies();
    
    if (issues.length === 0) {
      console.log('[Auto Auth Cleanup] ✅ Authentication state looks good');
      return;
    }
    
    console.log('[Auto Auth Cleanup] 🔧 Issues detected, running automatic cleanup:', issues);
    
    // Clean up conflicting cookies
    cleanupConflictingCookies();
    
    // If we have storage/cookie mismatches, try to create a fresh session
    if (issues.includes('storage_cookie_mismatch')) {
      triggerFreshAuth();
    }
    
    // Show a subtle notification that cleanup happened
    showCleanupNotification('Authentication system optimized', 'success');
  }
  
  // Run cleanup when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runAutoCleanup);
  } else {
    // DOM is already ready
    runAutoCleanup();
  }
  
  // Also run cleanup when the page becomes visible (handles tab switching)
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      setTimeout(runAutoCleanup, 500); // Small delay to ensure page is fully loaded
    }
  });
  
  console.log('[Auto Auth Cleanup] 🚀 Auto cleanup system initialized');
})(); 