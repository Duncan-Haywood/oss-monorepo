import { test } from "node:test";
import assert from "node:assert/strict";
import { misspeltPlanKeys, misspeltPlanKeysNote } from "./planKeys.mjs";
import { main } from "./cli.mjs";
import { samplePlan } from "./engine.mjs";

test("a misspelt engine key is named with its likely spelling", () => {
  const f = misspeltPlanKeys({ walls: [], studSpaceing: 24, wallHeight: "8'" });
  assert.deepEqual(f, [{ name: "studSpaceing", didYouMean: "studSpacing" }]);
});
test("known keys, far-off extras and non-objects are left alone", () => {
  assert.deepEqual(misspeltPlanKeys(samplePlan()), []);
  assert.deepEqual(misspeltPlanKeys({ walls: [], notes: "hi", client: "Ana" }), []);
  assert.deepEqual(misspeltPlanKeys(null), []);
  assert.deepEqual(misspeltPlanKeys([]), []);
  assert.equal(misspeltPlanKeysNote([]), "");
});
test("the CLI text report carries the note and stays 0; JSON output is not prefixed", () => {
  const plan = { ...samplePlan(), studSpaceing: 24 };
  const text = main(["plan.json"], () => JSON.stringify(plan));
  assert.equal(text.code, 0);
  assert.match(text.out, /^Note: this plan key is not read.*studSpaceing \(did you mean studSpacing\?\)/);
  const clean = main(["plan.json"], () => JSON.stringify(samplePlan()));
  assert.doesNotMatch(clean.out, /did you mean/);
  const json = main(["plan.json", "--json"], () => JSON.stringify(plan));
  if (/^\s*[\[{]/.test(json.out)) assert.doesNotThrow(() => JSON.parse(json.out));
});

// Red team 2026-11-26: `headerTables` and `paver` are read by the engines but were not in KNOWN_PLAN_KEYS, so a
// correct plan was told its key "is not read and looks misspelt" (and the CLI skipped per-stud header tables).
// This scans every module for the top-level `plan.<key>` reads and checks none of them is called a misspelling,
// so the next engine that reads a new key fails here instead of telling its users they made a typo.
test("no key an engine reads is reported as misspelt", async () => {
  const { readdirSync, readFileSync } = await import("node:fs");
  const dir = new URL(".", import.meta.url);
  const read = new Set();
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".mjs") && !f.endsWith(".test.mjs"))) {
    for (const m of readFileSync(new URL(f, dir), "utf8").matchAll(/\bplan\.([A-Za-z_]\w*)/g)) read.add(m[1]);
  }
  assert.ok(read.has("walls") && read.has("headerTables"), "the scan found the engines' plan reads");
  assert.deepEqual(misspeltPlanKeys(Object.fromEntries([...read].map((k) => [k, 1]))), []);
});
