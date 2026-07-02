/** @type {import('next').NextConfig} */
const nextConfig = {
  images: { 
    remotePatterns: [{ protocol: 'https', hostname: '**' }] 
  },
  output: 'standalone', // 👈 Chhota bundle banane ke liye
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
};

export default nextConfig;