// Every settings validator answers null, a number, a string or an array with an error list instead of throwing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateInsulation } from "./insulation.mjs";
import { validateTrim } from "./trim.mjs";
import { validateSiding } from "./siding.mjs";
import { validateGutters } from "./gutters.mjs";
import { validateEaves } from "./eaves.mjs";
import { validateFasteners } from "./fasteners.mjs";
import { validateDeck } from "./deck.mjs";
import { validateDormer } from "./dormer.mjs";
import { validateDrywall } from "./drywall.mjs";

const all = { validateInsulation, validateTrim, validateSiding, validateGutters, validateEaves, validateFasteners, validateDeck, validateDormer, validateDrywall };
for (const [name, fn] of Object.entries(all)) {
  test(`${name} returns an error for wrong-shaped input`, () => {
    for (const bad of [null, undefined, 5, "x", []]) {
      const r = fn(/** @type {any} */ (bad));
      assert.ok(Array.isArray(r) && r.length === 1, `${name}(${JSON.stringify(bad)})`);
    }
  });
}
