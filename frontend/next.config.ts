import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "https://jobsphere-ai-zxkj.onrender.com/api/:path*",
      },
      {
        source: "/admin/:path*",
        destination: "https://jobsphere-ai-zxkj.onrender.com/admin/:path*",
      },
    ];
  },
};

export default nextConfig;