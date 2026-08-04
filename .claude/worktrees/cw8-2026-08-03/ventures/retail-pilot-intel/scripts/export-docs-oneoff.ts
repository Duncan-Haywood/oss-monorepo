/**
 * Build the docs site for one-off HTML consumption (email, LAN, static host).
 *
 *   pnpm docs:export
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const distDir = join(root, "apps/docs/dist");
const indexHtml = join(distDir, "index.html");

const r = spawnSync("pnpm", ["docs:build"], {
  cwd: root,
  stdio: "inherit",
  shell: false,
});
if (r.status !== 0) {
  process.exit(r.status ?? 1);
}

if (!existsSync(indexHtml)) {
  console.error("Build succeeded but index.html missing:", indexHtml);
  process.exit(1);
}

console.log("\nOne-off HTML export ready:");
console.log("  Directory:", distDir);
console.log("  Entry:    ", indexHtml);
console.log("\nServe:     pnpm docs:preview");
console.log("PDF:       open a route in the preview, then Print → Save as PDF");
console.log("Deploy:    see apps/docs/DEPLOY.md");
