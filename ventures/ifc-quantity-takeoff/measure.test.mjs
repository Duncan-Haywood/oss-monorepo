// The small-void rule, checked against hand calculations on the sample model
// (Wall A: 5.0 x 3.0 m side, 0.2 m thick, one 1.0 x 2.1 m door opening) and
// on rows built by hand for the cases the sample does not have.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseStep } from "./step.mjs";
import { takeoff, boq, boqCsv, rowQuantities } from "./qto.mjs";
import { applyRule, ruleActive, PRESETS } from "./measure.mjs";

const sample = () => takeoff(parseStep(readFileSync(new URL("./samples/sample-office.ifc", import.meta.url))));
const close = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} vs ${b}`);

test("each opening's own deduction is cut: the door takes 2.1 m2 and 0.42 m3 out of Wall A", () => {
  const a = sample().rows.find((r) => r.name === "Wall A");
  assert.equal(a.computed.voids.length, 1);
  close(a.computed.voids[0].volume, 1 * 2.1 * 0.2);
  close(a.computed.areas.side.voids[0], 1 * 2.1);
});

test("a threshold under the door leaves Wall A as modelled; one over it leaves the door in", () => {
  const res = sample();
  const a = res.rows.find((r) => r.name === "Wall A");
  const q = rowQuantities(a);
  const under = applyRule(a, q, PRESETS.small);
  close(under.area, 12.9); close(under.volume, 2.58); assert.equal(under.voidsLeft, 0);
  const over = applyRule(a, q, { areaMax: 2.5, volumeMax: 0.5 });
  close(over.area, 15); close(over.volume, 3.0); assert.equal(over.voidsLeft, 1);
  // an area rule alone moves only the area
  const areaOnly = applyRule(a, q, { areaMax: 2.5, volumeMax: 0 });
  close(areaOnly.area, 15); close(areaOnly.volume, 2.58);
});

test("the BoQ line and its CSV carry the rule", () => {
  const rows = sample().rows;
  const rule = { areaMax: 2.5, volumeMax: 0.5 };
  const walls = boq(rows, ["class"], rule).find((l) => l.key[0] === "IfcWall");
  const plain = boq(rows, ["class"]).find((l) => l.key[0] === "IfcWall");
  close(walls.area - plain.area, 2.1); close(walls.volume - plain.volume, 0.42);
  assert.equal(walls.voidsLeft, 1);
  const csv = boqCsv(boq(rows, ["class"], rule), ["class"], {}, rule);
  assert.match(csv.split("\r\n")[0], /Voids not deducted \(area up to 2.5 m2, volume up to 0.5 m3\)/);
  assert.doesNotMatch(boqCsv(plain ? [plain] : [], ["class"]), /Voids not deducted/);
  assert.equal(ruleActive(PRESETS.all), false);
});

// a hand-made row: a 10 x 3 m wall, 0.2 thick, with a 0.3 m2 sleeve and a 2 m2 window
const handRow = (stored, areaVoids = [0.3, 2], volVoids = [0.06, 0.4]) => ({
  ifcType: "IFCWALL", stored, check: null, areaCheck: null,
  computed: { status: "ok", openings: 2, gross: 6, net: 6 - volVoids.reduce((a, b) => a + b, 0), voids: volVoids.map((volume, i) => ({ id: i + 1, volume })),
    areas: { side: { gross: 30, net: 30 - areaVoids.reduce((a, b) => a + b, 0), voids: areaVoids } } },
});

test("a stored net figure gets the small void added back", () => {
  const r = handRow({ NetSideArea: { kind: "area", value: 27.7 }, NetVolume: { kind: "volume", value: 5.54 } });
  const m = applyRule(r, rowQuantities(r), { areaMax: 0.5, volumeMax: 0.1 });
  close(m.area, 28); close(m.volume, 5.6); assert.equal(m.voidsLeft, 1);
});

test("a stored gross figure gets only the large opening taken out", () => {
  const r = handRow({ GrossSideArea: { kind: "area", value: 30 } });
  r.check = { gross: { agree: true } };
  r.stored.GrossVolume = { kind: "volume", value: 6 };
  const m = applyRule(r, rowQuantities(r), { areaMax: 0.5, volumeMax: 0.1 });
  close(m.area, 28); close(m.volume, 5.6);
});

test("overlapping openings are left as modelled and say so", () => {
  // two openings that each take 2 m2 but 3 m2 together
  const r = handRow({}, [2, 2], [0.4, 0.4]);
  r.computed.areas.side.net = 27; r.computed.net = 5.4;
  const m = applyRule(r, rowQuantities(r), { areaMax: 2.5, volumeMax: 0.5 });
  close(m.area, 27); close(m.volume, 5.4);
  assert.equal(m.voidsLeft, 0);
  assert.match(m.ruleNotes.join(" "), /overlap/);
});

test("a stored figure whose basis is unknown is used as it is", () => {
  const r = handRow({ Area: { kind: "area", value: 29 } });
  const m = applyRule(r, rowQuantities(r), { areaMax: 0.5, volumeMax: 0 });
  close(m.area, 29);
  assert.match(m.ruleNotes.join(" "), /basis/);
});

test("two overlapping openings are taken out once: a 10 x 1 x 3 m wall less 1-3 m and 2-4 m openings 2 m high is 24 m3", async () => {
  const G = await import("./geom.mjs");
  const box = (x0, y0, z0, x1, y1, z1) => G.solid([{ s: 1, faces: G.prism([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], [0, 0, z1 - z0]).map((f) => f.map((p) => [p[0], p[1], p[2] + z0])) }]);
  let net = box(0, 0, 0, 10, 1, 3);
  for (const o of [box(1, -1, 0, 3, 2, 2), box(2, -1, 0, 4, 2, 2)]) net = G.subtractCutters(net, G.cuttersOf(o), "opening");
  close(G.solidVolume(net), 30 - 3 * 1 * 2);
});
