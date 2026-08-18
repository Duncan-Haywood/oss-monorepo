import type { NextConfig } from "next";
import fs from "node:fs";
import path from "node:path";

const nextConfig: NextConfig = {
  // The container image copies `.next/standalone`, which Next only emits when
  // this is set. Without it the runner stage has no `server.js` to start, so
  // the Deployment in platform/k8s/apps/local-site-studio crash-loops.
  output: "standalone",
  webpack(config, { isServer }) {
    if (isServer) {
      config.plugins = config.plugins || [];
      config.plugins.push({
        apply(compiler: { hooks: { afterEmit: { tap: (name: string, fn: (compilation: { outputOptions: { path?: string } }) => void) => void } } }) {
          compiler.hooks.afterEmit.tap("EnsureManifestsAndDirsPlugin", (compilation) => {
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
              const standaloneContexts = path.join(
                nextDir,
                "standalone/node_modules/next/dist/server/route-modules/pages/vendored/contexts"
              );
              fs.mkdirSync(standaloneContexts, { recursive: true });
            }
          });
        },
      });
    }
    return config;
  },
};

export default nextConfig;
