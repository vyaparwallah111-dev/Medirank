/** @type {import('next').NextConfig} */
const nextConfig = {
  images: { 
    remotePatterns: [{ protocol: 'https', hostname: '**' }] 
  },
  output: 'standalone', // 👈 Chhota bundle banane ke liye
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        { key: 'Content-Security-Policy', value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'" },
      ],
    }];
  },
};

export default nextConfig;
