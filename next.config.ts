import type { NextConfig } from "next";
import { SECURITY_HEADERS } from "./src/lib/security/security-headers";

const nextConfig: NextConfig = {
  // This app never imports next/image (grepped repo-wide, zero hits — all
  // OG/preview images render via next/og's ImageResponse/Satori instead,
  // a separate pipeline unaffected by this setting). Disabling Next's
  // built-in Image Optimization API closes the /_next/image route entirely
  // (next-server.js returns 404 before ever invoking sharp when
  // images.unoptimized is true) rather than leaving an unused, sharp/libvips
  // -backed attack surface reachable by a direct request. Defense in depth
  // alongside the sharp version override in package.json below.
  images: {
    unoptimized: true,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: SECURITY_HEADERS,
      },
    ];
  },
};

export default nextConfig;
