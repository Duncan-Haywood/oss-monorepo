import test from "node:test";
import assert from "node:assert/strict";
import { specSheet, sampleCheck, sampleComments, TOLERANCE_CM } from "./spec.mjs";
import { techPack, techPackHtml } from "./techpack.mjs";
import { newDesign } from "./design.mjs";

test("regular tee M: 56 cm half chest (100 body + 12 ease, halved), 71 cm long, 21 cm sleeve", () => {
  const m = specSheet({ garment: "tee" }).sizes.M;
  assert.equal(m.chest, 56);
  assert.equal(m.hem, 56);
  assert.equal(m.length, 71);
  assert.equal(m.sleeve, 21);
  assert.equal(m.shoulder, 45.9); // 112 x 0.41 = 45.92
});
test("sizes step: chest +4 cm flat per size, sleeve +1 cm", () => {
  const s = specSheet({ garment: "tee" }).sizes;
  assert.equal(s.L.chest - s.M.chest, 4);
  assert.equal(s.L.sleeve - s.M.sleeve, 1);
  assert.equal(s.S.sleeve, 20);
});
test("the factory's sleeve figure replaces the typical one", () => {
  const spec = specSheet({ garment: "longsleeve", sleeveCm: 61 });
  assert.equal(spec.sizes.M.sleeve, 61);
  assert.ok(!spec.notes.some(n => /typical figure/.test(n)));
  assert.ok(specSheet({ garment: "longsleeve" }).notes.some(n => /typical figure/.test(n)));
});
test("hoodie is wider than a tee at the same fit", () => {
  assert.equal(specSheet({ garment: "hoodie" }).sizes.M.chest - specSheet({ garment: "tee" }).sizes.M.chest, 4);
});
test("tolerance override and validation", () => {
  assert.equal(specSheet({ tolerances: { chest: 2 } }).points.find(p => p.id === "chest").tolCm, 2);
  assert.equal(TOLERANCE_CM.chest, 1);
  assert.throws(() => specSheet({ tolerances: { sock: 1 } }), /Unknown point/);
  assert.throws(() => specSheet({ tolerances: { chest: 0 } }), /Tolerance/);
  assert.throws(() => specSheet({ sleeveCm: 2 }), /Sleeve/);
});
test("sample check: exactly on tolerance passes, just over fails, direction is named", () => {
  const spec = specSheet({ garment: "tee" });
  const c = sampleCheck(spec, "M", { chest: 57, hem: 54.9, length: 71, sleeve: 21, shoulder: 45.9, neck: 18 });
  assert.equal(c.rows.find(r => r.id === "chest").verdict, "pass"); // +1.0 = tolerance
  assert.equal(c.rows.find(r => r.id === "hem").verdict, "under"); // -1.1
  assert.equal(c.rows.find(r => r.id === "hem").diff, -1.1);
  assert.equal(c.approved, false);
  assert.match(c.comments[0], /1\.1 cm too small/);
});
test("a full pass is approved; missing points block approval but are not failures", () => {
  const spec = specSheet({ garment: "tee" });
  const all = { ...spec.sizes.M };
  assert.equal(sampleCheck(spec, "M", all).approved, true);
  const part = sampleCheck(spec, "M", { chest: 56 });
  assert.equal(part.approved, false);
  assert.deepEqual(part.missing, ["hem", "length", "sleeve", "shoulder", "neck"]);
  assert.match(part.summary, /5 not measured/);
  assert.match(sampleComments(part, "tee"), /Not measured: hem/);
});
test("sample check rejects junk", () => {
  const spec = specSheet({});
  assert.throws(() => sampleCheck(spec, "M", { chest: -3 }), /number of cm/);
  assert.throws(() => sampleCheck(spec, "XXXL", {}), /No spec/);
});
test("the tech pack carries the spec for the design's garment and its HTML prints the table", () => {
  const d = newDesign({ name: "Spec <tee>" });
  const p = techPack(d);
  assert.ok(p.spec.sizes.M.chest > 0);
  const html = techPackHtml(d, p);
  assert.match(html, /Measurements \(finished garment, flat, cm\)/);
  assert.match(html, /1\/2 chest/);
  assert.match(html, /\+\/-1/);
});
