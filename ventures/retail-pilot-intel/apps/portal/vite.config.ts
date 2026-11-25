import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { pbkdf2Sync } from "node:crypto";

// Must match the salt and iteration count in src/auth/demoAuth.ts.
const PASSCODE_SALT = "retail-pilot-intel/portal/passcode-v2";
const PASSCODE_ITERATIONS = 600_000;

function derivePasscodeHash(passcode: string): string {
  return pbkdf2Sync(passcode, PASSCODE_SALT, PASSCODE_ITERATIONS, 32, "sha256").toString("hex");
}

export default defineConfig({
  plugins: [react()],
  base: "./",
  define: {
    __DEMO_PASSCODE_HASH__: JSON.stringify(
      derivePasscodeHash(process.env.VITE_DEMO_PASSCODE?.trim() || "atelier-demo"),
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
