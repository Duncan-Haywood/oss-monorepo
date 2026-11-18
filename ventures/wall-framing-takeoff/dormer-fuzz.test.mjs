import { test } from "node:test";
import assert from "node:assert/strict";
import { layoutDormer, layoutShedDormer, dormerText } from "./dormer.mjs";

// Property test: random dormers are refused with a reason, or lay out with
// positive parts, geometry that ties to the closed-form rules, and text that builds.
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

test("fuzz: random gable and shed dormers lay out consistently or are refused with a reason", () => {
  let laid = 0, refused = 0;
  const failures = [];
  for (let seed = 1; seed <= 400; seed++) {
    const rand = rng(seed);
    const shed = rand() < 0.35;
    const d = {
      width: 24 + rand() * 230,
      eaveHeight: 20 + rand() * 80,
      pitch: shed ? 0.5 + rand() * 12 : 2 + rand() * 15,
      mainPitch: 2 + rand() * 15,
    };
    if (rand() < 0.4) d.spacing = pick(rand, [12, 16, 19.2, 24, 20]);
    if (rand() < 0.4) d.window = { width: 10 + rand() * 80, height: 10 + rand() * 50, sill: rand() * 50 };
    if (rand() < 0.4) d.roofOpening = rand() < 0.5 ? true : { depth: 8 + rand() * 240, mainSpacing: pick(rand, [12, 16, 19.2, 24, 30]) };
    let r;
    try { r = shed ? layoutShedDormer(d) : layoutDormer(d); } catch (e) { failures.push(`seed ${seed}: threw ${e.message}`); continue; }
    if (!r.ok) { refused++; if (!r.errors?.length) failures.push(`seed ${seed}: refused with no reason`); continue; }
    laid++;
    for (const p of r.parts) {
      if (!(p.count > 0) || !(p.length > 0) || !Number.isFinite(p.length)) failures.push(`seed ${seed}: bad part ${JSON.stringify(p)}`);
    }
    if (!(r.areas.roofSqFt > 0) || !(r.areas.wallSqFt > 0)) failures.push(`seed ${seed}: non-positive area`);
    if (!shed) {
      const g = r.geometry, rise = d.width / 2 * d.pitch / 12;
      if (Math.abs(g.cheekRunToEave - d.eaveHeight * 12 / d.mainPitch) > 0.04) failures.push(`seed ${seed}: cheek run off`);
      if (Math.abs(g.ridgeLength - (d.eaveHeight + rise) * 12 / d.mainPitch) > 0.04) failures.push(`seed ${seed}: ridge off`);
      if (g.ridgeLength + 1e-9 < g.cheekRunToEave) failures.push(`seed ${seed}: ridge shorter than cheek run`);
      if (r.counts.commons % 2 || r.counts.jacks % 2) failures.push(`seed ${seed}: odd common/jack count`);
    }
    if (r.opening && r.opening.cutMainRafters < 0) failures.push(`seed ${seed}: negative cut rafters`);
    try { if (dormerText(r).length < 1) failures.push(`seed ${seed}: empty text`); } catch (e) { failures.push(`seed ${seed}: text threw ${e.message}`); }
  }
  assert.deepEqual(failures, []);
  assert.ok(laid >= 40, `only ${laid} laid out (${refused} refused)`);
  assert.ok(refused >= 10, `only ${refused} refused`);
});
