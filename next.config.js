// next.config.js
const withPWA = require('next-pwa')({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development'
});

const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  generateBuildId: () => 'scout-app-v1',
  webpack: (config, { isServer }) => {
    // Use mock modules for client-side only, but NOT for API routes
    if (!isServer) {
      config.resolve.alias = {
        ...config.resolve.alias,
        bcrypt: path.resolve(__dirname, './src/mocks/bcrypt.js'),
        pg: path.resolve(__dirname, './src/mocks/pg.js'),
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
      'pg-native': false
    };
    
    return config;
  }
};

module.exports = withPWA(nextConfig);