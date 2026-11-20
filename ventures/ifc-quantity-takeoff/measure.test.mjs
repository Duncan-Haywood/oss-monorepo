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

// ---- thresholds per work section (2026-11-20) ----
import { sectionKey, ruleFor, ruleLabel, parseRule, SECTIONS } from "./measure.mjs";

test("each IFC class falls in one work section", () => {
  assert.equal(sectionKey("IFCWALLSTANDARDCASE"), "walls");
  assert.equal(sectionKey("IfcWallElementedCase"), "walls");
  assert.equal(sectionKey("IFCSLAB"), "slabs");
  assert.equal(sectionKey("IFCROOF"), "slabs");
  assert.equal(sectionKey("IFCCOVERING"), "coverings");
  assert.equal(sectionKey("IFCBEAM"), "frames");
  assert.equal(sectionKey("IFCMEMBER"), "frames");
  assert.equal(sectionKey("IFCDOOR"), "other");
  assert.equal(sectionKey(undefined), "other");
  assert.deepEqual(Object.keys(SECTIONS), ["walls", "slabs", "coverings", "frames", "other"]);
});

test("a section's own pair wins; a number it leaves out falls back to the rule's", () => {
  const rule = { areaMax: 0.5, volumeMax: 0.05, sections: { slabs: { areaMax: 0, volumeMax: 0.1 }, coverings: { areaMax: 1 } } };
  assert.deepEqual(ruleFor(rule, "IFCSLAB"), { areaMax: 0, volumeMax: 0.1 });
  assert.deepEqual(ruleFor(rule, "IFCCOVERING"), { areaMax: 1, volumeMax: 0.05 });
  assert.deepEqual(ruleFor(rule, "IFCWALL"), { areaMax: 0.5, volumeMax: 0.05 });
  assert.deepEqual(ruleFor(null, "IFCWALL"), { areaMax: 0, volumeMax: 0 });
  // a rule whose only non-zero numbers are in a section is still active
  assert.equal(ruleActive({ areaMax: 0, volumeMax: 0, sections: { slabs: { volumeMax: 0.05 } } }), true);
  assert.equal(ruleActive({ areaMax: 0, volumeMax: 0, sections: { slabs: { volumeMax: 0 } } }), false);
  assert.equal(ruleActive(PRESETS.sections), true);
});

test("the command line's text reads into a rule, and a typo is refused", () => {
  assert.deepEqual(parseRule("0.5,0.05").rule, { areaMax: 0.5, volumeMax: 0.05 });
  assert.deepEqual(parseRule("0.5,0.05; slabs=0,0.05;coverings = 0.5,0").rule, { areaMax: 0.5, volumeMax: 0.05, sections: { slabs: { areaMax: 0, volumeMax: 0.05 }, coverings: { areaMax: 0.5, volumeMax: 0 } } });
  assert.deepEqual(parseRule("frames=0,0.02").rule, { areaMax: 0, volumeMax: 0, sections: { frames: { areaMax: 0, volumeMax: 0.02 } } });
  assert.match(parseRule("beams=0,0.02").error, /unknown work section 'beams'/);
  assert.match(parseRule("0.5").error, /AREA_M2,VOLUME_M3/);
  assert.match(parseRule("slabs=-1,0").error, /slabs=0,0.05/);
});

test("the rule in words names each section that has its own pair", () => {
  assert.equal(ruleLabel(PRESETS.all), "every opening deducted");
  assert.equal(ruleLabel({ areaMax: 0.5, volumeMax: 0.05 }), "area up to 0.5 m2, volume up to 0.05 m3");
  assert.equal(ruleLabel(PRESETS.sections), "otherwise every opening deducted; Walls: area up to 0.5 m2, volume up to 0.05 m3; Slabs and roofs: area up to 0 m2, volume up to 0.05 m3; Coverings and finishes: area up to 0.5 m2, volume up to 0 m3; Beams, columns and members: area up to 0 m2, volume up to 0.05 m3");
});

test("a walls-only pair leaves the door in Wall A and nothing else moves", () => {
  const rows = sample().rows;
  const plain = boq(rows, ["class"]);
  const rule = { areaMax: 0, volumeMax: 0, sections: { walls: { areaMax: 2.5, volumeMax: 0.5 } } };
  const measured = boq(rows, ["class"], rule);
  for (const L of measured) {
    const P = plain.find((p) => p.key[0] === L.key[0]);
    if (L.key[0] === "IfcWall") { close(L.area - P.area, 2.1); close(L.volume - P.volume, 0.42); assert.equal(L.voidsLeft, 1); }
    else { close(L.area, P.area); close(L.volume, P.volume); assert.equal(L.voidsLeft, 0); }
  }
  // the same pair on slabs only leaves the walls as modelled
  const slabsOnly = boq(rows, ["class"], { areaMax: 0, volumeMax: 0, sections: { slabs: { areaMax: 2.5, volumeMax: 0.5 } } }).find((l) => l.key[0] === "IfcWall");
  close(slabsOnly.area, plain.find((p) => p.key[0] === "IfcWall").area);
  const csv = boqCsv(measured, ["class"], {}, rule);
  assert.match(csv.split("\r\n")[0], /Voids not deducted \(otherwise every opening deducted; Walls: area up to 2.5 m2, volume up to 0.5 m3\)/);
});

test("a hand-made slab takes the slabs' volume threshold, not the walls' area one", () => {
  // a 0.03 m3 sleeve (0.3 m2 in plan) and a 0.4 m3 shaft (2 m2)
  const slab = { ...handRow({ NetVolume: { kind: "volume", value: 5.57 } }, [0.3, 2], [0.03, 0.4]), ifcType: "IFCSLAB" };
  const q = rowQuantities(slab);
  const out = applyRule(slab, q, PRESETS.sections); // slabs: area 0, volume up to 0.05 m3
  close(out.volume, 5.6); close(out.volumeChange, 0.03);
  close(out.area, q.area); assert.equal(out.areaChange, 0);
  assert.equal(out.voidsLeft, 1);
  // the same element as a wall takes the walls' pair: the sleeve is left in both figures
  const wall = { ...slab, ifcType: "IFCWALL" };
  const w = applyRule(wall, rowQuantities(wall), PRESETS.sections);
  close(w.volume, 5.6); close(w.areaChange, 0.3);
});
