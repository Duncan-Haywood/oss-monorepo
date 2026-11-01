import { test } from "node:test";
import assert from "node:assert/strict";
import { samplePlan } from "./engine.mjs";
import { layoutFloor, floorCuts } from "./floor.mjs";

// Property test: random floors either come back ok:false with a reason or lay out
// with joists no longer than the longest board, rims covering the width, and sheets bought.
function rng(seed) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

test("fuzz: random floors lay out within board length or are refused with a reason", () => {
  const plan = { ...samplePlan(), walls: [] };
  let laid = 0, refused = 0;
  const failures = [];
  for (let seed = 1; seed <= 300; seed++) {
    const rand = rng(seed);
    const f = {
      id: "F", width: 120 + Math.floor(rand() * 60) * 12, depth: 120 + Math.floor(rand() * 30) * 12,
      joist: rand() < 0.5 ? "2x10" : "2x8", spacing: [12, 16, 19.2, 24][Math.floor(rand() * 4)], rim: rand() < 0.8, blockingRows: 0,
    };
    if (rand() < 0.6) f.beam = Math.round(f.depth * (0.3 + rand() * 0.4));
    let l;
    try { l = layoutFloor(f, plan); } catch (e) { failures.push(`seed ${seed}: threw ${e.message}`); continue; }
    if (!l.ok) { refused++; if (!l.errors?.length) failures.push(`seed ${seed}: refused with no reason`); continue; }
    laid++;
    const longest = Math.max(...plan.stock.filter((s) => s.size === f.joist).map((s) => s.length));
    if (l.joists.some((j) => j.length > longest + 1e-6)) failures.push(`seed ${seed}: joist over ${longest}`);
    if (!(l.sheets.count > 0)) failures.push(`seed ${seed}: no sheets`);
    if (f.rim) for (const side of ["front", "back"]) {
      const sum = l.rims.filter((r) => r.side === side).reduce((s, r) => s + r.length, 0);
      if (Math.abs(sum - f.width) > 1e-6) failures.push(`seed ${seed}: ${side} rim ${sum} vs ${f.width}`);
    }
    if (!floorCuts(l).length) failures.push(`seed ${seed}: no cuts`);
  }
  assert.deepEqual(failures.slice(0, 5), []);
  assert.ok(laid > 50, `only ${laid} laid (${refused} refused)`);
});
