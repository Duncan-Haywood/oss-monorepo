// Every list inside a plan section (drywall.ceiling, a ceiling's steps, a wall's openings, ...) given
// an object, text, [null] or [5] instead: main() returns an exit code and a message, never a raw
// TypeError. Found 2026-11-25 (red team): a drywall ceiling of {} or a step list of [null] crashed the
// CLI with a stack trace. cli-fuzz.test.mjs swaps top-level values only, so it never reached these.
// New sections: add their sample to SECTIONS and the sweep covers their lists. Invented plans only.
import test from "node:test";
import assert from "node:assert/strict";
import { main } from "./cli.mjs";
import { samplePlan } from "./engine.mjs";
import { sampleDeck } from "./deck.mjs";
import { sampleFloor } from "./floor.mjs";
import { sampleFoundation } from "./foundation.mjs";
import { sampleRoof } from "./roof.mjs";
import { sampleStair } from "./stairs.mjs";

const SECTIONS = { deck: sampleDeck(), floor: sampleFloor(), foundation: sampleFoundation(), roof: sampleRoof(), stairs: sampleStair(), drywall: { ceiling: [{ width: 240, depth: 192, steps: [{ length: 96, drop: 12 }] }] },
  // sections with no sample of their own: the smallest input each report accepts
  hvac: { rooms: [{ supplyFt: 10, returnFt: 5 }] }, plumbing: { fixtures: [{ id: "x", drainFt: 10, coldFt: 100 }] },
  wallTile: { surfaces: [{ width: 60, height: 72 }] }, flooring: { rooms: [{ width: 144, depth: 180, kind: "plank" }] },
  drilling: { runs: [{ wall: "Front", kind: "bore", size: 1 }] }, dormer: { shape: "shed", width: 144, eaveHeight: 48, pitch: 3 } };
const FLAGS = ["--floor", "--deck", "--stairs", "--roof", "--fasteners", "--ventilation", "--gutters", "--dormer", "--eaves", "--siding", "--electrical", "--drilling", "--trim", "--flooring", "--paint", "--openings", "--insulation", "--drywall", "--foundation", "--sheathing", "--budget", "--hvac", "--plumbing", "--wall-tile", "--fireblock"];
const base = { ...samplePlan(), ...SECTIONS };
const clone = (/** @type {any} */ x) => JSON.parse(JSON.stringify(x));

/** Paths to every array in the plan, two levels into objects and into each array's first object element. */
function listPaths(/** @type {any} */ o, /** @type {(string|number)[]} */ pre = [], depth = 0) {
  /** @type {(string|number)[][]} */
  const out = [];
  if (!o || typeof o !== "object" || depth > 2) return out;
  for (const [k, v] of Object.entries(o)) {
    const p = [...pre, k];
    if (Array.isArray(v)) {
      out.push(p);
      if (v[0] && typeof v[0] === "object") out.push(...listPaths(v[0], [...p, 0], depth + 1));
    } else if (v && typeof v === "object") out.push(...listPaths(v, p, depth + 1));
  }
  return out;
}

const paths = listPaths(base);
test("the unbroken plan runs every report", () => {
  const r = main(["plan.json", ...FLAGS], () => JSON.stringify(base));
  assert.equal(r.code, 0, r.out.slice(0, 400));
  assert.match(r.out, /DRYWALL/);
});
test("the sweep reaches the nested lists it was written for", () => {
  const keys = paths.map((p) => p.join("."));
  for (const k of ["drywall.ceiling", "drywall.ceiling.0.steps", "walls", "walls.0.openings"]) assert.ok(keys.includes(k), k);
});

for (const p of paths) {
  test(`${p.join(".")} given the wrong shape: a message, not a crash`, () => {
    for (const bad of [{}, "x", [null], [5]]) {
      const plan = clone(base);
      let t = plan;
      for (const k of p.slice(0, -1)) t = t[k];
      t[p[p.length - 1]] = bad;
      const r = main(["plan.json", ...FLAGS], () => JSON.stringify(plan));
      assert.equal(typeof r.code, "number", JSON.stringify(bad));
      assert.equal(typeof r.out, "string", JSON.stringify(bad));
    }
  });
}
