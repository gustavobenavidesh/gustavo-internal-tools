import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The dev-mode route indicator (the circled "N") sits bottom-left, right on
  // top of the sidebar. Compile and runtime errors still surface without it.
  devIndicators: false,
};

export default nextConfig;
