import type { NextConfig } from "next";

const docsDomain = process.env.DOCS_SITE_DOMAIN?.trim();

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  ...(docsDomain
    ? {
        env: {
          NEXT_PUBLIC_DOCS_SITE_DOMAIN: docsDomain,
        },
      }
    : {}),
};

export default nextConfig;
