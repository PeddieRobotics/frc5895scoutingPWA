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