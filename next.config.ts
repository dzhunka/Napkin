import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  // The MCP route reads the built widget off disk at request time, so the
  // bundle has to be traced into the serverless function or production will
  // fail to serve the `ui://` resource.
  outputFileTracingIncludes: {
    "/mcp": ["widget/dist/index.html"],
  },
};

export default nextConfig;
