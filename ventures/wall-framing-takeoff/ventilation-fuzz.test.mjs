import { test } from "node:test";
import assert from "node:assert/strict";
import { samplePlan } from "./engine.mjs";
import { layoutRoof, sampleRoof } from "./roof.mjs";
import { layoutVentilation, ventilationText } from "./ventilation.mjs";

// Property test: random roofs and vent settings are refused with a reason, or
// give vent counts whose label area meets the required area, with the ridge
// share capped by the ridge that exists and no negative quantities.
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

test("fuzz: random roofs and vent settings meet the required area or are refused with a reason", () => {
  const plan = { ...samplePlan(), walls: [] };
  let laid = 0, refused = 0;
  const failures = [];
  for (let seed = 1; seed <= 300; seed++) {
    const rand = rng(seed);
    const roofIn = { ...sampleRoof(), width: pick(rand, [240, 288, 336, 420]), length: pick(rand, [300, 480, 600, 840]), pitch: pick(rand, [4, 6, 8, 12]), shape: pick(rand, ["gable", "hip"]) };
    if (roofIn.shape === "hip") roofIn.hip = "2x8";
    const roof = layoutRoof(roofIn, plan);
    if (!roof.ok) continue;
    const v = {
      ratio: pick(rand, [150, 300]),
      ridgeVent: rand() < 0.7,
      ridgeNfaPerFt: pick(rand, [9, 12, 18, 20]),
      soffitUnitNfa: pick(rand, [30, 56, 70]),
      soffitUnitWidth: pick(rand, [8, 16, 24]),
      soffitFill: pick(rand, [0.25, 0.5, 1]),
      ridgeEndGap: pick(rand, [0, 12, 36]),
      upperShare: pick(rand, [0.4, 0.5, 0.7]),
    };
    let s;
    try { s = layoutVentilation(v, roof); } catch (e) { failures.push(`seed ${seed}: threw ${e.message}`); continue; }
    if (!s.ok) { refused++; if (!s.errors?.length) failures.push(`seed ${seed}: refused with no reason`); continue; }
    laid++;
    const eps = 1e-6;
    if (s.providedSqIn + eps < s.requiredSqIn) failures.push(`seed ${seed}: provided ${s.providedSqIn} < required ${s.requiredSqIn}`);
    if (s.ridgeFeetUsed > s.ridgeVentFeet + eps) failures.push(`seed ${seed}: ridge used exceeds ridge available`);
    if (s.ridgePieces < 0 || s.soffitUnits < 0 || s.baffles < 0 || s.lowerSqIn < -eps) failures.push(`seed ${seed}: negative quantity`);
    if (s.ridgePieces * s.ridgePiece + eps < s.ridgeFeetUsed * 12) failures.push(`seed ${seed}: ridge pieces too short`);
    if (!s.soffitFits && !s.notes.some((n) => /can take vents/.test(n))) failures.push(`seed ${seed}: soffit does not fit and no note says so`);
    if (!ventilationText(s).join("\n").includes("Required:")) failures.push(`seed ${seed}: text did not build`);
  }
  assert.deepEqual(failures, []);
  assert.ok(laid > 50, `laid ${laid}`);
});
