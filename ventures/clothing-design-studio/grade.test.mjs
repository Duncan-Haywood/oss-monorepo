import test from "node:test";
import assert from "node:assert/strict";
import { neckAndShoulder, gradeRule, anchorChest, GRADE_PER_CM_CHEST } from "./grade.mjs";
import { draft, grade } from "./pattern.mjs";
import { specSheet, sampleCheck } from "./spec.mjs";
import { patternPieces } from "./marker.mjs";
import { garmentMeasurements } from "./fit.mjs";

const SIZES = ["XS", "S", "M", "L", "XL", "XXL"];
const GARMENTS = ["tee", "longsleeve", "crewneck", "hoodie"];

// The 2026-11-22 quality audit: a sample sewn from the studio's pattern failed the studio's spec on shoulder
// (5 of 6 sizes) and neck (5 of 6). Measure the drafted stitch lines independently and check them against the spec.
test("a sample sewn exactly to the drafted pattern passes the spec sheet on shoulder and neck, every garment, size and fit", () => {
  for (const garment of GARMENTS) for (const fit of ["slim", "regular", "relaxed", "oversized"]) {
    const spec = specSheet({ garment, fit });
    for (const size of SIZES) {
      const d = draft(garment, size, { fit });
      assert.ok(d.ok, `${garment} ${size} ${fit}: ${d.error}`);
      const front = d.pieces.find(p => p.name === "front");
      // the neck/shoulder corner and the shoulder point are on the stitch ring; read them off it, not off the block
      const shoulderPt = front.notches.find(n => n.label === "shoulder").at;
      const neckCorner = front.stitch.filter(p => Math.abs(p[1]) < 1e-9).reduce((a, p) => (p[0] > 0 && p[0] < shoulderPt[0] && p[0] > a ? p[0] : a), 0);
      const sewn = { shoulder: Math.round(20 * shoulderPt[0]) / 10, neck: Math.round(20 * neckCorner) / 10 };
      const c = sampleCheck(spec, size, sewn);
      for (const id of ["shoulder", "neck"]) assert.equal(c.rows.find(r => r.id === id).verdict, "pass", `${garment} ${fit} ${size} ${id}: sewn ${sewn[id]} vs spec ${spec.sizes[size][id]}`);
    }
  }
});

test("grade steps: neck +0.64 cm and across shoulder +1.76 cm per 8 cm chest step from M (when the armhole floor does not bind)", () => {
  const g = grade("tee", SIZES, { fit: "oversized" }); // oversized ease leaves room for the armhole in every size
  const row = label => g.table.find(r => r.label === label);
  for (const v of row("Neck width (stitch line)").steps) assert.ok(Math.abs(v - 0.64) < 0.011, `neck step ${v}`);
  for (const v of row("Across shoulder").steps) assert.ok(Math.abs(v - 1.76) < 0.011, `shoulder step ${v}`);
  assert.equal(g.monotone, true);
  assert.ok(g.drafts.every(d => !d.checks.shoulderSetByArmhole));
});

test("size M keeps the block's old figures (the grade starts there)", () => {
  const g = garmentMeasurements("tee", "regular").M;
  const ns = neckAndShoulder(g);
  assert.equal(ns.neckWidthCm, 18);                      // 2 x 0.09 x 100
  assert.ok(Math.abs(ns.acrossShoulderCm - 47.4) < 1e-9); // 2 x (22.5 + 1.2)
  assert.equal(neckAndShoulder(garmentMeasurements("hoodie", "regular").M, { garment: "hoodie" }).neckWidthCm, 21);
});

test("where the armhole floor sets the shoulder, the pattern says so and the spec prints the same figure", () => {
  const d = draft("tee", "XS"); // regular: half chest 24, so the shoulder point stops at 20 from the fold
  assert.equal(d.checks.shoulderSetByArmhole, true);
  assert.equal(d.checks.acrossShoulderCm, 40);
  assert.ok(d.notes.some(n => /armhole at least 4 cm/.test(n)));
  assert.equal(specSheet({ garment: "tee" }).sizes.XS.shoulder, 40);
  assert.equal(draft("tee", "L").checks.shoulderSetByArmhole, false);
});

