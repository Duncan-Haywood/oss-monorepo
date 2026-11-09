import test from "node:test";
import assert from "node:assert/strict";
import { cutShapes, nest, nestRatio, verifyNest, ringsOverlap, nestSvg } from "./nest.mjs";
import { draft, area } from "./pattern.mjs";
import { markerFor } from "./marker.mjs";

const rect = (w, h) => [[0, 0], [w, 0], [w, h], [0, h]];
const sh = (name, w, h) => ({ name, label: "", rings: [rect(w, h)] });

test("ringsOverlap: crossing, containment, apart, touching-free", () => {
  assert.equal(ringsOverlap(rect(10, 10), rect(10, 10).map(([x, y]) => [x + 5, y + 5])), true);
  assert.equal(ringsOverlap(rect(10, 10), rect(2, 2).map(([x, y]) => [x + 4, y + 4])), true);
  assert.equal(ringsOverlap(rect(10, 10), rect(10, 10).map(([x, y]) => [x + 20, y])), false);
});

test("four 70 x 50 rectangles on 150 cm cloth (usable 147): two across, two rows, 100 cm", () => {
  const r = nest([sh("a", 70, 50), sh("b", 70, 50), sh("c", 70, 50), sh("d", 70, 50)], { widthCm: 150, edgeCm: 1.5 });
  assert.ok(r.ok);
  assert.ok(r.lengthCm >= 100 && r.lengthCm <= 103, `length ${r.lengthCm}`);
  assert.ok(verifyNest(r).ok);
  assert.ok(Math.abs(r.pieceAreaCm2 - 14000) < 1);
});

test("a cut-on-fold piece is unfolded to twice its half area; a pair is left and right", () => {
  const d = draft("tee", "M");
  const s = cutShapes(d.pieces);
  assert.equal(s.length, 4); // front, back, two sleeves
  const front = s.find(p => p.name === "front");
  const a = front.rings.reduce((t, r) => t + Math.abs(area(r)), 0);
  assert.ok(Math.abs(a - 2 * Math.abs(d.pieces[0].cutAreaCm2)) < 0.05);
});

test("a real tee nests with no exact overlaps, inside the width, and beats the rectangle marker", () => {
  const r = nestRatio("tee", { M: 1 }, { widthCm: 150 });
  assert.ok(r.ok, r.error);
  const v = verifyNest(r);
  assert.ok(v.ok, v.problems.join("; "));
  const rect = markerFor("tee", { M: 1 }, { fabricWidthCm: 150 });
  assert.ok(r.lengthCm < rect.markerLengthCm, `${r.lengthCm} vs rectangles ${rect.markerLengthCm}`);
  assert.ok(r.efficiencyPct > 55 && r.efficiencyPct <= 100, String(r.efficiencyPct));
});

test("a size ratio marker verifies and a second size shortens the cloth per garment", () => {
  const one = nestRatio("tee", { M: 1 }, { widthCm: 150 });
  const run = nestRatio("tee", { S: 1, M: 2, L: 1 }, { widthCm: 150 });
  assert.ok(run.ok && verifyNest(run).ok, (verifyNest(run).problems || []).join("; "));
  assert.equal(run.pieces.length, 16);
  assert.ok(run.cmPerGarment <= one.cmPerGarment);
});

test("deterministic, and one-way cloth is never longer-saving than turnable cloth", () => {
  const a = nestRatio("tee", { M: 2 }, { widthCm: 150 }), b = nestRatio("tee", { M: 2 }, { widthCm: 150 });
  assert.equal(a.lengthCm, b.lengthCm);
  const ow = nestRatio("tee", { M: 2 }, { widthCm: 150, oneWay: true });
  assert.ok(ow.ok && ow.lengthCm >= a.lengthCm);
  assert.ok(ow.pieces.every(p => p.rot === 0));
});

test("refusals: narrow cloth, bad counts, empty, bad grid", () => {
  assert.equal(nestRatio("tee", { XL: 1 }, { widthCm: 40 }).ok, false);
  assert.equal(nestRatio("tee", { M: 1.5 }).ok, false);
  assert.equal(nestRatio("tee", { M: 0 }).ok, false);
  assert.equal(nest([sh("a", 5, 5)], { gridCm: 9 }).ok, false);
  assert.equal(nestRatio("cape", { M: 1 }).ok, false);
  const hd = nestRatio("hoodie", { M: 1 });
  assert.ok(hd.ok && hd.verified !== false);
});

test("svg names the cloth and pieces", () => {
  const r = nestRatio("tee", { M: 1 }, { widthCm: 150 });
  const s = nestSvg(r);
  assert.match(s, /^<svg/); assert.match(s, /front/); assert.match(s, /percent of the cloth/);
});
