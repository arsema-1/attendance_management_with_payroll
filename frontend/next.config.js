/** @type {import('next').NextConfig} */
const nextConfig = {
  // Fixed port — do not change without updating .env.local and CORS_ORIGIN
  env: {
    NEXT_PUBLIC_API_URL: 'http://localhost:5000/api',
  },
  headers: async () => [
    {
      source: '/sw.js',
      headers: [
        { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
        { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
      ],
    },
  ],
};
module.exports = nextConfig;
