import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  outputFileTracingIncludes: {
    "/*": ["./migrations/**/*.sql"]
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "6mb"
    }
  }
};

export default nextConfig;
