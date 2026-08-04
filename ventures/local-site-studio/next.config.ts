import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The container image copies `.next/standalone`, which Next only emits when
  // this is set. Without it the runner stage has no `server.js` to start, so
  // the Deployment in platform/k8s/apps/local-site-studio crash-loops.
  output: "standalone",
};

export default nextConfig;
