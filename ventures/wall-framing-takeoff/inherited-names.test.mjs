import { test } from "node:test";
import assert from "node:assert/strict";
import { layoutFloor, sampleFloor } from "./floor.mjs";
import { layoutDeck, sampleDeck } from "./deck.mjs";

// Size names such as "toString" are properties of every object; a lookup with `in`
// accepted them and the layout then threw. They must be refused with a reason.
test("inherited property names are refused as lumber sizes, not accepted or thrown on", () => {
  for (const name of ["toString", "constructor", "__proto__"]) {
    const f = { ...sampleFloor(), joist: name };
    const r = layoutFloor(f, { stock: [{ size: "2x10", length: 192, price: 20 }] });
    assert.equal(r.ok, false, `floor ${name}`);
    const d = layoutDeck({ ...sampleDeck(), joist: name });
    assert.equal(d.ok, false, `deck ${name}`);
  }
});
