import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "convex/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Next's "react-server" export condition (which resolves this package
      // to a no-op) isn't applied by vitest's plain Node resolution, so the
      // package's default export throws unconditionally. See
      // test/server-only-stub.ts for details.
      "server-only": path.resolve(__dirname, "./test/server-only-stub.ts"),
    },
  },
});
