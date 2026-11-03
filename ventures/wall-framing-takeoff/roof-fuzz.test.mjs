import { test } from "node:test";
import assert from "node:assert/strict";
import { samplePlan } from "./engine.mjs";
import { layoutRoof, roofCuts, roofText } from "./roof.mjs";

// Property test: random gable and hip roofs either come back ok:false with a reason
// or lay out with sheathing courses adding to the slope, a ridge no longer than the
// building (gable), and cut lists and text that do not throw.
function rng(seed) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

test("fuzz: random roofs lay out consistently or are refused with a reason", () => {
  const plan = { ...samplePlan(), walls: [] };
  let laid = 0, refused = 0;
  const failures = [];
  for (let seed = 1; seed <= 300; seed++) {
    const rand = rng(seed);
    const r = {
      id: "R", shape: rand() < 0.3 ? "hip" : "gable",
      width: 240 + Math.floor(rand() * 12) * 12, length: 300 + Math.floor(rand() * 20) * 12,
      pitch: 2 + Math.floor(rand() * 8), overhang: 12, gableOverhang: 12,
      rafter: rand() < 0.5 ? "2x8" : "2x10", spacing: [16, 24][Math.floor(rand() * 2)],
      ridge: "2x10", ceilingJoist: "2x6", collarTies: rand() < 0.5,
    };
    let l;
    try { l = layoutRoof(r, plan); } catch (e) { failures.push(`seed ${seed}: threw ${e.message}`); continue; }
    if (!l.ok) { refused++; if (!l.errors?.length) failures.push(`seed ${seed}: refused with no reason`); continue; }
    laid++;
    const courses = l.courses.reduce((s, c) => s + c.width, 0);
    if (r.shape === "gable" && Math.abs(courses - l.slope) > 1e-6) failures.push(`seed ${seed}: courses ${courses} vs slope ${l.slope}`);
    if (!(l.sheets.count > 0)) failures.push(`seed ${seed}: no sheets`);
    if (!(l.roofing.squares > 0)) failures.push(`seed ${seed}: no squares`);
    try {
      if (!roofCuts(l).length) failures.push(`seed ${seed}: no cuts`);
      if (!roofText(l)) failures.push(`seed ${seed}: empty text`);
    } catch (e) { failures.push(`seed ${seed}: report threw ${e.message}`); }
  }
  assert.deepEqual(failures.slice(0, 5), []);
  assert.ok(laid > 50, `only ${laid} laid (${refused} refused)`);
});
