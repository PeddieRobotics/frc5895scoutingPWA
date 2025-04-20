// next.config.js
const withPWA = require('next-pwa')({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development'
});

const path = require('path');
const crypto = require('crypto');

/**
 * Generate a dynamic build ID based on environment variables
 * This helps ensure that preview deployments have consistent build IDs
 */
function generateDynamicBuildId() {
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
  const buildId = `scout-app-${hash.substring(0, 8)}`;
  console.log(`Generated dynamic build ID: ${buildId}`);
  return buildId;
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  generateBuildId: generateDynamicBuildId,
  webpack: (config, { isServer }) => {
    // Use mock modules for client-side only, but NOT for API routes
    if (!isServer) {
      config.resolve.alias = {
        ...config.resolve.alias,
        bcrypt: path.resolve(__dirname, './src/mocks/bcrypt.js'),
        '@neondatabase/serverless': path.resolve(__dirname, './src/mocks/pg.js'),
      };
      
      // This ensures that Next.js API routes still use the real modules, not the mocks
      config.module.rules.push({
        test: /\.(js|jsx)$/,
        include: [path.resolve(__dirname, 'src/app/api')],
        use: [{
          loader: 'null-loader'
        }]
      });
    }
    
    // Ignore native modules
    config.resolve.fallback = {
      ...config.resolve.fallback,
      // Add these fallbacks to handle Node.js native module imports
      net: false,
      tls: false,
      dns: false,
      fs: false,
      path: false,
      os: false,
      crypto: false,
      stream: false,
      child_process: false,
      'pg-native': false,
      ws: false // Add this for WebSocket support
    };
    
    return config;
  }
};

module.exports = withPWA(nextConfig);