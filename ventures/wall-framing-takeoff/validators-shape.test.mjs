// Every validate* function returns an error list, not an exception, for a body that is not an object.
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateDeck } from "./deck.mjs";
import { validateDormer } from "./dormer.mjs";
import { validateDrywall } from "./drywall.mjs";
import { validateEaves } from "./eaves.mjs";
import { validateFloor } from "./floor.mjs";
import { validateGutters } from "./gutters.mjs";
import { validateInsulation } from "./insulation.mjs";
import { validateSiding } from "./siding.mjs";
import { validateStair } from "./stairs.mjs";
import { validateTrim } from "./trim.mjs";
import { validateRoof } from "./roof.mjs";
import { validateFasteners } from "./fasteners.mjs";

const fns = { validateDeck, validateDormer, validateDrywall, validateEaves, validateFloor, validateGutters, validateInsulation, validateSiding, validateStair, validateTrim, validateRoof, validateFasteners };
for (const [name, fn] of Object.entries(fns)) {
  test(`${name} returns errors for null, a number, a string and a list`, () => {
    for (const bad of [null, undefined, 42, "x", []]) {
      const r = /** @type {any} */ (fn)(bad);
      assert.ok(Array.isArray(r) && r.length === 1 && typeof r[0] === "string", `${name}(${JSON.stringify(bad)})`);
    }
  });
}
