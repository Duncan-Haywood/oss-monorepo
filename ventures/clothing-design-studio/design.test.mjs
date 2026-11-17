import test from "node:test";
import assert from "node:assert/strict";
import { newDesign, applyOp, History, variants, splitSizes, encodeDesign, decodeDesign, sanitizeDesign, OpError, SIZES } from "./design.mjs";
import { GARMENTS } from "./catalogue.mjs";

const withHalo = () => applyOp(newDesign(), { op: "add", kind: "motif", motif: "halo", w: 20 });

test("artwork is clamped inside its print area", () => {
  let d = withHalo();
  d = applyOp(d, { op: "move", dx: 100, dy: -100 });
  const p = d.placements[0];
  const a = GARMENTS.tee.areas.front;
  assert.ok(Math.abs(p.x) + p.w / 2 <= a.w / 2 + 1e-9);
  assert.ok(Math.abs(p.y) + (p.w * p.aspect) / 2 <= a.h / 2 + 1e-9);
  d = applyOp(d, { op: "scale", factor: 10 });
  assert.ok(d.placements[0].w <= a.w);
});

test("moving to the chest re-fits the artwork to the smaller area", () => {
  const d = applyOp(withHalo(), { op: "area", value: "chest" });
  assert.equal(d.placements[0].area, "chest");
  assert.ok(d.placements[0].w <= 10);
});

test("switching garment keeps artwork, and a tee has no sleeve area", () => {
  let d = applyOp(withHalo(), { op: "garment", value: "hoodie" });
  assert.ok(d.placements[0].w <= GARMENTS.hoodie.areas.front.h);
  d = applyOp(d, { op: "area", value: "sleeve" });
  assert.throws(() => applyOp(applyOp(d, { op: "garment", value: "tee" }), { op: "area", value: "sleeve" }), OpError);
});

test("operations with nothing selected say why", () => {
  assert.throws(() => applyOp(newDesign(), { op: "move", dx: 1, dy: 0 }), /no artwork/);
  assert.throws(() => applyOp(newDesign(), { op: "colour", value: "plaid" }), OpError);
});

test("undo and redo", () => {
  const h = new History(newDesign());
  h.apply({ op: "colour", value: "navy" });
  h.apply({ op: "garment", value: "hoodie" });
  assert.equal(h.present.garment, "hoodie");
  h.undo();
  assert.equal(h.present.garment, "tee");
  assert.equal(h.present.colourName, "navy");
  h.redo();
  assert.equal(h.present.garment, "hoodie");
});

test("a failed operation in a batch changes nothing", () => {
  const h = new History(newDesign());
  assert.throws(() => h.apply([{ op: "colour", value: "navy" }, { op: "move", dx: 1, dy: 0 }]));
  assert.equal(h.present.colourName, "black");
  assert.equal(h.past.length, 0);
});

test("three variants, each one change away", () => {
  const d = withHalo();
  const v = variants(d);
  assert.equal(v.length, 3);
  assert.notEqual(v[0].design.colour, d.colour);
  assert.notEqual(v[1].design.placements[0].w, d.placements[0].w);
  assert.notEqual(v[2].design.placements[0].method, d.placements[0].method);
  assert.equal(variants(newDesign()).length, 3);
});

test("quantity is split over sizes in the old proportions and sums exactly", () => {
  const s = splitSizes({ XS: 0, S: 15, M: 30, L: 30, XL: 20, XXL: 5 }, 37);
  assert.equal(SIZES.reduce((t, k) => t + s[k], 0), 37);
  assert.equal(s.XS, 0);
});

test("share links round-trip and drop uploaded images", () => {
  let d = applyOp(withHalo(), { op: "add", kind: "text", text: "Ave Maria", area: "back" });
  d = applyOp(d, { op: "add", kind: "image", src: "data:image/png;base64,AAAA", aspect: 1.2 });
  const back = decodeDesign(encodeDesign(d));
  assert.equal(back.placements.length, 2);
  assert.equal(back.placements[1].text, "Ave Maria");
});

test("untrusted design files keep only known fields", () => {
  const d = sanitizeDesign({ name: "x", garment: "spaceship", colour: "javascript:alert(1)", placements: [{ kind: "image", src: "https://evil.example/x.png" }, { kind: "text", text: "<b>hi</b>", ink: "red" }, { kind: "script" }] });
  assert.equal(d.garment, "tee");
  assert.equal(d.colourName, "black");
  assert.equal(d.placements.length, 1);
  assert.equal(d.placements[0].kind, "text");
  assert.notEqual(d.placements[0].ink, "red");
});

test("an uploaded image keeps its original pixel size for the print check, through a saved design", () => {
  let d = applyOp(newDesign(), { op: "add", kind: "image", src: "data:image/png;base64,AA", aspect: 1.25, srcPx: { w: 3000.4, h: 3750 } });
  assert.deepEqual(d.placements[0].srcPx, { w: 3000, h: 3750 });
  const back = sanitizeDesign(JSON.parse(JSON.stringify(d)));
  assert.deepEqual(back.placements[0].srcPx, { w: 3000, h: 3750 });
  d = applyOp(newDesign(), { op: "add", kind: "image", src: "data:image/png;base64,AA", srcPx: { w: -1, h: "x" } });
  assert.equal(d.placements[0].srcPx, undefined);
});
