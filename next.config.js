/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  
  // Environment variables that are safe to expose to the browser
  env: {
    CUSTOM_KEY: process.env.CUSTOM_KEY,
  },

  // API configuration
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: '/api/:path*',
      },
    ];
  },

  // Headers for security and performance
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
        ],
      },
      {
        source: '/api/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-store, must-revalidate',
          },
        ],
      },
    ];
  },

  // Performance optimizations
  experimental: {
    optimizeCss: true,
    optimizeServerReact: true,
  },

  // Compression and optimization
  compress: true,
  
  // Image optimization
  images: {
    domains: [],
    formats: ['image/webp', 'image/avif'],
  },

  // Build-time configuration
  generateBuildId: async () => {
    // Use timestamp for unique build IDs
    return `build-${Date.now()}`;
  },

  // Webpack configuration for optimal builds
  webpack: (config, { dev, isServer }) => {
    // Production optimizations
    if (!dev && !isServer) {
      config.optimization = {
        ...config.optimization,
        splitChunks: {
          chunks: 'all',
          cacheGroups: {
            default: false,
            vendors: false,
            vendor: {
              name: 'vendor',
              chunks: 'all',
              test: /node_modules/,
            },
          },
        },
      };
    }

    return config;
  },

  // Output configuration for Vercel deployment
  output: 'standalone',
  
  // Trailing slash configuration
  trailingSlash: false,
  
  // PoweredBy header removal
  poweredByHeader: false,
  
  // Development configuration
  ...(process.env.NODE_ENV === 'development' && {
    // Development-only settings
    reactStrictMode: true,
  }),

  // Production configuration
  ...(process.env.NODE_ENV === 'production' && {
    // Production-only settings
    compiler: {
      removeConsole: {
        exclude: ['error'],
      },
    },
  }),
};

module.exports = nextConfig;
