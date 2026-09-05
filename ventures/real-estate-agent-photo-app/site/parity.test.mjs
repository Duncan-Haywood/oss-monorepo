/**
 * Holds this ESM port to the TypeScript rule set it was copied from.
 *
 * The repo has learned this lesson twice already, both times expensively:
 * CLAUDE.md records that copying `build.mjs`'s entry-candidate list into the
 * front-door mirror froze the other half of the rule in place, and seven
 * finished pages were public nowhere as a result. A copied constant cannot
 * know when its original changes.
 *
 * Importing across the boundary is not available here — the TypeScript lives
 * in a Next.js app with its own build, which is the whole reason this port
 * exists — so the next best thing is to read the source as text and assert the
 * numbers still agree. If someone raises the resolution floor in one place,
 * this fails instead of the site quietly serving two different specs.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  ALLOWED_FORMATS,
  ASPECT_RATIOS,
  ASPECT_TOLERANCE,
  BRANDING_FILENAME_TOKENS,
  MAX_BYTES,
  MIN_LONG_EDGE_PX,
  SPEC_DATE,
  SPEC_ID,
  STAGING_TOKENS,
  UNIMPLEMENTED_RULES,
} from "./photo-spec.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const tsSource = readFileSync(path.join(here, "..", "research", "src", "lib", "photo-spec.ts"), "utf8");

/** Pulls `export const <name> = <value>;` out of the TypeScript source. */
function tsConst(name) {
  const match = tsSource.match(new RegExp(`export const ${name}[^=]*=\\s*([^;]+);`));
  assert.ok(match, `${name} is no longer declared in photo-spec.ts — the port has drifted from its source`);
  return match[1].trim();
}

test("the spec id and date match the TypeScript source", () => {
  assert.equal(tsConst("SPEC_ID"), `"${SPEC_ID}"`);
  assert.equal(tsConst("SPEC_DATE"), `"${SPEC_DATE}"`);
});

test("the numeric floors match the TypeScript source", () => {
  assert.equal(tsConst("MIN_LONG_EDGE_PX"), String(MIN_LONG_EDGE_PX));
  assert.equal(tsConst("MAX_BYTES"), "20 * 1024 * 1024");
  assert.equal(MAX_BYTES, 20 * 1024 * 1024);
  assert.equal(tsConst("ASPECT_TOLERANCE"), String(ASPECT_TOLERANCE));
});

test("the accepted formats match the TypeScript source", () => {
  const declared = [...tsConst("ALLOWED_FORMATS").matchAll(/"([a-z]+)"/g)].map((m) => m[1]);
  assert.deepEqual(declared.sort(), [...ALLOWED_FORMATS].sort());
});

test("the accepted aspect ratios match the TypeScript source", () => {
  const declared = [...tsConst("ASPECT_RATIOS").matchAll(/\[\s*(\d+)\s*,\s*(\d+)\s*\]/g)]
    .map((m) => [Number(m[1]), Number(m[2])]);
  assert.deepEqual(declared, ASPECT_RATIOS.map(([w, h]) => [w, h]));
});

test("the branding and staging filename tokens match the TypeScript source", () => {
  const branding = [...tsConst("BRANDING_FILENAME_TOKENS").matchAll(/"([a-z-]+)"/g)].map((m) => m[1]);
  assert.deepEqual(branding, [...BRANDING_FILENAME_TOKENS]);

  const staging = [...tsConst("STAGING_TOKENS").matchAll(/"([a-z-]+)"/g)].map((m) => m[1]);
  assert.deepEqual(staging, [...STAGING_TOKENS]);
});

test("the disclosed unimplemented rules match the TypeScript source", () => {
  const declared = [...tsConst("UNIMPLEMENTED_RULES").matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
  assert.deepEqual(declared, [...UNIMPLEMENTED_RULES]);
});

test("every rule the TypeScript emits is one this port can also emit", () => {
  // The findings table on the page and the exported record both key off these
  // rule ids, so a rule added upstream and not here would be silently absent
  // from a record an agent files against a listing.
  const upstream = new Set([...tsSource.matchAll(/rule:\s*"([a-z_]+)"/g)].map((m) => m[1]));
  const ours = new Set(
    [...readFileSync(path.join(here, "photo-spec.mjs"), "utf8").matchAll(/rule:\s*"([a-z_]+)"/g)].map((m) => m[1]),
  );
  for (const rule of upstream) assert.ok(ours.has(rule), `photo-spec.mjs never emits "${rule}"`);
});
