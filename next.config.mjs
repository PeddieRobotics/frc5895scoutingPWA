/** @type {import('next').NextConfig} */

const withPWA = (require('next-pwa'))({
    dest: 'public',
    disable: process.env.NODE_ENV === 'development',
  });
  
  const nextConfig = withPWA({
    // Your existing Next.js config
    reactStrictMode: true,
  });
  
  export default nextConfig;