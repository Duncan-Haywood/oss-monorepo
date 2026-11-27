// Writes the static copy of the site to ventures/payapps/site/, which the catalogue serves at
// https://marisstella.app/payapps/ (src/site/static-export.ts says what differs from the Worker build).
//
//   pnpm export:static
//
// Run it after any copy change; test/unit/static-export.test.ts fails until the committed copy matches.
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { STATIC_EXPORT_DIR, staticFiles } from "@site/static-export";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, STATIC_EXPORT_DIR);
const files = staticFiles(root);

rmSync(out, { recursive: true, force: true });
for (const [rel, contents] of files) {
  const file = join(out, rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, contents);
}
console.log(`Wrote ${files.size} files to ${out}`);
