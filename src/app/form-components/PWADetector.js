'use client';

import { useEffect } from 'react';

/**
 * This component detects if the app is running in standalone mode (PWA)
 * and stores that information in localStorage to help with authentication bypassing
 */
export default function PWADetector() {
  useEffect(() => {
    // Check if the app is running in standalone mode
    const isStandalone = 
      window.navigator.standalone || // iOS
      window.matchMedia('(display-mode: standalone)').matches; // Other browsers
    
    // Store the standalone status in localStorage and cookies
    if (isStandalone) {
      localStorage.setItem('pwa-standalone', 'true');
      
      // Set a cookie that the middleware can read
      document.cookie = 'pwa-standalone=true; path=/; max-age=31536000; SameSite=Strict';
      
      // Set a custom header that our middleware might be able to read
      // This is mainly for debugging - middleware will detect standalone mode independently
      if (navigator.serviceWorker && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: 'SET_STANDALONE_MODE',
          payload: true
        });
      }
    }
  }, []);

  // This is an invisible component, it doesn't render anything
  return null;
} 