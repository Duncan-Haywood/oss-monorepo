// A lumber list with a null entry, or no list at all, used to throw a raw
// TypeError out of --shallow-headers and --trim-openings. Found by probing
// by hand 2026-11-09. Invented plans only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { shallowHeaders, trimOpenings, doorsToFloor } from "./shallowheaders.mjs";

const mk = (stock) => ({
  studLength: 92.625,
  stock,
  walls: [{ id: "a", length: 100, openings: [{ kind: "door", offset: 5, width: 30, height: 80, header: "2x6" }] }],
});

for (const fn of [shallowHeaders, trimOpenings, doorsToFloor]) {
  test(`${fn.name}: null, non-object and non-list stock never throws`, () => {
    for (const stock of [[null], [undefined, 5, "x"], "2x6", 7, {}, undefined, null]) {
      assert.ok(Array.isArray(fn(mk(stock))), JSON.stringify(stock));
    }
  });
}

test("a null entry among real boards is skipped, real sizes still count", () => {
  const plan = mk([null, { size: "2x4" }, { size: "2x6" }]);
  plan.walls[0].openings[0].header = "2x12"; // too deep under the plates
  plan.defaultHeaderHeight = 85.5; // header bottom 85.5 + 11.25 deep is past the 94.125 plate line
  const notes = shallowHeaders(plan);
  assert.ok(notes.length >= 1);
  assert.notEqual(plan.walls[0].openings[0].header, "2x12");
});
