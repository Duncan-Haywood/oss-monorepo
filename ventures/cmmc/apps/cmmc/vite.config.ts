import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { alias } from "./aliases.ts";

export default defineConfig({
  plugins: [react(), tailwindcss(), cloudflare()],
  resolve: { alias },
  // Worker source maps stay (upload_source_maps sends them to Cloudflare, not to the public). The
  // browser bundle gets none: dist/client is served as public assets, and its .map files would
  // publish this proprietary app's source (sourcesContent). Guarded by scripts/check-no-client-maps.mjs.
  build: { sourcemap: true },
  environments: { client: { build: { sourcemap: false } } },
});