test("a factory's grade rule replaces the typical one in pattern and spec together", () => {
  const grade0 = { neck: 0, shoulder: 0.3 };
  const spec = specSheet({ garment: "tee", fit: "relaxed", grade: grade0 });
  assert.deepEqual(SIZES.map(s => spec.sizes[s].neck), [18, 18, 18, 18, 18, 18]);
  assert.ok(Math.abs(spec.sizes.L.shoulder - spec.sizes.M.shoulder - 2.4) < 1e-9);
  assert.equal(draft("tee", "L", { fit: "relaxed", grade: grade0 }).checks.acrossShoulderCm, spec.sizes.L.shoulder);
  assert.throws(() => gradeRule({ sleeve: 1 }), /Unknown grade/);
  assert.throws(() => specSheet({ grade: { neck: -1 } }), /0 to 0.6/);
  assert.equal(draft("tee", "M", { grade: { neck: 2 } }).ok, false);
  assert.equal(GRADE_PER_CM_CHEST.neck, 0.08);
});

test("custom size chart: the grade starts from its M, or its middle size", () => {
  assert.equal(anchorChest({ XS: 80, S: 88, M: 96, L: 104 }), 96);
  assert.equal(anchorChest({ S: 88, L: 104, XL: 112 }), 104);
});

test("neckband: tee, long sleeve and crewneck get one, sized off the whole neck seam; the hoodie's hood takes the neck", () => {
  for (const garment of ["tee", "longsleeve", "crewneck"]) for (const size of ["XS", "M", "XXL"]) {
    const d = draft(garment, size);
    const band = d.pieces.find(p => p.name === "neckband");
    assert.ok(band, `${garment} ${size}`);
    assert.equal(band.qty, 1);
    assert.ok(band.simple);
    // the whole neck seam = 2 x (half front neck + half back neck); walk the neck runs of the stitch rings
    assert.ok(Math.abs(d.checks.neckbandLengthCm / d.checks.neckOpeningCm - 0.85) < 0.002);
    // cut strip: band length and double width, plus seam allowance all round
    assert.ok(Math.abs(band.bbox.w - (d.checks.neckbandLengthCm + 2)) < 0.02, `${band.bbox.w}`);
    assert.ok(Math.abs(band.bbox.h - (2 * d.checks.neckbandWidthCm + 2)) < 0.02, `${band.bbox.h}`);
    assert.ok(d.notes.some(n => n.startsWith("Neckband:")));
  }
  assert.equal(draft("hoodie", "M").pieces.find(p => p.name === "neckband"), undefined);
  // a neck opening must pass over a head: about 56-60 cm round for an adult; the M tee opening is in a plausible range
  const m = draft("tee", "M").checks;
  assert.ok(m.neckOpeningCm > 44 && m.neckOpeningCm < 56, `${m.neckOpeningCm}`);
});

test("the cutting plan's neck band is the drafted one", () => {
  for (const size of ["XS", "M", "XXL"]) {
    const nb = patternPieces("tee", size).find(p => p.name === "neck band");
    const d = draft("tee", size).checks;
    assert.ok(Math.abs(nb.l - (d.neckbandLengthCm + 3)) < 0.06, `${size}: marker ${nb.l} vs drafted ${d.neckbandLengthCm}`);
  }
});

test("armhole depth grades +0.96 cm per 8 cm chest step from M, and M keeps 0.235 x chest + 0.1 x ease (quality audit 2026-11-22, defect 1)", () => {
  for (const garment of ["tee", "longsleeve", "crewneck", "hoodie"]) {
    const gm = garmentMeasurements(garment, "regular");
    const M = gm.M, ease = M.chest - M.bodyChest;
    assert.ok(Math.abs(neckAndShoulder(M, { garment }).armholeDepthCm - (0.235 * 100 + 0.1 * ease)) < 1e-9, garment);
    const ad = ["XS", "S", "M", "L", "XL", "XXL"].map(s => draft(garment, s).block.ad);
    for (let i = 1; i < ad.length; i++) assert.ok(Math.abs(ad[i] - ad[i - 1] - 0.96) < 1e-9, `${garment} step ${i}: ${ad[i] - ad[i - 1]}`);
  }
  assert.ok(Math.abs(neckAndShoulder(garmentMeasurements("tee", "regular").XXL, { grade: { armhole: 0.2 } }).armholeDepthCm - (23.5 + 1.2 + 0.2 * 24)) < 1e-9);
  assert.throws(() => gradeRule({ armhole: 1 }), /0 to 0.6/);
});

test("the drafted sleeve length matches the spec sheet's graded sleeve in every garment and size (quality audit 2026-11-22, defect 0)", () => {
  for (const garment of ["tee", "longsleeve", "crewneck", "hoodie"]) {
    const sp = specSheet({ garment });
    for (const s of ["XS", "S", "M", "L", "XL", "XXL"]) {
      const d = draft(garment, s);
      assert.ok(Math.abs(d.checks.sleeveLengthCm - sp.sizes[s].sleeve) < 0.05, `${garment} ${s}: pattern ${d.checks.sleeveLengthCm} vs spec ${sp.sizes[s].sleeve}`);
    }
  }
});
