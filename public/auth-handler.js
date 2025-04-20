// Universal Authentication Handler
// This script provides consistent authentication across all devices
// including iOS where cookie-based approaches often fail

(function() {
  console.log('Auth Handler: Initializing v2.0');
  
  // Auth token storage key
  const AUTH_TOKEN_KEY = 'auth_token';
  const AUTH_EXPIRY_KEY = 'auth_token_expiry';
  const AUTH_VERSION_KEY = 'auth_token_version';
  
  // Auth validation interval (in ms) - check every 10 minutes (increased from 5 min)
  const VALIDATION_INTERVAL = 10 * 60 * 1000;
  
  // Delay for first validation to prevent immediate loops
  const INITIAL_VALIDATION_DELAY = 5000; // 5 seconds
  
  // Add validation lock to prevent concurrent validation attempts
  let validationInProgress = false;
  let validationLockTimeout = null;
  
  // Helpers to manage auth state
  function getStoredToken() {
    return localStorage.getItem(AUTH_TOKEN_KEY);
  }
  
  function getTokenExpiry() {
    const expiry = localStorage.getItem(AUTH_EXPIRY_KEY);
    return expiry ? parseInt(expiry, 10) : null;
  }
  
  function getTokenVersion() {
    // Always default to version 2 if not set
    return localStorage.getItem(AUTH_VERSION_KEY) || '2';
  }
  
  function setStoredToken(token, expiry, version) {
    if (token) {
      localStorage.setItem(AUTH_TOKEN_KEY, token);
      
      if (expiry) {
        localStorage.setItem(AUTH_EXPIRY_KEY, expiry.toString());
      }
      
      // Always store token version, default to '2'
      localStorage.setItem(AUTH_VERSION_KEY, version || '2');
      
      console.log(`Auth Handler: Saved auth token to localStorage with version ${version || '2'}`);
    } else {
      clearStoredToken();
    }
  }
  
  function clearStoredToken() {
    // Clear localStorage items
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(AUTH_EXPIRY_KEY);
    localStorage.removeItem(AUTH_VERSION_KEY);
    
    // Clear any legacy keys that might exist
    localStorage.removeItem('auth_credentials');
    localStorage.removeItem('auth_session');
    
    // Clear sessionStorage items
    sessionStorage.removeItem(AUTH_TOKEN_KEY);
    sessionStorage.removeItem(AUTH_EXPIRY_KEY);
    sessionStorage.removeItem(AUTH_VERSION_KEY);
    sessionStorage.removeItem('auth_credentials');
    sessionStorage.removeItem('auth_session');
    
    // Clear all possible auth cookies with different paths and domains
    // Standard cookies
    document.cookie = `auth_token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
    document.cookie = `auth_token_expiry=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
    document.cookie = `auth_token_version=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
    document.cookie = `auth_session=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
    document.cookie = `auth_session_lax=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
    document.cookie = `auth_session_secure=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
    document.cookie = `auth_credentials=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
    
    // For any cookie that might be set with specific SameSite attributes
    document.cookie = `auth_token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax`;
    document.cookie = `auth_token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=None; Secure`;
    document.cookie = `auth_session=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax`;
    document.cookie = `auth_session=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=None; Secure`;
    document.cookie = `auth_session_lax=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax`;
    document.cookie = `auth_session_secure=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=None; Secure`;
    
    console.log('Auth Handler: Cleared all auth tokens and cookies');
  }
  
  // Add auth token to all fetch requests
  const originalFetch = window.fetch;
  window.fetch = function(url, options = {}) {
    const token = getStoredToken();
    if (token) {
      if (!options.headers) {
        options.headers = {};
      }
      
      // Ensure url is a string to avoid TypeError
      const urlStr = typeof url === 'string' ? url : url.toString();
      
      // Only add the token if it's a same-origin request
      const isSameOrigin = urlStr.startsWith('/') || urlStr.startsWith(window.location.origin);
      if (isSameOrigin && !options.headers['Authorization']) {
        options.headers['Authorization'] = `Bearer ${token}`;
        
        // Add version header
        const tokenVersion = getTokenVersion();
        options.headers['X-Token-Version'] = tokenVersion;
        
        // For validation endpoints, add client-validating header to prevent middleware validation
        if (urlStr.includes('/api/auth/validate') || urlStr.includes('/api/auth/validate-token')) {
          options.headers['X-Client-Validating'] = 'true';
        }
        
        // Add version to URL
        if (!urlStr.includes('v=')) {
          const separator = urlStr.includes('?') ? '&' : '?';
          url = `${urlStr}${separator}v=${tokenVersion}`;
        } else {
          // Make sure url gets updated if we didn't modify it
          url = urlStr;
        }
        
        // Special handling for validate-token endpoint
        if (urlStr.includes('/api/auth/validate-token')) {
          console.log('Auth Handler: Detected token validation request, ensuring version=2');
          
          // If this is a POST to validate-token, override the body with version=2
          if (options.method === 'POST' && options.body) {
            try {
              const bodyData = JSON.parse(options.body);
              bodyData.version = '2'; // Force version 2
              options.body = JSON.stringify(bodyData);
            } catch (e) {
              console.error('Auth Handler: Failed to update validate-token request body:', e);
            }
          }
        }
      }
    }
    
    return originalFetch.apply(this, [url, options]).then(response => {
      // Check for version header and update if needed
      const newVersion = response.headers.get('X-Token-Version');
      if (newVersion) {
        console.log(`Auth Handler: Updating token version from header: ${newVersion}`);
        localStorage.setItem(AUTH_VERSION_KEY, newVersion);
        sessionStorage.setItem(AUTH_VERSION_KEY, newVersion);
      }
      
      // Check for auth token header
      if (response.headers.get('X-Auth-Token') === 'enabled') {
        // We need to clone the response to read its JSON
        // This won't affect the original response
        response.clone().json().then(data => {
          if (data.token) {
            setStoredToken(data.token, data.expires, data.tokenVersion || '2');
          }
          
          // Also check for tokenVersion in response body
          if (data.tokenVersion) {
            console.log(`Auth Handler: Updating token version from response: ${data.tokenVersion}`);
            localStorage.setItem(AUTH_VERSION_KEY, data.tokenVersion);
            sessionStorage.setItem(AUTH_VERSION_KEY, data.tokenVersion);
          }
        }).catch(err => {
          console.error('Failed to parse auth response:', err);
        });
      }
      
      // Handle unauthorized responses
      if (response.status === 401) {
        // Check if this is an admin page authentication check that should be handled locally
        const isAdminCheck = options.headers && options.headers['X-Admin-Auth-Check'] === 'true';
        
        if (isAdminCheck) {
          console.log('Auth Handler: Skipping redirect for admin auth check');
          return response;
        }
        
        // Unauthorized response may mean our token is invalid
        console.log('Auth Handler: Received 401 Unauthorized, showing login dialog');
        
        // Clear any stored token since it's invalid
        clearStoredToken();
        
        // Show login dialog - different approaches based on context:
        
        // 1. If we're on the main page, we can directly show the dialog by setting URL params
        if (window.location.pathname === '/' || window.location.pathname === '') {
          const urlParams = new URLSearchParams(window.location.search);
          urlParams.set('authRequired', 'true');
          
          // Add token version parameter
          urlParams.set('tokenVersion', '2');
          
          const newUrl = window.location.pathname + '?' + urlParams.toString();
          window.history.pushState(null, '', newUrl);
          
          // Trigger the login dialog by dispatching a custom event
          window.dispatchEvent(new CustomEvent('auth:required', {
            detail: { 
              message: 'Your session has expired or is invalid',
              tokenVersion: '2'
            }
          }));
        } 
        // 2. Otherwise, redirect to the main page with auth dialog flags
        else {
          const params = new URLSearchParams();
          params.set('authRequired', 'true');
          params.set('redirect', window.location.pathname + window.location.search);
          params.set('tokenVersion', '2'); // Add version parameter
          window.location.href = '/?' + params.toString();
        }
      }
      
      return response;
    });
  };
  
  // Validate token against server
  async function validateToken(forceLogout = false) {
    const token = getStoredToken();
    if (!token) return false;
    
    // Prevent concurrent validation attempts
    if (validationInProgress) {
      console.log('Auth Handler: Validation already in progress, skipping');
      return true; // Assume valid to prevent loops
    }
    
    try {
      validationInProgress = true;
      
      // Clear any existing lock timeout
      if (validationLockTimeout) {
        clearTimeout(validationLockTimeout);
      }
      
      // Add a safety timeout to release the lock after 10 seconds
      validationLockTimeout = setTimeout(() => {
        console.log('Auth Handler: Validation lock timeout exceeded, releasing lock');
        validationInProgress = false;
      }, 10000);
      
      // Check if token is expired locally first
      const expiry = getTokenExpiry();
      if (expiry && Date.now() > expiry) {
        console.log('Auth Handler: Token expired locally');
        if (forceLogout) {
          logout();
        }
        return false;
      }
      
      // Get current token version
      const tokenVersion = getTokenVersion();
      console.log(`Auth Handler: Validating token with version ${tokenVersion}`);
      
      // Add timestamp to prevent caching
      const timestamp = Date.now();
      
      // Validate with server
      const response = await fetch(`/api/auth/validate?t=${timestamp}&v=${tokenVersion}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-Token-Version': tokenVersion,
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          'Pragma': 'no-cache'
        },
        cache: 'no-store',
        credentials: 'include' // Ensure cookies are sent
      });
      
      // Update token version if provided in response headers
      const newVersion = response.headers.get('X-Token-Version');
      if (newVersion) {
        console.log(`Auth Handler: Updating token version from validate response header: ${newVersion}`);
        localStorage.setItem(AUTH_VERSION_KEY, newVersion);
        sessionStorage.setItem(AUTH_VERSION_KEY, newVersion);
      }
      
      if (response.status === 200) {
        const data = await response.json();
        
        // Update token version if provided in response body
        if (data.tokenVersion) {
          console.log(`Auth Handler: Updating token version from validate data: ${data.tokenVersion}`);
          localStorage.setItem(AUTH_VERSION_KEY, data.tokenVersion);
          sessionStorage.setItem(AUTH_VERSION_KEY, data.tokenVersion);
        }
        
        // Ensure client-side storage is updated with any cookies from server
        try {
          // Parse cookie to extract auth_token if it exists
          document.cookie.split(';').forEach(cookie => {
            const [name, value] = cookie.trim().split('=');
            if (name === 'auth_token' && value) {
              console.log('Auth Handler: Found auth_token in cookies, updating localStorage');
              localStorage.setItem(AUTH_TOKEN_KEY, decodeURIComponent(value));
            }
          });
        } catch (e) {
          console.error('Auth Handler: Error syncing cookies with localStorage:', e);
        }
        
        return data.valid === true;
      } else {
        console.log('Auth Handler: Server rejected token');
        if (forceLogout && response.status === 401) {
          logout();
        } else if (response.status >= 500) {
          // Don't logout on server errors
          console.log('Auth Handler: Server error during validation, assuming token is valid');
          return true;
        }
        return false;
      }
    } catch (error) {
      console.error('Auth Handler: Validation error', error);
      // Don't logout on network errors - assume token is valid for now
      return true;
    } finally {
      // Always clear the lock and timeout
      clearTimeout(validationLockTimeout);
      validationInProgress = false;
    }
  }
  
  // Perform logout
  async function logout() {
    const token = getStoredToken();
    if (!token) return;
    
    try {
      // Get current token version
      const tokenVersion = getTokenVersion();
      
      await fetch('/api/auth/session', {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-Token-Version': tokenVersion
        }
      });
    } catch (error) {
      console.error('Auth Handler: Logout error', error);
    }
    
    clearStoredToken();
    
    // Reload the page to reset the app state
    window.location.reload();
  }
  
  // Check for token in URL parameters (for cross-page transfers)
  function checkUrlForToken() {
    const urlParams = new URLSearchParams(window.location.search);
    const urlToken = urlParams.get('token');
    const tokenVersion = urlParams.get('tokenVersion') || '2';
    
    if (urlToken) {
      try {
        // Verify it's a valid JSON token
        JSON.parse(urlToken);
        setStoredToken(urlToken, null, tokenVersion);
        
        // Clean URL by removing token parameter
        urlParams.delete('token');
        urlParams.delete('tokenVersion');
        const newUrl = window.location.pathname + 
                      (urlParams.toString() ? '?' + urlParams.toString() : '');
        window.history.replaceState({}, document.title, newUrl);
      } catch (e) {
        console.error('Auth Handler: Invalid token in URL', e);
      }
    } else if (urlParams.get('tokenVersion')) {
      // If only version is provided, update stored version
      localStorage.setItem(AUTH_VERSION_KEY, tokenVersion);
      sessionStorage.setItem(AUTH_VERSION_KEY, tokenVersion);
      
      // Clean URL
      urlParams.delete('tokenVersion');
      const newUrl = window.location.pathname + 
                    (urlParams.toString() ? '?' + urlParams.toString() : '');
      window.history.replaceState({}, document.title, newUrl);
    }
  }
  
  // Check for signed out state
  function checkForSignOutRequest() {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('logout') === 'true') {
      logout();
      
      // Clean URL by removing logout parameter
      urlParams.delete('logout');
      const newUrl = window.location.pathname + 
                    (urlParams.toString() ? '?' + urlParams.toString() : '');
      window.history.replaceState({}, document.title, newUrl);
    }
  }
  
  // Listen for auth:required events that may be triggered elsewhere
  function setupAuthEventListeners() {
    window.addEventListener('auth:required', (event) => {
      console.log('Auth Handler: Received auth:required event');
      
      // If we're not already on the home page, redirect there with auth dialog flags
      if (window.location.pathname !== '/' && window.location.pathname !== '') {
        const params = new URLSearchParams();
        params.set('authRequired', 'true');
        params.set('redirect', window.location.pathname + window.location.search);
        params.set('tokenVersion', '2'); // Always use version 2
        
        if (event.detail && event.detail.message) {
          params.set('error', event.detail.message);
        }
        window.location.href = '/?' + params.toString();
      }
    });
  }
  
  // Periodic validation to ensure token is still valid
  function startValidationInterval() {
    // Delay the first validation to prevent immediate loops after page load
    // Use a longer initial delay to ensure the page has fully loaded
    console.log(`Auth Handler: Scheduling initial validation in ${INITIAL_VALIDATION_DELAY/1000} seconds`);
    setTimeout(() => {
      // Only validate token if user appears to be logged in
      if (getStoredToken()) {
        validateToken(false);
      } else {
        console.log('Auth Handler: Skipping validation as no token exists');
      }
      
      // Then set up periodic validation at a longer interval
      console.log(`Auth Handler: Setting up validation interval every ${VALIDATION_INTERVAL/60000} minutes`);
      setInterval(() => {
        // Only validate if a token exists
        if (getStoredToken()) {
          validateToken(false);
        }
      }, VALIDATION_INTERVAL);
    }, INITIAL_VALIDATION_DELAY * 2); // Double the delay to ensure page is fully loaded
  }
  
  // Check for malformed or legacy auth cookies and clear them
  function detectAndCleanLegacyCookies() {
    try {
      // Parse all cookies
      const cookies = document.cookie.split(';');
      let hasLegacyCookies = false;
      
      // Check each cookie for potential auth cookies
      for (const cookie of cookies) {
        const trimmed = cookie.trim();
        const [name, value] = trimmed.split('=').map(part => part.trim());
        
        // Check if it's an auth-related cookie
        if (name.includes('auth_') || name.includes('session')) {
          try {
            // Try to decode the cookie value
            const decodedValue = decodeURIComponent(value);
            
            // For auth_session cookies, they should be valid JSON with expected format
            if (name === 'auth_session' || name === 'auth_session_lax' || name === 'auth_session_secure') {
              try {
                const tokenData = JSON.parse(decodedValue);
                // Check if it has the expected properties
                if (!tokenData.id || !tokenData.v) {
                  console.log(`Auth Handler: Detected malformed auth session cookie: ${name}`);
                  hasLegacyCookies = true;
                }
              } catch (parseError) {
                // If it's not valid JSON, it's a legacy format
                console.log(`Auth Handler: Detected legacy auth session cookie (not JSON): ${name}`);
                hasLegacyCookies = true;
              }
            }
          } catch (e) {
            // If we can't decode it, it's probably malformed
            console.log(`Auth Handler: Detected potential malformed auth cookie: ${name}`);
            hasLegacyCookies = true;
          }
        }
      }
      
      // If we found any legacy or malformed cookies, clear them all
      if (hasLegacyCookies) {
        console.log('Auth Handler: Clearing all auth cookies due to detected legacy formats');
        clearStoredToken();
      }
    } catch (e) {
      console.error('Auth Handler: Error checking for legacy cookies:', e);
    }
  }
  
  // The public API
  window.AuthHandler = {
    isAuthenticated: () => !!getStoredToken(),
    getToken: getStoredToken,
    getTokenVersion: getTokenVersion,
    setToken: setStoredToken,
    logout: logout,
    validateToken: validateToken,
    showLoginDialog: () => {
      window.dispatchEvent(new CustomEvent('auth:required'));
    }
  };
  
  // Initialize when DOM is loaded
  window.addEventListener('DOMContentLoaded', () => {
    // First detect and clean legacy cookies
    detectAndCleanLegacyCookies();
    
    // Then proceed with normal initialization
    checkUrlForToken();
    checkForSignOutRequest();
    setupAuthEventListeners();
    startValidationInterval();
    
    // Force token version to be 2
    localStorage.setItem(AUTH_VERSION_KEY, '2');
    sessionStorage.setItem(AUTH_VERSION_KEY, '2');
    
    console.log('Auth Handler: Initialized with token version 2');
  });
})(); 