/**
 * Holds this ESM port to the TypeScript rule set it was copied from.
 *
 * Same reasoning as the sibling guard in
 * `ventures/real-estate-agent-photo-app/site/parity.test.mjs`, and the same
 * lesson behind it: CLAUDE.md records that copying a rule instead of importing
 * it has already cost this repo live product twice. Importing across the
 * Next.js boundary is not available — that boundary is precisely why this port
 * exists — so the substitute is to read the source as text and assert the
 * numbers still agree.
 *
 * A floor raised in one place now fails the build instead of the site quietly
 * serving two different specs to the same artist.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  DEFAULT_COMPARE_SIZE,
  MAX_BYTES,
  MAX_COMPARE_FILES,
  MIN_IMPLIED_DPI,
  PIXEL_FLOOR_SHORT_EDGE,
  PREFLIGHT_DISCLAIMER,
  PRINT_FILE_SPEC_ID,
  listPrintSizes,
} from "./preflight.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const tsPath = path.join(here, "..", "src", "lib", "print-file-preflight.ts");
const tsSource = readFileSync(tsPath, "utf8");
const ourSource = readFileSync(path.join(here, "preflight.mjs"), "utf8");

/** Pulls `export const <name> = <value>;` out of the TypeScript source. */
function tsConst(name) {
  const match = tsSource.match(new RegExp(`export const ${name}[^=]*=\\s*([^;]+);`));
  assert.ok(match, `${name} is no longer declared in print-file-preflight.ts — the port has drifted`);
  return match[1].trim();
}

test("the spec id matches the TypeScript source", () => {
  assert.equal(tsConst("PRINT_FILE_SPEC_ID"), `"${PRINT_FILE_SPEC_ID}"`);
});

test("the numeric floors match the TypeScript source", () => {
  assert.equal(tsConst("MIN_IMPLIED_DPI"), String(MIN_IMPLIED_DPI));
  assert.equal(tsConst("PIXEL_FLOOR_SHORT_EDGE"), String(PIXEL_FLOOR_SHORT_EDGE));
  assert.equal(tsConst("MAX_COMPARE_FILES"), String(MAX_COMPARE_FILES));
  assert.equal(tsConst("MAX_BYTES"), "50 * 1024 * 1024");
  assert.equal(MAX_BYTES, 50 * 1024 * 1024);
  assert.equal(tsConst("DEFAULT_COMPARE_SIZE"), `"${DEFAULT_COMPARE_SIZE}"`);
});

test("the disclaimer is word-for-word the one the app ships", () => {
  // This string travels inside every exported record, so a divergence would
  // put two different liability positions in front of two sets of users.
  assert.ok(
    tsSource.includes(PREFLIGHT_DISCLAIMER),
    "PREFLIGHT_DISCLAIMER no longer matches the TypeScript source verbatim",
  );
});

test("the named print sizes match the TypeScript source", () => {
  const block = tsSource.match(/const PRINT_SIZES[^=]*=\s*\{([\s\S]*?)\};/);
  assert.ok(block, "PRINT_SIZES not found in the TypeScript source");
  const declared = [...block[1].matchAll(/"(\d+x\d+)"\s*:/g)].map((m) => m[1]);
  assert.deepEqual(declared, listPrintSizes());
});

test("the web-export filename tokens match the TypeScript source", () => {
  const block = tsSource.match(/const WEB_FILENAME_TOKENS\s*=\s*\[([^\]]+)\]/);
  const ours = ourSource.match(/const WEB_FILENAME_TOKENS\s*=\s*\[([^\]]+)\]/);
  assert.ok(block && ours, "WEB_FILENAME_TOKENS not found in one of the two sources");
  const tokens = (text) => [...text.matchAll(/"([a-z]+)"/g)].map((m) => m[1]);
  assert.deepEqual(tokens(ours[1]), tokens(block[1]));
});

test("every rule the TypeScript emits is one this port can also emit", () => {
  // The ranking table and the exported record both key off these rule ids, so
  // a rule added upstream and not here would be silently absent from a record
  // an artist hands to a printer.
  const upstream = new Set([...tsSource.matchAll(/rule:\s*"([a-z_]+)"/g)].map((m) => m[1]));
  const ours = new Set([...ourSource.matchAll(/rule:\s*"([a-z_]+)"/g)].map((m) => m[1]));
  assert.ok(upstream.size >= 5, "expected the upstream rule set to be non-trivial");
  for (const rule of upstream) assert.ok(ours.has(rule), `preflight.mjs never emits "${rule}"`);
});
