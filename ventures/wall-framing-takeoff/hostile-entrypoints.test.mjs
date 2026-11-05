// Public entry points given null, text or numbers instead of their object refuse with a reason
// (found 2026-11-05 by calling every export with null; before, a raw TypeError). Invented inputs only.
import test from "node:test";
import assert from "node:assert/strict";
import { planFromIfc, parseStep } from "./ifc.mjs";
import { levelBids } from "./bidlevel.mjs";
import { slabConcrete } from "./slab.mjs";
import { sheathe } from "./sheathing.mjs";

for (const bad of [null, undefined, 5, "x", []]) {
  test(`slabConcrete refuses ${JSON.stringify(bad)}`, () => {
    const r = slabConcrete(/** @type {any} */ (bad));
    assert.equal(r.ok, false);
    assert.ok(r.errors.length);
  });
  test(`sheathe refuses ${JSON.stringify(bad)}`, () => {
    const r = sheathe(/** @type {any} */ (bad), /** @type {any} */ (bad));
    assert.equal(r.ok, false);
    assert.ok(r.errors.length);
  });
  test(`levelBids refuses a budget of ${JSON.stringify(bad)}`, () => {
    const r = levelBids(/** @type {any} */ (bad), []);
    assert.equal(r.ok, false);
    assert.ok(r.errors.length);
  });
}
for (const bad of [null, undefined, 5, {}]) {
  test(`planFromIfc refuses ${JSON.stringify(bad)}`, () => {
    const r = planFromIfc(/** @type {any} */ (bad));
    assert.equal(r.ok, false);
    assert.ok(r.errors.length);
    assert.doesNotThrow(() => parseStep(/** @type {any} */ (bad)));
  });
}
