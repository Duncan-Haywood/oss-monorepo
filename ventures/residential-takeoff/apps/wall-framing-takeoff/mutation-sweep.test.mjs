// Single-field mutation sweep: set every leaf of the sample plan, one at a time, to a
// hostile value. validatePlan must either refuse with a reason or accept, and an accepted
// plan must go through takeoff without a throw, a hang or a NaN. Invented plan only.
import test from "node:test";
import assert from "node:assert/strict";
import { samplePlan, validatePlan, takeoff } from "./engine.mjs";

const VALUES = [null, "x", -1, 0, NaN, Infinity, {}, [], true, 0.5];

function leafPaths(o, p = []) {
  if (o && typeof o === "object") return Object.keys(o).flatMap((k) => leafPaths(o[k], [...p, k]));
  return [p];
}

test("mutation sweep: no hostile single field throws, hangs or gives NaN", () => {
  const base = samplePlan();
  const bad = [];
  let accepted = 0;
  for (const path of leafPaths(base)) {
    for (const v of VALUES) {
      const plan = structuredClone(base);
      let o = plan;
      for (const k of path.slice(0, -1)) o = o[k];
      o[path.at(-1)] = v;
      const label = `${path.join(".")}=${String(v)}`;
      try {
        const errs = validatePlan(plan);
        if (!Array.isArray(errs) || errs.length) continue;
        accepted++;
        const t = takeoff(plan);
        if (/NaN|Infinity/.test(JSON.stringify(t, (_k, x) => (typeof x === "number" && !Number.isFinite(x) ? "NaN" : x)))) bad.push(`${label}: non-finite output`);
      } catch (e) {
        bad.push(`${label}: ${e.message.slice(0, 60)}`);
      }
    }
  }
  assert.ok(accepted > 50, "sweep should accept some mutations (e.g. 0 or 0.5 on free fields)");
  assert.deepEqual(bad, []);
});
