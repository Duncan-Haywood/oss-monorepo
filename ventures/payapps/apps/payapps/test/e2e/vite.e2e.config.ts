// Vite config for Playwright runs (started by scripts/e2e-server.sh). Mirrors ../../vite.config.ts (keep
// the plugin list in sync) with its own state directory and port, fake mail, and no file watching, so
// an edit mid-run does not reload the app under test.
import { fileURLToPath } from "node:url";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { alias } from "../../aliases.ts";
import { ocrAssets } from "../../vite.config.ts";
import { E2E_AUTH_SECRET } from "./secret.ts";

const root = fileURLToPath(new URL("../..", import.meta.url));
const port = Number(process.env.E2E_PORT ?? 5197);

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
        worker.vars = {
          ...worker.vars,
          APP_ENV: "development",
          APP_URL: `http://localhost:${port}`,
          BILLING_PROVIDER: "none",
          FAKE_EXTERNALS: "true",
          AUTH_SECRET: E2E_AUTH_SECRET,
        };
      },
    }),
    ocrAssets(),
  ],
  resolve: { alias },
  server: {
    port,
    strictPort: true,
    watch: process.env.E2E_WATCH === "1" ? {} : null,
  },
  clearScreen: false,
});
