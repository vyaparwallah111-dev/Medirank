/** @type {import('next').NextConfig} */
const nextConfig = { 
  images: { 
    remotePatterns: [{ protocol: 'https', hostname: '**' }] 
  },
  output: 'standalone' // 👈 Bas ye ek line niche jod di hai loop rokne ke liye
};

export default nextConfig;