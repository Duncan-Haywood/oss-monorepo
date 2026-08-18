import type { NextConfig } from "next";
import fs from "node:fs";
import path from "node:path";

const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "manifest-src 'self'",
  "worker-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  ...(process.env.NODE_ENV === "production" ? ["upgrade-insecure-requests"] : []),
].join("; ");

export const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-XSS-Protection", value: "1; mode=block" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  {
    key: "Content-Security-Policy",
    value: csp,
  },
];

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  webpack(config, { isServer }) {
    if (isServer) {
      config.plugins = config.plugins || [];
      config.plugins.push({
        apply(compiler: { hooks: { afterEmit: { tap: (name: string, fn: (compilation: { outputOptions: { path?: string } }) => void) => void } } }) {
          compiler.hooks.afterEmit.tap("EnsurePagesManifestPlugin", (compilation) => {
            const outputPath = compilation.outputOptions.path;
            if (outputPath) {
              fs.mkdirSync(outputPath, { recursive: true });
              const manifests: Record<string, string> = {
                "pages-manifest.json": "{}",
                "next-font-manifest.json": JSON.stringify({
                  pages: {},
                  app: {},
                  appUsingSizeAdjust: false,
                  pagesUsingSizeAdjust: false,
                }),
                "proxy.js.nft.json": JSON.stringify({
                  version: 1,
                  files: [],
                }),
              };
              for (const [filename, content] of Object.entries(manifests)) {
                const filePath = path.join(outputPath, filename);
                if (!fs.existsSync(filePath)) {
                  fs.writeFileSync(filePath, content);
                }
              }
              const nextDir = path.dirname(outputPath);
              fs.mkdirSync(path.join(nextDir, "standalone", ".next", "server"), { recursive: true });
            }
          });
        },
      });
    }
    return config;
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
