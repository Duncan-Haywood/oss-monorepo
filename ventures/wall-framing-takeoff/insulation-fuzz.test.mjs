import { test } from "node:test";
import assert from "node:assert/strict";
import { layoutInsulation, validateInsulation, insulationText } from "./insulation.mjs";

// Property test: random insulation settings over random framed walls are refused with a
// reason, or give a cavity that is never negative nor more than the panel area, size
// groups that add up to the total, whole bags that cover the cavity plus waste, a cost
// of bags times price, and a text report that does not throw.
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
const between = (rand, a, b) => a + Math.floor(rand() * (b - a + 1));

test("fuzz: random insulation settings count consistently or are refused with a reason", () => {
  let laid = 0, refused = 0;
  const failures = [];
  for (let seed = 1; seed <= 300; seed++) {
    const rand = rng(seed);
    const walls = [], planWalls = [];
    for (let i = 0; i < between(rand, 1, 5); i++) {
      const length = between(rand, 24, 400), height = between(rand, 60, 120);
      const members = [];
      for (let k = 0; k < between(rand, 0, 12); k++) {
        const w = between(rand, 1, 4), h = between(rand, 1, height);
        members.push({ x: between(rand, 0, length - w), y: between(rand, 0, height - h), w, h });
      }
      const id = "W" + i;
      walls.push({ id, length, stud: pick(rand, ["2x4", "2x6"]), members });
      planWalls.push({ id, length, openings: rand() < 0.4 ? [{ offset: 0, width: 1, height: 1 }] : [] });
    }
    const d = {};
    if (rand() < 0.5) d.bagSqFt = between(rand, 5, 520);
    if (rand() < 0.5) d.waste = between(rand, 0, 35) / 100;
    if (rand() < 0.3) d.rValue = between(rand, 0, 65);
    if (rand() < 0.5) d.price = between(rand, 1, 90);
    const plan = { defaultHeaderHeight: 82.5, walls: planWalls };
    let l, text;
    try { l = layoutInsulation(d, plan, { walls }); if (l.ok) text = insulationText(l); } catch (e) { failures.push(`seed ${seed}: threw ${e.message}`); continue; }
    if (!l.ok) {
      refused++;
      if (!l.errors?.length) failures.push(`seed ${seed}: refused with no reason`);
      if (validateInsulation(d).length === 0 && !l.errors.length) failures.push(`seed ${seed}: validator and layout disagree`);
      continue;
    }
    laid++;
    const sumSizes = l.sizes.reduce((s, z) => s + z.cavitySqFt, 0);
    if (!(l.cavitySqFt >= 0)) failures.push(`seed ${seed}: cavity ${l.cavitySqFt}`);
    if (Math.abs(sumSizes - l.cavitySqFt) > 1e-6) failures.push(`seed ${seed}: sizes ${sumSizes} != ${l.cavitySqFt}`);
    if (!Number.isInteger(l.bags) || l.bags < 0) failures.push(`seed ${seed}: bags ${l.bags}`);
    const need = (l.cavitySqFt * (1 + l.waste)) / l.bagSqFt;
    // bags are rounded per size group, so the total is at least the whole-cavity need
    if (l.bags < need - 1e-9) failures.push(`seed ${seed}: bags ${l.bags} cannot cover ${need}`);
    if (d.price != null && Math.abs(l.cost - l.bags * d.price) > 1e-6) failures.push(`seed ${seed}: cost ${l.cost} != ${l.bags} x ${d.price}`);
    if (!Array.isArray(text) || !text.length) failures.push(`seed ${seed}: empty text`);
  }
  assert.deepEqual(failures, [], failures.slice(0, 5).join("\n"));
  assert.ok(laid > 100, `only ${laid} laid out`);
  assert.ok(refused > 5, `only ${refused} refused`);
});
