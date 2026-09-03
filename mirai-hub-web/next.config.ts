import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Required for the slim Docker runner stage (Dockerfile copies
  // .next/standalone + .next/static rather than shipping node_modules).
  output: "standalone",
};

export default nextConfig;
