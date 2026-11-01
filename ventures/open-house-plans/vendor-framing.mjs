#!/usr/bin/env node
// Copies the Wall Framing Takeoff engine into this folder, so Open House
// Plans stays self-contained (every module imports only its siblings, and the
// folder runs on its own when downloaded or served). The copies are the
// source files byte for byte, apart from a first-line banner and their
// sibling imports renamed to the wft- prefix.
//
//   node vendor-framing.mjs           write the copies
//   node vendor-framing.mjs --check   exit 1 if a copy differs from what it would write
//
// framing.test.mjs runs the check, so a change to ../wall-framing-takeoff
// that is not re-vendored here turns this venture's tests red.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const source = join(here, "..", "wall-framing-takeoff");
export const VENDORED = { "engine.mjs": "wft-engine.mjs", "drawings.mjs": "wft-drawings.mjs", "panels.mjs": "wft-panels.mjs" };

export function vendored(name) {
  let text = readFileSync(join(source, name), "utf8");
  for (const [from, to] of Object.entries(VENDORED)) text = text.split(`from "./${from}"`).join(`from "./${to}"`);
  return `// Vendored from ventures/wall-framing-takeoff/${name} by vendor-framing.mjs; edit the source, then run it.\n${text}`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const check = process.argv.includes("--check");
  let stale = 0;
  for (const [name, copy] of Object.entries(VENDORED)) {
    const want = vendored(name);
    const path = join(here, copy);
    const have = existsSync(path) ? readFileSync(path, "utf8") : null;
    if (have === want) continue;
    if (check) { console.error(`${copy} differs from ../wall-framing-takeoff/${name}: run node vendor-framing.mjs`); stale++; }
    else { writeFileSync(path, want); console.log(`wrote ${copy}`); }
  }
  process.exit(stale ? 1 : 0);
}
