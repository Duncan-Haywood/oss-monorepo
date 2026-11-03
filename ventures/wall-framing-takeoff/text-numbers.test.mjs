// A number given as text ("96") passed the range checks by coercion in several validators.
// Every numeric field of each sample must be refused when turned into a string.
import { test } from "node:test";
import assert from "node:assert/strict";
import { samplePlan, validatePlan } from "./engine.mjs";
import { sampleDeck, validateDeck } from "./deck.mjs";
import { sampleDrywall, validateDrywall } from "./drywall.mjs";
import { sampleFloor, validateFloor } from "./floor.mjs";

const clone = (x) => JSON.parse(JSON.stringify(x));
const leaves = (o, p = []) => (o && typeof o === "object" ? Object.keys(o).flatMap((k) => leaves(o[k], [...p, k])) : typeof o === "number" ? [p] : []);
const bad = (r) => (Array.isArray(r) ? r.length > 0 : r?.ok === false);

for (const [name, sample, check] of [
  ["plan", samplePlan, (x) => validatePlan(x)],
  ["deck", sampleDeck, (x) => validateDeck(x)],
  ["drywall", sampleDrywall, (x) => validateDrywall(x)],
  ["floor", sampleFloor, (x) => validateFloor(x, samplePlan())],
]) {
  test(`${name}: the sample is valid`, () => assert.ok(!bad(check(clone(sample())))));
  test(`${name}: any numeric field given as text is refused`, () => {
    const s = sample();
    const leaks = [];
    for (const p of leaves(s)) {
      const x = clone(s);
      let o = x;
      for (const k of p.slice(0, -1)) o = o[k];
      o[p.at(-1)] = String(o[p.at(-1)]);
      let r;
      try { r = check(x); } catch { r = ["threw"]; }
      if (!bad(r)) leaks.push(p.join("."));
    }
    assert.deepEqual(leaks, []);
  });
}
