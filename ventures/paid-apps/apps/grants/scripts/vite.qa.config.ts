// Vite config for UI QA screenshot runs (started by scripts/qa-server.sh). A copy of
// test/e2e/vite.e2e.config.ts (keep the plugin list in sync) with its own port and state, so a QA run
// never collides with a Playwright e2e run on :5199 / .wrangler/e2e:
//  - persistState -> .wrangler/qa (D1/R2/queues/workflows)
//  - no remote bindings; Workers AI + Vectorize dropped (FAKE_EXTERNALS=true uses in-memory fakes)
//  - no file watching unless QA_WATCH=1
//  - vars: defaults below; `.dev.vars.qa` (CLOUDFLARE_ENV=qa) overrides and shadows `.dev.vars`
import { fileURLToPath } from "node:url";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { alias } from "../aliases.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const port = Number(process.env.QA_PORT ?? 5177);
process.env.CLOUDFLARE_ENV ??= "qa";

export default defineConfig({
  root,
  plugins: [
    react(),
    tailwindcss(),
    cloudflare({
      configPath: fileURLToPath(new URL("../wrangler.jsonc", import.meta.url)),
      persistState: { path: ".wrangler/qa" },
      remoteBindings: false,
      inspectorPort: false,
      config: (worker) => {
        worker.ai = undefined;
        worker.vectorize = [];
        worker.vars = {
          ...worker.vars,
          APP_ENV: "development",
          APP_URL: `http://localhost:${port}`,
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
    watch: process.env.QA_WATCH === "1" ? {} : null,
  },
  clearScreen: false,
});
