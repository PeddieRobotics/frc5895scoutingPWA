/**
 * This script runs on every page load to help with authentication issues
 * Particularly for preview deployments and cross-domain scenarios
 */
(function() {
  console.log('[Auth Fix] Initializing v2.1');
  
  // Constants for storage keys
  const AUTH_CREDENTIAL_KEY = 'auth_credentials';
  const AUTH_TOKEN_KEY = 'auth_token';
  
  function isPreviewEnvironment() {
    return window.location.hostname.includes('vercel') || 
           window.location.hostname.includes('preview');
  }
  
  // Function to get auth from storage
  function getAuthFromStorage() {
    return localStorage.getItem(AUTH_CREDENTIAL_KEY) || 
           sessionStorage.getItem(AUTH_CREDENTIAL_KEY) ||
           localStorage.getItem(AUTH_TOKEN_KEY);
  }
  
  // Function to check if auth cookies exist
  function hasCookiesSet() {
    const cookies = document.cookie.split(';');
    
    for (const cookie of cookies) {
      const [name] = cookie.trim().split('=');
      if (name === 'auth_credentials' || 
          name === 'auth_token' || 
          name === 'auth_session' || 
          name === 'auth_session_lax' || 
          name === 'auth_session_secure') {
        return true;
      }
    }
    
    return false;
  }
  
  function ensureAuthCookies() {
    // Check if we have credentials in storage but not in cookies
    const authFromStorage = getAuthFromStorage();
    const hasCookie = hasCookiesSet();
    
    // If we have auth in storage but not cookies, try to restore it
    if (authFromStorage && !hasCookie) {
      console.log('[Auth Fix] Detected auth in storage but not in cookies, restoring...');
      
      try {
        // Create a JSON string with auth data
        const authData = JSON.stringify({
          id: authFromStorage,
          timestamp: Date.now(),
          version: 2 // Version 2 of our auth format
        });
        
        // Encode for safe cookie storage
        const encodedAuthData = encodeURIComponent(authData);
        
        // Set cookies with different approaches for compatibility
        
        // Default cookie (works in most browsers)
        document.cookie = `auth_credentials=${encodedAuthData}; path=/; max-age=2592000`;
        
        // SameSite=Lax cookie (works for cross-page navigation)
        document.cookie = `auth_credentials=${encodedAuthData}; path=/; max-age=2592000; SameSite=Lax`;
        
        // For HTTPS/preview contexts, also set Secure+SameSite=None
        if (window.location.protocol === 'https:' || isPreviewEnvironment()) {
          document.cookie = `auth_credentials=${encodedAuthData}; path=/; max-age=2592000; SameSite=None; Secure`;
          console.log('[Auth Fix] Set Secure cookie for HTTPS/preview environment');
        }
        
        console.log('[Auth Fix] Restored auth cookies from storage');
        
        // Try to validate and refresh the session
        refreshSession(authFromStorage);
      } catch (e) {
        console.error('[Auth Fix] Error restoring auth cookies:', e);
      }
    } else if (!authFromStorage && hasCookie) {
      // We have cookies but no local storage - restore from cookies
      extractAuthFromCookies();
    }
  }
  
  // Extract auth data from cookies to localStorage
  function extractAuthFromCookies() {
    try {
      const cookies = document.cookie.split(';');
      
      for (const cookie of cookies) {
        const [name, value] = cookie.trim().split('=');
        
        if (name === 'auth_credentials' && value) {
          const decodedValue = decodeURIComponent(value);
          console.log('[Auth Fix] Restoring auth from cookies to localStorage');
          localStorage.setItem(AUTH_CREDENTIAL_KEY, decodedValue);
          sessionStorage.setItem(AUTH_CREDENTIAL_KEY, decodedValue);
          return true;
        } else if (name === 'auth_token' && value) {
          const decodedValue = decodeURIComponent(value);
          console.log('[Auth Fix] Restoring auth token from cookies to localStorage');
          localStorage.setItem(AUTH_TOKEN_KEY, decodedValue);
          return true;
        }
      }
    } catch (e) {
      console.error('[Auth Fix] Error extracting auth from cookies:', e);
    }
    
    return false;
  }
  
  // Validate and refresh the session if needed
  async function refreshSession(authData) {
    try {
      // Only do this in preview or production environments
      if (window.location.hostname === 'localhost') {
        console.log('[Auth Fix] Skipping session refresh on localhost');
        return;
      }
      
      console.log('[Auth Fix] Attempting to refresh session');
      
      // Add cache-busting parameters
      const timestamp = Date.now();
      const randomStr = Math.random().toString(36).substring(2);
      
      const response = await fetch(`/api/auth/validate?t=${timestamp}&r=${randomStr}`, {
        method: 'GET',
        headers: {
          'Authorization': `Basic ${authData}`,
          'X-Client-Refresh': 'true',
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          'Pragma': 'no-cache'
        },
        credentials: 'include',
        cache: 'no-store'
      });
      
      if (response.ok) {
        console.log('[Auth Fix] Session refreshed successfully');
      } else {
        console.log('[Auth Fix] Session refresh failed, status:', response.status);
      }
    } catch (e) {
      console.error('[Auth Fix] Error refreshing session:', e);
    }
  }
  
  // Run auth fix on page load and periodically
  function initialize() {
    // First run immediately
    ensureAuthCookies();
    
    // Then check periodically
    setInterval(ensureAuthCookies, 10000);
    
    // Also check when tab becomes visible
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        ensureAuthCookies();
      }
    });
    
    // Check when network status changes
    window.addEventListener('online', ensureAuthCookies);
  }
  
  // Initialize when DOM is loaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    initialize();
  }
})();

