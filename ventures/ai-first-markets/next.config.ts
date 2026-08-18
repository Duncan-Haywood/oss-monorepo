import type { NextConfig } from "next";
import fs from "node:fs";
import path from "node:path";

const nextConfig: NextConfig = {
  reactStrictMode: true,
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
              };
              for (const [filename, content] of Object.entries(manifests)) {
                const filePath = path.join(outputPath, filename);
                if (!fs.existsSync(filePath)) {
                  fs.writeFileSync(filePath, content);
                }
              }
            }
          });
        },
      });
    }
    return config;
  },
};

export default nextConfig;
