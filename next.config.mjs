/** @type {import('next').NextConfig} */
const nextConfig = { 
  images: { 
    remotePatterns: [{ protocol: 'https', hostname: '**' }] 
  },
  // 👇 Yeh naya block add kariye jo browser ko hamesha secure line par rakhega
  async headers() {
    return [
      {
        source: '/(:path*)',
        headers: [
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload'
          }
        ]
      }
    ];
  }
};

export default nextConfig;