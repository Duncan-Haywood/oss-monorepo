import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { createHash } from "node:crypto";

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE_PATH || "./",
  define: {
    __DOCS_PASSCODE_HASH__: JSON.stringify(
      sha256(process.env.VITE_DOCS_PASSCODE?.trim() || "pilot-docs"),
    ),
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
