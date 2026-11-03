import { test } from "node:test";
import assert from "node:assert/strict";
import { samplePlan } from "./engine.mjs";
import { layoutDrywall, drywallText } from "./drywall.mjs";

// Property test: random drywall settings on the sample house either come back
// ok:false with a reason or lay out with sheets bought covering the net area,
// finishing quantities positive, and a text report that does not throw.
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

test("fuzz: random drywall settings lay out consistently or are refused with a reason", () => {
  const plan = samplePlan();
  let laid = 0, refused = 0;
  const failures = [];
  for (let seed = 1; seed <= 300; seed++) {
    const rand = rng(seed);
    const d = {
      sheetLength: pick(rand, [96, 108, 120, 144, 192, 100]),
      waste: rand() * 0.35,
      faces: rand() < 0.3 ? "both" : "inside",
      jointsOnStuds: rand() < 0.5,
      ceiling: Array.from({ length: Math.floor(rand() * 3) }, () => ({
        width: 20 + Math.floor(rand() * 300), depth: 20 + Math.floor(rand() * 300),
        ...(rand() < 0.3 ? { steps: [{ length: 10 + Math.floor(rand() * 200), drop: 2 + Math.floor(rand() * 50) }] } : {}),
      })),
    };
    if (rand() < 0.5) d.ceilingJoistSpacing = pick(rand, [12, 16, 19.2, 24]);
    let l;
    try { l = layoutDrywall(d, plan); } catch (e) { failures.push(`seed ${seed}: threw ${e.message}`); continue; }
    if (!l.ok) { refused++; if (!l.errors?.length) failures.push(`seed ${seed}: refused with no reason`); continue; }
    laid++;
    if (!(l.sheets.count > 0)) failures.push(`seed ${seed}: no sheets`);
    if (l.boughtSqFt + 1e-6 < l.netSqFt) failures.push(`seed ${seed}: bought ${l.boughtSqFt} < net ${l.netSqFt}`);
    const f = l.finishing;
    if (!(f.tapeFt > 0 && f.tapeRolls > 0 && f.compoundPails > 0)) failures.push(`seed ${seed}: finishing not positive`);
    if (l.bandSheets.reduce((s, b) => s + b.sheets, 0) !== l.sheets.count) failures.push(`seed ${seed}: band sheets do not add`);
    try { if (!drywallText(l).length) failures.push(`seed ${seed}: empty text`); } catch (e) { failures.push(`seed ${seed}: text threw ${e.message}`); }
  }
  assert.deepEqual(failures.slice(0, 5), []);
  assert.ok(laid > 50 && refused > 0, `${laid} laid, ${refused} refused`);
});
