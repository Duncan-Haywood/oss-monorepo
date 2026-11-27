import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { alias } from "./aliases.ts";
import { normalizeBasePath } from "./src/shared/base-path.ts";

// BASE_PATH=/seller-books/app serves the app under https://marisstella.app/seller-books/app/ next to the
// marketing site (docs/DEPLOY.md, "Path prefix"). Empty (the default) serves it at the host root:
// local dev, tests, or a host of its own. The client reads it back as import.meta.env.BASE_URL
// (src/client/lib/base-path.ts).
const BASE_PATH = normalizeBasePath(process.env.BASE_PATH);

export default defineConfig({
  base: `${BASE_PATH}/`,
  plugins: [
    react(),
    tailwindcss(),
    cloudflare({
      // The built wrangler.json (what the deploy uploads) carries the same prefix: assets are looked
      // up under it, only <base>/api/* runs the Worker first, and the Worker strips it.
      config: (worker) => {
        if (!BASE_PATH) return;
        worker.vars = { ...worker.vars, BASE_PATH };
        if (worker.assets) {
          worker.assets.base_path = `${BASE_PATH}/`;
          worker.assets.run_worker_first = [`${BASE_PATH}/api/*`];
        }
      },
    }),
  ],
  resolve: { alias },
  // Worker source maps stay (upload_source_maps sends them to Cloudflare, not to the public). The
  // browser bundle gets none: dist/client is served as public assets, and its .map files would
  // publish this proprietary app's source (sourcesContent). Guarded by scripts/check-no-client-maps.mjs.
  build: { sourcemap: true },
  environments: { client: { build: { sourcemap: false } } },
});
