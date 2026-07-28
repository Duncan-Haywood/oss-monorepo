import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { createHash } from "node:crypto";

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export default defineConfig({
  plugins: [react()],
  base: "./",
  define: {
    __DEMO_PASSCODE_HASH__: JSON.stringify(
      sha256(process.env.VITE_DEMO_PASSCODE?.trim() || "atelier-demo"),
    ),
  },
  server: {
    port: 5174,
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