// Auth cookie fix script
// This can be loaded via script tag or run in the console
// It forcefully updates all auth cookies and localStorage items to use token version 2

(function fixAuthVersion() {
  // Define constants
  const AUTH_VERSION_KEY = 'auth_token_version';
  const TARGET_VERSION = '2';

  console.log('Auth Fix: Starting version update to', TARGET_VERSION);

  // Set version in localStorage
  localStorage.setItem(AUTH_VERSION_KEY, TARGET_VERSION);
  console.log('Auth Fix: Updated localStorage token version to', TARGET_VERSION);

  // Set version in sessionStorage
  sessionStorage.setItem(AUTH_VERSION_KEY, TARGET_VERSION);
  console.log('Auth Fix: Updated sessionStorage token version to', TARGET_VERSION);

  // Update all possible cookies
  document.cookie = `auth_token_version=${TARGET_VERSION}; path=/; max-age=2592000`;
  document.cookie = `auth_token_version=${TARGET_VERSION}; path=/; max-age=2592000; SameSite=Lax`;
  
  if (window.location.protocol === 'https:') {
    document.cookie = `auth_token_version=${TARGET_VERSION}; path=/; max-age=2592000; SameSite=None; Secure`;
  }
  
  console.log('Auth Fix: Updated auth_token_version cookies');

  // Parse auth_session cookies and update their version
  try {
    const cookies = document.cookie.split(';');
    let authSessionCookies = [];
    
    // Find auth session cookies
    cookies.forEach(cookie => {
      const trimmed = cookie.trim();
      if (trimmed.startsWith('auth_session=')) {
        authSessionCookies.push({
          name: 'auth_session',
          value: trimmed.substring('auth_session='.length)
        });
      } else if (trimmed.startsWith('auth_session_lax=')) {
        authSessionCookies.push({
          name: 'auth_session_lax',
          value: trimmed.substring('auth_session_lax='.length)
        });
      } else if (trimmed.startsWith('auth_session_secure=')) {
        authSessionCookies.push({
          name: 'auth_session_secure',
          value: trimmed.substring('auth_session_secure='.length)
        });
      }
    });
    
    console.log('Auth Fix: Found', authSessionCookies.length, 'auth session cookies');
    
    // Process each auth session cookie
    authSessionCookies.forEach(cookie => {
      try {
        // Try to decode and parse as JSON
        let decodedValue = decodeURIComponent(cookie.value);
        let tokenData = JSON.parse(decodedValue);
        
        // Update version
        if (tokenData.v !== TARGET_VERSION) {
          console.log(`Auth Fix: Updating ${cookie.name} version from ${tokenData.v || 'undefined'} to ${TARGET_VERSION}`);
          tokenData.v = TARGET_VERSION;
          
          // Save back to cookie
          const newValue = encodeURIComponent(JSON.stringify(tokenData));
          
          document.cookie = `${cookie.name}=${newValue}; path=/; max-age=2592000`;
          document.cookie = `${cookie.name}=${newValue}; path=/; max-age=2592000; SameSite=Lax`;
          
          if (window.location.protocol === 'https:') {
            document.cookie = `${cookie.name}=${newValue}; path=/; max-age=2592000; SameSite=None; Secure`;
          }
        }
      } catch (e) {
        console.error(`Auth Fix: Error processing ${cookie.name}:`, e);
      }
    });
  } catch (e) {
    console.error('Auth Fix: Error processing cookies:', e);
  }

  // Check for a raw session ID in cookies and force it to use version 2
  try {
    // If we find a session ID in local/sessionStorage, ensure it has version 2
    const authCredentials = localStorage.getItem('auth_credentials') || 
                           sessionStorage.getItem('auth_credentials');
                           
    if (authCredentials) {
      console.log('Auth Fix: Found auth_credentials, ensuring version 2 is used with it');
      
      // Store version 2 in all storages
      localStorage.setItem(AUTH_VERSION_KEY, TARGET_VERSION);
      sessionStorage.setItem(AUTH_VERSION_KEY, TARGET_VERSION);
      
      // Set cookies with version
      document.cookie = `auth_token_version=${TARGET_VERSION}; path=/; max-age=2592000`;
      document.cookie = `auth_token_version=${TARGET_VERSION}; path=/; max-age=2592000; SameSite=Lax`;
      
      if (window.location.protocol === 'https:') {
        document.cookie = `auth_token_version=${TARGET_VERSION}; path=/; max-age=2592000; SameSite=None; Secure`;
      }
    }
  } catch (e) {
    console.error('Auth Fix: Error processing auth_credentials:', e);
  }
  
  console.log('Auth Fix: Version update complete');
  console.log('Auth Fix: Please hard refresh the page (Ctrl+Shift+R or Cmd+Shift+R) to load updated scripts');
  
  return {
    reset: function() {
      // Function to completely reset auth
      // Clear localStorage
      localStorage.removeItem('auth_credentials');
      localStorage.removeItem('auth_token');
      localStorage.removeItem('auth_token_expiry');
      localStorage.removeItem('auth_token_version');
      localStorage.removeItem('auth_session');
      
      // Clear sessionStorage
      sessionStorage.removeItem('auth_credentials');
      sessionStorage.removeItem('auth_token');
      sessionStorage.removeItem('auth_token_expiry');
      sessionStorage.removeItem('auth_token_version');
      sessionStorage.removeItem('auth_session');
      
      // Clear all possible auth cookies with all variations
      // Standard cookies
      document.cookie = `auth_credentials=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
      document.cookie = `auth_token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
      document.cookie = `auth_token_expiry=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
      document.cookie = `auth_token_version=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
      document.cookie = `auth_session=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
      document.cookie = `auth_session_lax=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
      document.cookie = `auth_session_secure=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
      
      // SameSite variations
      document.cookie = `auth_token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax`;
      document.cookie = `auth_token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=None; Secure`;
      document.cookie = `auth_session=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax`;
      document.cookie = `auth_session=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=None; Secure`;
      document.cookie = `auth_session_lax=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax`;
      document.cookie = `auth_session_secure=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=None; Secure`;
      
      console.log('Auth Fix: Complete auth reset performed');
      console.log('Auth Fix: Please reload the page to login again');
      
      return 'Auth reset complete';
    },
    forceVersion: function(version) {
      localStorage.setItem(AUTH_VERSION_KEY, version);
      sessionStorage.setItem(AUTH_VERSION_KEY, version);
      document.cookie = `auth_token_version=${version}; path=/; max-age=2592000`;
      
      console.log(`Auth Fix: Forced version to ${version}`);
      return `Version set to ${version}`;
    }
  };
})();

// Fix Auth Handler
// This script attempts to load auth-handler.js with error handling
// It prevents recursive loading and redirect loops

(function() {
  console.log('Auth Fix: Initializing fix for auth-handler.js');
  
  // Global flag to prevent infinite recursion
  window.__authFixAttempted = true;
  
  // Initial cleanup of any malformed cookies
  function cleanupMalformedCookies() {
    console.log('Auth Fix: Checking for malformed auth cookies');
    const cookies = document.cookie.split(';');
    
    for (const cookie of cookies) {
      const trimmed = cookie.trim();
      const name = trimmed.split('=')[0];
      
      // If it's an auth cookie, check if it's properly formatted
      if (name.includes('auth_') || name.includes('session')) {
        try {
          const value = trimmed.split('=')[1];
          if (name === 'auth_session' || name === 'auth_session_lax' || name === 'auth_session_secure') {
            try {
              // Try to parse as JSON
              const decoded = decodeURIComponent(value);
              JSON.parse(decoded);
              // If it parses correctly, it's probably valid
            } catch (e) {
              // If it doesn't parse as JSON, it's probably a legacy cookie
              console.log(`Auth Fix: Clearing malformed auth cookie: ${name}`);
              document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
              document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax`;
              document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=None; Secure`;
            }
          }
        } catch (e) {
          // Any error probably means the cookie is malformed
          console.log(`Auth Fix: Clearing potentially malformed cookie: ${name}`);
          document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
        }
      }
    }
  }
  
  // Run initial cleanup
  cleanupMalformedCookies();
  
  function loadAuthScript(retry = 0) {
    if (retry > 3) {
      console.error('Auth Fix: Failed to load auth-handler.js after multiple attempts');
      return;
    }
    
    const script = document.createElement('script');
    script.src = '/auth-handler.js?nocache=' + Date.now();
    script.onerror = function(error) {
      console.error('Auth Fix: Error loading auth-handler.js', error);
      setTimeout(() => loadAuthScript(retry + 1), 1000); // Retry after 1 second
    };
    
    // Handle syntax errors by setting a global error handler
    const originalOnError = window.onerror;
    window.onerror = function(message, source, lineno, colno, error) {
      if (source && source.includes('auth-handler.js')) {
        console.error('Auth Fix: Syntax error in auth-handler.js:', message);
        // Implement minimal auth fallback
        createFallbackAuth();
        // Restore original error handler
        window.onerror = originalOnError;
        return true; // Prevent default error handling
      }
      return originalOnError ? originalOnError(message, source, lineno, colno, error) : false;
    };
    
    document.head.appendChild(script);
  }
  
  function createFallbackAuth() {
    console.log('Auth Fix: Creating fallback auth handler');
    
    // Function to clear all auth data thoroughly
    function clearAllAuthData() {
      // Clear localStorage
      localStorage.removeItem('auth_credentials');
      localStorage.removeItem('auth_token');
      localStorage.removeItem('auth_token_expiry');
      localStorage.removeItem('auth_token_version');
      localStorage.removeItem('auth_session');
      
      // Clear sessionStorage
      sessionStorage.removeItem('auth_credentials');
      sessionStorage.removeItem('auth_token');
      sessionStorage.removeItem('auth_token_expiry');
      sessionStorage.removeItem('auth_token_version');
      sessionStorage.removeItem('auth_session');
      
      // Clear all possible auth cookies
      document.cookie = `auth_credentials=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
      document.cookie = `auth_token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
      document.cookie = `auth_token_expiry=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
      document.cookie = `auth_token_version=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
      document.cookie = `auth_session=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
      document.cookie = `auth_session_lax=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
      document.cookie = `auth_session_secure=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
      
      // SameSite variations
      document.cookie = `auth_token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax`;
      document.cookie = `auth_token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=None; Secure`;
      document.cookie = `auth_session=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax`;
      document.cookie = `auth_session=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=None; Secure`;
      document.cookie = `auth_session_lax=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax`;
      document.cookie = `auth_session_secure=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=None; Secure`;
      
      console.log('Auth Fix: Fallback auth handler cleared all auth data');
    }
    
    // Create minimal AuthHandler API
    window.AuthHandler = {
      isAuthenticated: () => false,
      getToken: () => null,
      getTokenVersion: () => '2',
      setToken: () => console.log('Auth Fix: Fallback setToken called'),
      logout: () => {
        clearAllAuthData();
        window.location.href = '/?logout=true';
      },
      validateToken: () => false,
      showLoginDialog: () => {
        clearAllAuthData();
        window.location.href = '/?authRequired=true&error=Authentication%20is%20required';
      },
      clearAllAuth: clearAllAuthData
    };
    
    // Add a custom event to signal fallback was used
    window.dispatchEvent(new CustomEvent('auth:fallback-loaded'));
  }
  
  // Try to load auth handler
  loadAuthScript();
  
  // Set a timeout to create fallback if auth handler doesn't load
  setTimeout(() => {
    if (!window.AuthHandler) {
      console.log('Auth Fix: Auth handler not loaded after timeout, creating fallback');
      createFallbackAuth();
    }
  }, 5000);
})(); 