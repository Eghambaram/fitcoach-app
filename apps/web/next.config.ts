import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Standalone output for the Railway Docker image is configured in step 1.6.
};

export default nextConfig;
