// Offline demo: `pnpm demo` (scripts/demo.sh applies migrations first). Same plugins as vite.config.ts
// but no remote bindings, Workers AI dropped, FAKE_EXTERNALS=true (rule-based FakeLlm extractor, text
// converter), isolated local state in .wrangler/demo. Needs no Cloudflare or Anthropic account.
import { fileURLToPath } from "node:url";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { alias } from "./aliases.ts";

const port = Number(process.env.DEMO_PORT ?? 5199);

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    cloudflare({
      configPath: fileURLToPath(new URL("./wrangler.jsonc", import.meta.url)),
      persistState: { path: ".wrangler/demo" },
      remoteBindings: false,
      inspectorPort: false,
      config: (worker) => {
        worker.ai = undefined;
        worker.vars = {
          ...worker.vars,
          APP_ENV: "development",
          APP_URL: `http://localhost:${port}`,
          FAKE_EXTERNALS: "true",
          // Demo-only secret: the demo runs on localhost with throwaway local data.
          AUTH_SECRET: "offline-demo-only-auth-secret-0123456789abcdef",
        };
      },
    }),
  ],
  resolve: { alias },
  server: { port, strictPort: true },
  clearScreen: false,
});
