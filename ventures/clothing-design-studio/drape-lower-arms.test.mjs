// Split out of drape.test.mjs (2026-11-13) so `node --test` runs this drape on its own core; the test is unchanged.
import test from "node:test";
import assert from "node:assert/strict";
import { drapeGarment } from "./drape.mjs";

test("garment drape: lowerArms sews at 45 then swings the arms down, sleeves carried with them", () => {
  const me = { chest: 100, waist: 88, hip: 98, height: 178 };
  const r = drapeGarment(me, { size: "L", gridCm: 4, lowerArms: true });
  assert.equal(r.ok, true);
  assert.equal(r.sewAngleDeg, 45);
  assert.ok(r.body.armAngleDeg < 35, String(r.body.armAngleDeg));
  assert.ok(r.checks.seamGapCm < 1, String(r.checks.seamGapCm));
  // the sleeve came down with the arm: its cuff row sits round the lowered arm, not where the 45-degree arm was
  const s = r.sleeves[0];
  assert.ok(s.cuffFromShoulderCm > 15 && s.cuffFromShoulderCm < 40, JSON.stringify(s));
  assert.ok(s.levels.find(l => l.where === "bicep").clearanceCm < 3);
  assert.match(r.notes.join(" "), /lowered to \d+/);
  // a fixed angle can be asked for too
  const r2 = drapeGarment(me, { size: "L", gridCm: 4, lowerArms: 35, settleTime: 1.2 });
  assert.equal(r2.body.armAngleDeg, 35);
});
