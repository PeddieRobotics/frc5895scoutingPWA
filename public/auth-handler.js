// Universal Authentication Handler
// This script provides consistent authentication across all devices
// including iOS where cookie-based approaches often fail

(function() {
  console.log('Auth Handler: Initializing v2.0');
  
  // Auth token storage key
  const AUTH_TOKEN_KEY = 'auth_token';
  const AUTH_EXPIRY_KEY = 'auth_token_expiry';
  const AUTH_VERSION_KEY = 'auth_token_version';
  
  // Auth validation interval (in ms) - check every 5 minutes
  const VALIDATION_INTERVAL = 5 * 60 * 1000;
  
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
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(AUTH_EXPIRY_KEY);
    localStorage.removeItem(AUTH_VERSION_KEY);
    console.log('Auth Handler: Cleared auth token from localStorage');
  }
  
  // Add auth token to all fetch requests
  const originalFetch = window.fetch;
  window.fetch = function(url, options = {}) {
    const token = getStoredToken();
    if (token) {
      if (!options.headers) {
        options.headers = {};
      }
      
      // Only add the token if it's a same-origin request
      const isSameOrigin = url.startsWith('/') || url.startsWith(window.location.origin);
      if (isSameOrigin && !options.headers['Authorization']) {
        options.headers['Authorization'] = `Bearer ${token}`;
        
        // Add version header
        const tokenVersion = getTokenVersion();
        options.headers['X-Token-Version'] = tokenVersion;
        
        // Add version to URL
        if (!url.includes('v=')) {
          const separator = url.includes('?') ? '&' : '?';
          url = `${url}${separator}v=${tokenVersion}`;
        }
        
        // Special handling for validate-token endpoint
        if (url.includes('/api/auth/validate-token')) {
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
    
    try {
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
        cache: 'no-store'
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
        
        return data.valid === true;
      } else {
        console.log('Auth Handler: Server rejected token');
        if (forceLogout) {
          logout();
        }
        return false;
      }
    } catch (error) {
      console.error('Auth Handler: Validation error', error);
      return false;
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
    // Validate immediately
    validateToken();
    
    // Then set up periodic validation
    setInterval(() => {
      validateToken();
    }, VALIDATION_INTERVAL);
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