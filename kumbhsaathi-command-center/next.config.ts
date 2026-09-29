import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: { "/api/maps/*": ["./private-assets/maps/*.geojson"] },
};

export default nextConfig;
