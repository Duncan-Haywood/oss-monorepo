// Copies the web app (one directory up) into www/ for Capacitor. No bundler.
import { cpSync, rmSync, mkdirSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

export const KEEP = /\.(html|mjs|webmanifest|png|js)$/;
const src = fileURLToPath(new URL("..", import.meta.url));
const out = fileURLToPath(new URL("./www", import.meta.url));

export function webFiles(dir = src) {
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => (e.isFile() && KEEP.test(e.name) && !/\.test\.mjs$/.test(e.name) && !/^build-/.test(e.name))
      || (e.isDirectory() && e.name === "icons"))
    .map((e) => e.name);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  for (const f of webFiles()) cpSync(join(src, f), join(out, f), { recursive: true });
  console.log(`copied ${webFiles().length} entries to www/`);
}
