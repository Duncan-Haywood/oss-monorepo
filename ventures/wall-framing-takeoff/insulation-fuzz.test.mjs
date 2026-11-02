import { test } from "node:test";
import assert from "node:assert/strict";
import { samplePlan, layoutWall } from "./engine.mjs";
import { layoutInsulation, insulationText } from "./insulation.mjs";

// Property test: for random bag, waste, R and price settings over the sample
// plan's laid walls, insulation is refused with a reason or gives bags that
// cover the cavity plus waste, a cavity never above the panel area, and no
// negative quantities. Out-of-range settings must always be refused.
function rng(seed) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (rand, xs) => xs[Math.floor(rand() * xs.length)];

test("fuzz: insulation bags cover the cavity plus waste, or settings are refused with a reason", () => {
  const plan = samplePlan();
  const result = { walls: plan.walls.map((w) => layoutWall(plan, w)) };
  let laid = 0, refused = 0;
  const failures = [];
  for (let seed = 1; seed <= 300; seed++) {
    const rand = rng(seed);
    const d = {
      bagSqFt: pick(rand, [5, 40, 88, 106, 500, 600]),
      waste: pick(rand, [0, 0.05, 0.15, 0.3, 0.5]),
      rValue: pick(rand, [undefined, 13, 15, 21, 61, -1]),
      price: pick(rand, [undefined, 0, 45.5]),
    };
    const valid = (d.bagSqFt >= 10 && d.bagSqFt <= 500) && d.waste <= 0.3 && (d.rValue == null || (d.rValue > 0 && d.rValue <= 60));
    let s;
    try { s = layoutInsulation(d, plan, result); } catch (e) { failures.push(`seed ${seed}: threw ${e.message}`); continue; }
    if (!s.ok) {
      refused++;
      if (!s.errors?.length) failures.push(`seed ${seed}: refused with no reason`);
      if (valid) failures.push(`seed ${seed}: valid settings refused`);
      continue;
    }
    laid++;
    if (!valid) failures.push(`seed ${seed}: invalid settings accepted`);
    const eps = 1e-6;
    if (s.cavitySqFt < -eps || s.bags < 0 || s.openingSqFt < -eps) failures.push(`seed ${seed}: negative quantity`);
    if (s.bags * d.bagSqFt + eps < s.cavitySqFt * (1 + d.waste)) failures.push(`seed ${seed}: bags do not cover cavity plus waste`);
    if (s.framingShare < 0 || s.framingShare > 1 + eps) failures.push(`seed ${seed}: framing share ${s.framingShare}`);
    if (d.price != null && Math.abs(s.cost - s.bags * d.price) > eps) failures.push(`seed ${seed}: cost != bags x price`);
    if (!insulationText(s).join("\n").includes("bags")) failures.push(`seed ${seed}: text did not build`);
  }
  assert.deepEqual(failures, []);
  assert.ok(laid > 50 && refused > 20, `laid ${laid}, refused ${refused}`);
});
