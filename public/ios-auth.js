// iOS Authentication Helper
// This script provides authentication persistence for iOS devices
// where cookie-based auth often fails due to Safari's ITP

(function() {
  // Check if this is an iOS device
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  
  if (!isIOS) return; // Only run on iOS devices
  
  console.log('iOS Auth Helper: Initializing');
  
  // Functions to get/set auth in localStorage
  function getStoredAuth() {
    return localStorage.getItem('ios_auth_token');
  }
  
  function setStoredAuth(token) {
    localStorage.setItem('ios_auth_token', token);
    console.log('iOS Auth Helper: Stored auth token in localStorage');
  }
  
  // Check for the X-Auth-Transfer header which indicates the server
  // wants us to store auth in localStorage
  function checkResponseForAuthTransfer(response) {
    if (response.headers && response.headers.get('X-Auth-Transfer') === 'enabled') {
      // Read the auth cookie and store it in localStorage
      const cookies = document.cookie.split(';');
      for (let cookie of cookies) {
        cookie = cookie.trim();
        if (cookie.startsWith('ios_auth=')) {
          const token = cookie.substring('ios_auth='.length);
          setStoredAuth(token);
          break;
        }
      }
    }
  }
  
  // Intercept fetch to handle auth transfer
  const originalFetch = window.fetch;
  window.fetch = function(...args) {
    return originalFetch.apply(this, args)
      .then(response => {
        checkResponseForAuthTransfer(response);
        return response;
      });
  };
  
  // Function to add auth to outgoing requests
  function addAuthToRequest() {
    const token = getStoredAuth();
    if (!token) return;
    
    // Add auth to all links
    document.querySelectorAll('a').forEach(link => {
      if (link.href && link.href.startsWith(window.location.origin) && !link.href.includes('?')) {
        link.href = `${link.href}?ios_auth=${encodeURIComponent(token)}`;
      }
    });
    
    // Add hidden input to all forms
    document.querySelectorAll('form').forEach(form => {
      if (!form.querySelector('input[name="ios_auth"]')) {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = 'ios_auth';
        input.value = token;
        form.appendChild(input);
      }
    });
  }
  
  // When page loads
  window.addEventListener('DOMContentLoaded', () => {
    // Check URL for ios_auth parameter
    const urlParams = new URLSearchParams(window.location.search);
    const urlToken = urlParams.get('ios_auth');
    
    if (urlToken) {
      setStoredAuth(urlToken);
      
      // Clean URL by removing ios_auth parameter
      urlParams.delete('ios_auth');
      const newUrl = window.location.pathname + 
                    (urlParams.toString() ? '?' + urlParams.toString() : '');
      window.history.replaceState({}, document.title, newUrl);
    }
    
    // Check cookies for ios_auth
    const cookies = document.cookie.split(';');
    for (let cookie of cookies) {
      cookie = cookie.trim();
      if (cookie.startsWith('ios_auth=')) {
        const token = cookie.substring('ios_auth='.length);
        setStoredAuth(token);
        break;
      }
    }
    
    // Add auth to all outgoing requests
    addAuthToRequest();
    
    // Run again after DOM changes
    const observer = new MutationObserver(() => {
      addAuthToRequest();
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  });
})(); 