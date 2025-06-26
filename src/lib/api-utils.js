/**
 * API utility functions to standardize fetch requests and error handling
 */

/**
 * Safely parses JSON from a response, falling back to an empty object
 * if parsing fails.
 */
export async function safeJsonParse(response) {
  try {
    return await response.json();
  } catch (e) {
    console.error('Error parsing JSON response:', e);
    return {};
  }
}

/**
 * Makes a fetch request that handles authentication errors consistently
 * @param {string} url - The URL to fetch
 * @param {object} options - Fetch options
 * @returns {Promise<object>} - The response data
 */
export async function authenticatedFetch(url, options = {}) {
  try {
    // Get current team from storage
    let currentTeam = null;
    try {
      currentTeam = localStorage.getItem('userTeam') || 
                    sessionStorage.getItem('auth_team') || 
                    'guest';
    } catch (e) {
      console.error('Error getting auth info:', e);
      currentTeam = 'guest';
    }
    
    let defaultHeaders = {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store'
    };

    // Add Basic auth header only if credentials are available
    try {
      const storedCreds = sessionStorage.getItem('auth_credentials') ||
                          localStorage.getItem('auth_credentials');
      if (storedCreds) {
        defaultHeaders['Authorization'] = `Basic ${storedCreds}`;
      }
    } catch (e) {
      // Ignore storage access errors
    }

    const defaultOptions = { headers: defaultHeaders };
    
    // Merge options
    const mergedOptions = {
      ...defaultOptions,
      ...options,
      headers: {
        ...defaultOptions.headers,
        ...(options.headers || {})
      }
    };
    
    // Make the fetch request
    const response = await fetch(url, mergedOptions);
    
    // Handle 401 errors
    if (response.status === 401) {
      console.error('Authentication error in API request:', url);
      
      // Trigger the auth dialog
      window.dispatchEvent(new CustomEvent('auth:required', {
        detail: { message: 'Your session has expired. Please login again.' }
      }));
      
      throw new Error('Authentication required');
    }
    
    // Handle 400+ errors that aren't 401
    if (!response.ok) {
      const errorData = await safeJsonParse(response);
      const errorMessage = errorData.message || 
                          errorData.error || 
                          `Server returned ${response.status}`;
      
      throw new Error(errorMessage);
    }
    
    // Parse and return data for successful responses
    return await safeJsonParse(response);
  } catch (error) {
    // Rethrow authentication errors
    if (error.message === 'Authentication required') {
      throw error;
    }
    
    // Log and rethrow other errors
    console.error('API request failed:', error);
    throw error;
  }
} 