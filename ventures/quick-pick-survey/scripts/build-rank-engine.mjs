// Copies the engine the rank page needs out of src/lib/ as browser modules:
//   node scripts/build-rank-engine.mjs          write site/engine/*.mjs
//   node scripts/build-rank-engine.mjs --check  exit 1 if they are stale
// Uses Node's own TypeScript stripper (node:module stripTypeScriptTypes, no
// dependency), so the page runs the same Bradley-Terry refit and favourite
// set the Next.js app and its tests use, not a hand-kept copy.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { stripTypeScriptTypes } from "node:module";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
export const ENGINE_FILES = ["btRefit", "favouriteSet"];

export function buildEngineFile(name) {
  const ts = readFileSync(join(root, "src/lib", `${name}.ts`), "utf8");
  if (/^import /m.test(ts)) throw new Error(`${name}.ts imports another module; extend build-rank-engine.mjs to rewrite it`);
  const js = stripTypeScriptTypes(ts, { mode: "strip" });
  return `// GENERATED from src/lib/${name}.ts by scripts/build-rank-engine.mjs. Do not edit.\n${js}`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const check = process.argv.includes("--check");
  const out = join(root, "site/engine");
  mkdirSync(out, { recursive: true });
  let stale = 0;
  for (const name of ENGINE_FILES) {
    const file = join(out, `${name}.mjs`);
    const next = buildEngineFile(name);
    if (check) {
      if (!existsSync(file) || readFileSync(file, "utf8") !== next) { console.error(`stale: site/engine/${name}.mjs`); stale++; }
    } else writeFileSync(file, next);
  }
  if (stale) process.exit(1);
  console.log(check ? "site/engine is current" : `wrote site/engine/{${ENGINE_FILES.join(",")}}.mjs`);
}
