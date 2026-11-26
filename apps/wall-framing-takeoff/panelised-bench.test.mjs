import { test } from "node:test";
import assert from "node:assert/strict";
import { measure } from "./panelised-bench.mjs";
import { samplePlan, takeoff } from "./engine.mjs";

const plain = () => ({ studSpacing: 16, studLength: 96, kerf: 0.125, topPlateLap: 24, cornerExtraStuds: 2, teeExtraStuds: 2, defaultHeaderHeight: 82.5,
  stock: [8, 10, 12, 14, 16].map((f) => ({ size: "2x4", length: f * 12, price: f })), walls: [{ id: "A", length: 240, stud: "2x4" }] });

test("a 20 ft plain wall at a 128 in limit (no cut line falls on exactly 120): two panels, one seam, site nails by hand", () => {
  const m = measure(plain(), [128], 16);
  assert.ok(m.ok);
  const row = m.rows[0];
  assert.equal(row.panels, 2);
  assert.equal(row.seams, 1);
  // bottom plate to floor 17 and cap plate to top plate 17 (fasteners.mjs counts ceil(len/16)+1 per plate piece; the 20 ft plate is two pieces),
  // one seam down the 100.5 in wall: ceil(100.5/16) = 7 face nails
  assert.equal(row.siteNails, 17 + 17 + 7);
  assert.equal(m.stick.handled, m.members);
});

test("example house: fewer things handled, more saw cuts, fewer site nails than stick", () => {
  const m = measure(samplePlan());
  assert.ok(m.ok);
  for (const r of m.rows) {
    assert.ok(r.handled < m.stick.handled);
    assert.ok(r.cuts >= m.stick.cuts);
    assert.ok(r.siteNails < m.stick.siteNails);
  }
  // a longer limit never needs more panels
  assert.ok(m.rows.every((r, i) => i === 0 || r.panels <= m.rows[i - 1].panels));
  assert.equal(takeoff(samplePlan()).walls.reduce((t, w) => t + w.members.length, 0), m.members);
});
