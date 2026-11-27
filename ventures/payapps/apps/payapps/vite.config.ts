import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { alias } from "./aliases.ts";

const require = createRequire(import.meta.url);
const tesseractJs = require.resolve("tesseract.js/package.json");
// The WebAssembly builds are tesseract.js's own dependency, at the version it pins.
const tesseractCore = createRequire(tesseractJs).resolve("tesseract.js-core/package.json");
const engData = require.resolve("@tesseract.js-data/eng/package.json");

/**
 * The OCR engine for scans with no text layer (src/client/lib/ocr.ts), served by the app itself
 * under /ocr/ so a scan never leaves the browser and no CDN is fetched: tesseract.js's worker, the
 * three LSTM-only WebAssembly builds of Tesseract (the worker picks one by the browser's SIMD
 * support) and the English model. Emitted into the build; served from node_modules by `vite dev`.
 */
const OCR_FILES: Record<string, string> = {
  "ocr/worker.min.js": join(dirname(tesseractJs), "dist/worker.min.js"),
  ...Object.fromEntries(
    ["", "simd-", "relaxedsimd-"].map((v) => [
      `ocr/core/tesseract-core-${v}lstm.wasm.js`,
      join(dirname(tesseractCore), `tesseract-core-${v}lstm.wasm.js`),
    ]),
  ),
  "ocr/lang/eng.traineddata.gz": join(dirname(engData), "4.0.0_best_int/eng.traineddata.gz"),
};

export function ocrAssets(): Plugin {
  return {
    name: "payapps-ocr-assets",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = (req.url ?? "").split("?")[0]?.replace(/^\//, "") ?? "";
        const file = OCR_FILES[path];
        if (!file) return next();
        res.setHeader(
          "Content-Type",
          path.endsWith(".js") ? "text/javascript" : "application/octet-stream",
        );
        res.end(readFileSync(file));
      });
    },
    generateBundle() {
      // Only the browser build carries them; the Worker has no use for them.
      if (this.environment?.name !== "client") return;
      for (const [fileName, file] of Object.entries(OCR_FILES))
        this.emitFile({ type: "asset", fileName, source: readFileSync(file) });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), cloudflare(), ocrAssets()],
  resolve: { alias },
  // Worker source maps stay (upload_source_maps sends them to Cloudflare, not to the public). The
  // browser bundle gets none: dist/client is served as public assets, and its .map files would
  // publish this proprietary app's source (sourcesContent). Guarded by scripts/check-no-client-maps.mjs.
  build: { sourcemap: true },
  environments: { client: { build: { sourcemap: false } } },
});
