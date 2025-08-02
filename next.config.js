/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  
  // Simplified configuration for reliable deployment
  experimental: {
    // Remove problematic optimizations
  },
  
  // Basic security headers
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
        ],
      },
    ];
  },

  // Remove problematic webpack config
  webpack: (config) => {
    return config;
  },

  // Remove output standalone for now
  // output: 'standalone',
  
  // Basic settings
  trailingSlash: false,
  poweredByHeader: false,
};

module.exports = nextConfig;
