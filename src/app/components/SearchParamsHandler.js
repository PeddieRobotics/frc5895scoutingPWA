'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

export default function SearchParamsHandler({ onAuthRequired, onRedirectTarget }) {
  // Use Next.js useSearchParams hook safely within a dedicated component
  const searchParams = useSearchParams();
  
  useEffect(() => {
    // Skip if searchParams isn't available
    if (!searchParams) return;
    
    // Check if auth is required from URL parameter
    const authRequired = searchParams.get('authRequired');
    if (authRequired === 'true') {
      const redirect = searchParams.get('redirect');
      onAuthRequired(true);
      if (redirect) {
        onRedirectTarget(redirect);
      }
    }
  }, [searchParams, onAuthRequired, onRedirectTarget]);
  
  // This component doesn't render anything
  return null;
} 