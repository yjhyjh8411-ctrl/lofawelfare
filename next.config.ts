import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'export',
  trailingSlash: true,
  reactStrictMode: true,
  images: { unoptimized: true },
  // dev 모드에서만 적용 (정적 export 빌드는 rewrites 를 무시).
  // /api/* 호출을 운영 Firebase Hosting 으로 프록시 → 그쪽이 다시 functions 로 라우팅.
  async rewrites() {
    if (process.env.NODE_ENV === 'production') return []
    return [
      { source: '/api/:path*', destination: 'https://lofawelfare-3ae73.web.app/api/:path*' },
    ]
  },
};

export default nextConfig;
