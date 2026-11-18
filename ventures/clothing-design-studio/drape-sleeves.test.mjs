// Split out of drape.test.mjs (2026-11-13) so `node --test` runs this drape on its own core; the test is unchanged.
import test from "node:test";
import assert from "node:assert/strict";
import { drapeGarment } from "./drape.mjs";

test("sleeves: sewn into the armholes they skim the arm, and the old half-width sleeve is caught stretched round it", () => {
  const me = { chest: 100, waist: 88, hip: 98, height: 178 };
  const r = drapeGarment(me, { garment: "tee", size: "M" });
  assert.equal(r.ok, true);
  assert.equal(r.sleeves.length, 2);
  assert.equal(r.checks.verticesInsideBody, 0);
  assert.ok(r.checks.seamGapCm < 1, `seam gap ${r.checks.seamGapCm}`);
  assert.equal(r.checks.settled, true);
  for (const s of r.sleeves) {
    const bicep = s.levels.find(l => l.where === "bicep");
    assert.ok(bicep.hoopStrainPct < 3, JSON.stringify(bicep));
    // a 22 cm tee sleeve (shoulder point to cuff) ends well above the elbow
    assert.ok(s.cuffAboveElbowCm > 5, String(s.cuffAboveElbowCm));
  }
  // the pre-2026-11-13 sleeve: the flat bicep (about 12 cm at M) drawn as the full width
  const old = drapeGarment(me, { garment: "tee", size: "M", pattern: { bicepCm: 12 } });
  const oldBicep = old.sleeves[0].levels.find(l => l.where === "bicep");
  assert.ok(oldBicep.hoopStrainPct > 15 && oldBicep.touchingPct === 100, JSON.stringify(oldBicep));
  assert.match(old.notes.join(" "), /sleeve is stretched more than 8% round the bicep/);
  // a tight tee: with sleeves the chest still takes the tape arithmetic's 8-16%, and the sleeves are tight too
  const xs = drapeGarment(me, { garment: "tee", size: "XS", fit: "slim" });
  assert.equal(xs.checks.settled, true);
  assert.equal(xs.checks.verticesInsideBody, 0);
  const xc = xs.levels.find(l => l.where === "chest").hoopStrainPct;
  assert.ok(xc > 8 && xc < 16, String(xc));
  // the regular tee's yoke (above the armholes) stays nearly unstretched: the garment hangs from the shoulders
  let yA = 0, yE = 0;
  for (let q = 0; q < r.cloth.triOffs[2]; q++) {
    const t = r.cloth.tris[q], y = (r.pos[3 * t[0] + 1] + r.pos[3 * t[1] + 1] + r.pos[3 * t[2] + 1]) / 3;
    if (y < 1.40) continue;
    yA += r.strain[q].area; yE += r.strain[q].area * r.strain[q].ex;
  }
  assert.ok(yE / yA < 0.05, `yoke stretch ${(100 * yE / yA).toFixed(1)}%`);
  assert.ok(xs.sleeves[0].levels.find(l => l.where === "bicep").hoopStrainPct > 8);
  // body panels only, as before sleeves: no arms, no sleeve numbers
  const bare = drapeGarment(me, { garment: "tee", size: "M", sleeves: false, gridCm: 3.5 });
  assert.equal(bare.sleeves.length, 0);
  assert.equal(bare.body.arms, null);
});
