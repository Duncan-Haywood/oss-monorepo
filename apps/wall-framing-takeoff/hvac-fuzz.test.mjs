import { test } from "node:test";
import assert from "node:assert/strict";
import { layoutHvac, hvacText } from "./hvac.mjs";

// Seeded property test on invented HVAC inputs (some hostile): refused with a
// reason, or every total equals an independent hand recount and nothing is NaN.
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

test("fuzz: random HVAC inputs are recounted by hand or refused with a reason", () => {
  const failures = [];
  let laid = 0, refused = 0;
  for (let seed = 1; seed <= 400; seed++) {
    const rand = rng(seed);
    const rooms = [];
    const n = Math.floor(rand() * 5);
    for (let i = 0; i < n; i++) {
      const r = { id: `R${i}` };
      if (rand() < 0.7) r.supplyFt = rand() < 0.04 ? pick(rand, [-1, 1e9, "5", NaN]) : pick(rand, [0, 8, 15, 22]);
      if (rand() < 0.5) r.returnFt = pick(rand, [0, 10, 20]);
      if (rand() < 0.3) r.count = rand() < 0.05 ? pick(rand, [0, 1.5, 101]) : pick(rand, [1, 2, 3]);
      if (rand() < 0.2) r.registers = pick(rand, [0, 1, 2]);
      if (rand() < 0.2) r.fittings = pick(rand, [0, 2, 5]);
      rooms.push(r);
    }
    const d = { rooms };
    if (rand() < 0.5) d.trunkFt = pick(rand, [0, 12, 40, 2001]);
    if (rand() < 0.3) d.waste = pick(rand, [0, 0.1, 0.5, 0.6]);
    if (rand() < 0.3) d.supportSpacingFt = pick(rand, [4, 5, 0.1]);
    if (rand() < 0.3) { d.tapeFtPerDuctFt = pick(rand, [0, 0.5, 2]); d.tapeRollFt = pick(rand, [60, 150]); }
    if (rand() < 0.3) { d.flexRollPrice = 30; d.trunkPrice = 12; d.bootPrice = 8; }
    let t;
    try { t = layoutHvac(d); } catch (e) { failures.push(`seed ${seed}: threw ${e.message}`); continue; }
    if (!t.ok) { refused++; if (!t.errors?.length) failures.push(`seed ${seed}: refused with no reason`); continue; }
    laid++;
    const bad = [];
    let sup = 0, ret = 0, regs = 0, boots = 0, grilles = 0, fit = d.trunkFittings ?? 0;
    for (const r of rooms) {
      const c = r.count ?? 1;
      const rg = c * (r.registers ?? ((r.supplyFt ?? 0) > 0 ? 1 : 0));
      sup += c * (r.supplyFt ?? 0); ret += c * (r.returnFt ?? 0); regs += rg; boots += rg;
      grilles += c * ((r.returnFt ?? 0) > 0 ? 1 : 0); fit += c * (r.fittings ?? 0);
    }
    const waste = d.waste ?? 0.1, trunk = d.trunkFt ?? 0;
    const eq = (a, b, what) => { if (Math.abs(a - b) > 1e-6) bad.push(`${what}: ${a} vs ${b}`); };
    eq(t.supplyFt, sup, "supply"); eq(t.returnFt, ret, "return"); eq(t.registers, regs, "registers");
    eq(t.boots, boots, "boots"); eq(t.returnGrilles, grilles, "grilles"); eq(t.fittings, fit, "fittings");
    if (t.flexRolls * 25 + 1e-6 < (sup + ret) * (1 + waste)) bad.push("flex rolls do not cover the duct");
    if (t.trunkSticks * 5 + 1e-6 < trunk * (1 + waste)) bad.push("trunk sticks do not cover the trunk");
    if (!(sup + ret) && t.flexRolls) bad.push("rolls without flex duct");
    for (const k of ["supports", "tapeRolls", "flexRolls", "trunkSticks", "ductFt"]) if (!Number.isFinite(t[k]) || t[k] < 0) bad.push(`bad ${k}`);
    if (t.cost != null && !Number.isFinite(t.cost)) bad.push("cost not finite");
    if (d.flexRollPrice == null && t.cost !== null) bad.push("cost without prices");
    try { if (!hvacText(t).length) bad.push("empty text"); } catch (e) { bad.push(`text threw ${e.message}`); }
    if (bad.length) failures.push(`seed ${seed}: ${bad.join("; ")}`);
  }
  assert.deepEqual(failures.slice(0, 5), []);
  assert.ok(laid > 50 && refused > 5, `laid ${laid}, refused ${refused}`);
});
