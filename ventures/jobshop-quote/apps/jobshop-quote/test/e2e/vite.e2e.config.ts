// Vite config for Playwright runs (started by scripts/e2e-server.sh). Mirrors ../../vite.demo.config.ts
// (keep the plugin list in sync) with its own state directory and port, and no file watching, so an
// edit mid-run does not reload the app under test.
import { fileURLToPath } from "node:url";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { alias } from "../../aliases.ts";

const root = fileURLToPath(new URL("../..", import.meta.url));
const port = Number(process.env.E2E_PORT ?? 5198);

export default defineConfig({
  root,
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
        worker.vars = {
          ...worker.vars,
          APP_ENV: "development",
          APP_URL: `http://localhost:${port}`,
          FAKE_EXTERNALS: "true",
          // e2e-only secret: the server runs on localhost with throwaway local data.
          AUTH_SECRET: "e2e-only-auth-secret-0123456789abcdef0123456789",
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
