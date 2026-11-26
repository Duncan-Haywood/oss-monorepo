import { test } from "node:test";
import assert from "node:assert/strict";
import { layoutCmu, validateCmu, cmuText } from "./cmu.mjs";

// Property test: random block-wall sets are refused with a reason, or lay out
// with totals that tie to the per-wall rows and to closed-form bounds.
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

test("fuzz: random CMU wall sets lay out consistently or are refused with a reason", () => {
  let laid = 0, refused = 0;
  const failures = [];
  for (let seed = 1; seed <= 400; seed++) {
    const rand = rng(seed);
    const walls = [];
    const nw = 1 + Math.floor(rand() * 6);
    for (let i = 0; i < nw; i++) {
      const w = { length: rand() < 0.1 ? 1 + rand() * 20 : 40 + rand() * 900, height: 24 + rand() * 200 };
      if (rand() < 0.5) w.openings = Array.from({ length: Math.floor(rand() * 4) }, () => ({ width: 10 + rand() * 120, height: 10 + rand() * 120 }));
      walls.push(w);
    }
    const d = { walls };
    if (rand() < 0.4) d.thickness = pick(rand, [4, 6, 8, 10, 12, 7]);
    if (rand() < 0.3) d.barSpacing = pick(rand, [8, 16, 32, 48, 96, 192, 4]);
    if (rand() < 0.3) d.bar = pick(rand, [3, 4, 5, 6, 7, 8, 9]);
    if (rand() < 0.3) d.bondBeamEvery = pick(rand, [0, 3, 6, 12]);
    if (rand() < 0.3) d.jointReinfCourses = pick(rand, [0, 2, 3]);
    if (rand() < 0.3) d.waste = pick(rand, [0, 0.05, 0.2, 0.6]);
    if (rand() < 0.2) d.blockPrice = 2.5;
    let r;
    try { r = layoutCmu(d); } catch (e) { failures.push(`seed ${seed}: threw ${e.message}`); continue; }
    const errs = validateCmu(d);
    if (!r.ok) { refused++; if (!r.errors?.length || !errs.length) failures.push(`seed ${seed}: refused with no reason`); continue; }
    if (errs.length) failures.push(`seed ${seed}: validate/layout disagree`);
    laid++;
    for (const k of ["blocks", "mortarBags", "groutCuFt", "groutYd", "rebarLb", "verticalBars", "ladderFt"]) {
      if (!Number.isFinite(r[k]) || r[k] < 0) failures.push(`seed ${seed}: bad ${k} ${r[k]}`);
    }
    const sumBlocks = r.walls.reduce((s, w) => s + w.blocks, 0);
    if (Math.abs(sumBlocks - r.blocksNet) > 0.01 * r.walls.length + 0.01) failures.push(`seed ${seed}: wall blocks ${sumBlocks} vs ${r.blocksNet}`);
    if (r.walls.reduce((s, w) => s + w.courses, 0) !== r.courses) failures.push(`seed ${seed}: courses do not add`);
    if (r.walls.reduce((s, w) => s + w.bars, 0) !== r.verticalBars) failures.push(`seed ${seed}: bars do not add`);
    if (r.blocks < r.blocksNet - 1e-9) failures.push(`seed ${seed}: order below net`);
    if (r.groutOrderCuFt + 0.01 < r.groutCuFt) failures.push(`seed ${seed}: grout order below net`);
    if (r.netSqFt > r.faceSqFt + 0.01) failures.push(`seed ${seed}: net above face`);
    if (r.mortarBags * (d.blocksPerMortarBag ?? 35) < r.blocks) failures.push(`seed ${seed}: too few mortar bags`);
    if (d.blockPrice == null && d.mortarBagPrice == null && r.cost !== null) failures.push(`seed ${seed}: cost without price`);
    try { if (cmuText(r).length < 1) failures.push(`seed ${seed}: empty text`); } catch (e) { failures.push(`seed ${seed}: text threw ${e.message}`); }
  }
  assert.deepEqual(failures, []);
  assert.ok(laid >= 100, `only ${laid} laid out (${refused} refused)`);
  assert.ok(refused >= 10, `only ${refused} refused`);
});
