import crypto from 'crypto';

/**
 * Generate a dynamic build ID based on environment variables
 * This helps ensure that preview deployments have consistent build IDs
 * for the same code version.
 * 
 * @returns {string} A unique build ID for this deployment
 */
export function generateBuildId() {
  // Start with environment-specific values
  const envValues = [
    process.env.VERCEL_ENV || process.env.NODE_ENV || 'development',
    process.env.VERCEL_GIT_COMMIT_SHA || '',
    process.env.VERCEL_GIT_COMMIT_MESSAGE || '',
    process.env.VERCEL_URL || '',
    process.env.VERCEL_GIT_REPO_SLUG || '',
    // Add a timestamp for local development to ensure rebuilds get different IDs
    ...(process.env.NODE_ENV === 'development' ? [Date.now().toString()] : [])
  ];
  
  // Create a hash of these values
  const hash = crypto.createHash('md5').update(envValues.join('-')).digest('hex');
  
  // Return a prefixed hash to make it identifiable
  return `build_${hash.substring(0, 8)}`;
}

/**
 * Check if we're in a preview deployment environment
 * 
 * @returns {boolean} True if this is a Vercel preview deployment
 */
export function isPreviewDeployment() {
  // Check Vercel-specific environment variables
  if (process.env.VERCEL_ENV === 'preview') {
    return true;
  }
  
  // Also check URL patterns
  const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
  return hostname.includes('.vercel.app');
}

/**
 * Check if we're in a production environment
 * 
 * @returns {boolean} True if this is a production environment
 */
export function isProduction() {
  return process.env.NODE_ENV === 'production' && !isPreviewDeployment();
}

/**
 * Get environment type information
 * 
 * @returns {Object} Environment information
 */
export function getEnvironmentInfo() {
  return {
    isPreview: isPreviewDeployment(),
    isProduction: isProduction(),
    isDevelopment: process.env.NODE_ENV === 'development',
    buildId: generateBuildId(),
    vercelEnv: process.env.VERCEL_ENV || 'unknown',
    nodeEnv: process.env.NODE_ENV || 'unknown'
  };
} 