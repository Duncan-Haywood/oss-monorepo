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
