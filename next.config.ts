import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  // Both routes read the built widget off disk at request time, so the bundle
  // has to be traced into each serverless function or production will fail to
  // serve the `ui://` resource and the site's demo.
  outputFileTracingIncludes: {
    "/mcp": ["widget/dist/index.html"],
    "/demo": ["widget/dist/index.html"],
  },
};

export default nextConfig;
