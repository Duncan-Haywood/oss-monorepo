import { test } from "node:test";
import assert from "node:assert/strict";
import { layoutHvac } from "./hvac.mjs";
import { layoutPlumbing } from "./plumbing.mjs";
import { layoutWallTile } from "./walltile.mjs";

// A room, fixture or surface name that is not text (a number, Infinity, an
// object, a list) used to pass and reach the result, where it printed as
// "[object Object]" or saved as null. Invented inputs only.
const badNames = [Infinity, NaN, 5, {}, [], true, "x".repeat(81)];

test("hvac refuses a room id or name that is not short text", () => {
  for (const v of badNames) for (const k of ["id", "name"]) {
    const r = layoutHvac({ rooms: [{ [k]: v, supplyFt: 10 }] });
    assert.equal(r.ok, false, `${k}=${String(v).slice(0, 5)}`);
    assert.ok(r.errors[0].includes(k));
  }
  assert.equal(layoutHvac({ rooms: [{ id: "Kitchen", supplyFt: 10 }] }).ok, true);
});

test("plumbing refuses a fixture id or name that is not short text", () => {
  for (const v of badNames) for (const k of ["id", "name"]) {
    const r = layoutPlumbing({ fixtures: [{ [k]: v, drainFt: 5 }] });
    assert.equal(r.ok, false, `${k}=${String(v).slice(0, 5)}`);
  }
  assert.equal(layoutPlumbing({ fixtures: [{ id: "Sink", drainFt: 5 }] }).ok, true);
});

test("wall tile refuses a surface name that is not short text", () => {
  for (const v of badNames) {
    const r = layoutWallTile({ surfaces: [{ name: v, width: 60, height: 72 }] });
    assert.equal(r.ok, false, String(v).slice(0, 5));
  }
  assert.equal(layoutWallTile({ surfaces: [{ name: "Shower back", width: 60, height: 72 }] }).ok, true);
});
