// Vite config for Playwright runs (started by scripts/e2e-server.sh). Mirrors ../../vite.config.ts
// (keep the plugin list in sync) but runs the Worker fully offline with isolated local state:
//  - persistState -> .wrangler/e2e (D1/R2/queues/workflows; the dev's .wrangler/state is untouched)
//  - no remote bindings; Workers AI + Vectorize dropped (FAKE_EXTERNALS=true uses in-memory fakes)
//  - no file watching, so other people's edits mid-run don't reload the app under test
//  - vars: defaults below; `.dev.vars.e2e` (CLOUDFLARE_ENV=e2e) overrides and shadows `.dev.vars`
import { fileURLToPath } from "node:url";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { alias } from "../../aliases.ts";
import { normalizeBasePath } from "../../src/shared/base-path.ts";

const root = fileURLToPath(new URL("../..", import.meta.url));
const port = Number(process.env.E2E_PORT ?? 5199);
// E2E_BASE_PATH=/grants runs the app under a path prefix, as production does (06-base-path.spec.ts).
const base = normalizeBasePath(process.env.E2E_BASE_PATH);
process.env.CLOUDFLARE_ENV ??= "e2e";

export default defineConfig({
  root,
  base: `${base}/`,
  plugins: [
    react(),
    tailwindcss(),
    cloudflare({
      configPath: fileURLToPath(new URL("../../wrangler.jsonc", import.meta.url)),
      persistState: { path: ".wrangler/e2e" },
      remoteBindings: false,
      inspectorPort: false,
      config: (worker) => {
        worker.ai = undefined;
        worker.vectorize = [];
        if (base && worker.assets) {
          worker.assets.base_path = `${base}/`;
          worker.assets.run_worker_first = [`${base}/api/*`];
        }
        worker.vars = {
          ...worker.vars,
          APP_ENV: "development",
          APP_URL: `http://localhost:${port}${base}`,
          BASE_PATH: base,
          FAKE_EXTERNALS: "true",
          INLINE_JOBS: "true",
          DEMO_MODE: "true",
        };
      },
    }),
  ],
  resolve: { alias },
  server: {
    port,
    strictPort: true,
    watch: process.env.E2E_WATCH === "1" ? {} : null,
  },
  clearScreen: false,
});
