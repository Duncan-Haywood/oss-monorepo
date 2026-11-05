import test from "node:test";
import assert from "node:assert/strict";
import { patternPieces, packStrip, markerFor, cuttingPlan } from "./marker.mjs";

test("pieces: a hoodie has more pieces than a tee and a bigger size has bigger panels", () => {
  const n = ps => ps.reduce((a, p) => a + p.qty, 0);
  assert.ok(n(patternPieces("hoodie", "M")) > n(patternPieces("tee", "M")));
  const m = patternPieces("tee", "M").find(p => p.name === "front"), x = patternPieces("tee", "XXL").find(p => p.name === "front");
  assert.ok(x.w > m.w && x.l > m.l);
  assert.equal(patternPieces("tee", "Q"), null);
  assert.equal(patternPieces("cape", "M"), null);
});

test("packing: nothing overlaps width, shelves fill, an oversize piece is refused", () => {
  const r = packStrip([{ name: "a", w: 40, l: 50, qty: 3 }], 130);
  assert.equal(r.shelves, 1);
  assert.equal(r.length, 50);
  assert.equal(packStrip([{ name: "a", w: 70, l: 50, qty: 2 }], 130).shelves, 2);
  assert.equal(packStrip([{ name: "big", w: 200, l: 10, qty: 1 }], 150).ok, false);
});

test("a marker never covers more than the cloth, and two garments need less than twice one", () => {
  const one = markerFor("tee", { M: 1 }), two = markerFor("tee", { M: 2 });
  assert.ok(one.ok && two.ok);
  assert.ok(one.utilisationPct > 0 && one.utilisationPct <= 100);
  assert.ok(two.markerLengthCm < 2 * one.markerLengthCm + 1);
  assert.ok(two.utilisationPct >= one.utilisationPct - 0.1);
});

test("a narrower cloth takes more length", () => {
  const wide = markerFor("tee", { M: 2 }, { fabricWidthCm: 180 }), narrow = markerFor("tee", { M: 2 }, { fabricWidthCm: 120 });
  assert.ok(narrow.markerLengthCm > wide.markerLengthCm);
});

test("cutting plan covers the order, within ply and table limits, and reports spares", () => {
  const want = { S: 30, M: 70, L: 40, XXL: 3 };
  const p = cuttingPlan("tee", want, { maxPlies: 35 });
  assert.ok(p.ok);
  const cut = {};
  for (const g of p.groups) {
    assert.ok(g.plies <= 35 && g.markerLengthCm <= 1000);
    for (const [s, r] of Object.entries(g.ratio)) cut[s] = (cut[s] || 0) + r * g.lays * g.plies;
  }
  for (const [s, n] of Object.entries(want)) assert.ok(cut[s] >= n, s);
  const spares = Object.values(p.extraPieces).reduce((a, b) => a + b, 0);
  assert.ok(spares <= 12, `spares ${spares}`);
  assert.ok(Math.abs(p.metresPerPiece * p.pieces - p.metresToBuy) < 0.5);
  assert.ok(Math.abs(p.groups.reduce((a, g) => a + g.metres, 0) - p.metresToBuy) < 0.05);
});

test("a thin size is cut apart from the bulk instead of piling up spares", () => {
  const p = cuttingPlan("hoodie", { XS: 18, S: 47, M: 69, L: 47, XL: 16, XXL: 3 });
  assert.ok(p.ok);
  assert.ok(p.groups.length === 2);
  assert.ok(Object.values(p.extraPieces).reduce((a, b) => a + b, 0) <= 40);
  assert.ok(p.metresPerPiece < 2.4);
});

test("a short cutting table forces more lays; an impossible one is refused", () => {
  const roomy = cuttingPlan("tee", { M: 120 }, { maxMarkerCm: 2000, maxPlies: 5 });
  const tight = cuttingPlan("tee", { M: 120 }, { maxMarkerCm: 300, maxPlies: 5 });
  assert.ok(tight.ok && tight.groups[0].lays > roomy.groups[0].lays);
  assert.ok(tight.groups[0].markerLengthCm <= 300);
  assert.equal(cuttingPlan("tee", { M: 500 }, { maxMarkerCm: 100, maxPlies: 1 }).ok, false);
});

test("nesting gain lowers cloth; refusals", () => {
  const a = cuttingPlan("hoodie", { M: 40 }), b = cuttingPlan("hoodie", { M: 40 }, { nestingGainPct: 10 });
  assert.ok(b.metresToBuy < a.metresToBuy);
  assert.equal(cuttingPlan("tee", {}).ok, false);
  assert.equal(cuttingPlan("tee", { M: 5 }, { fabricWidthCm: 20 }).ok, false);
  assert.equal(cuttingPlan("tee", { M: 5 }, { nestingGainPct: 60 }).ok, false);
  assert.equal(cuttingPlan("tee", { M: 5 }, { maxPlies: 0 }).ok, false);
  assert.equal(cuttingPlan("tee", { Q: 5 }).ok, false);
});
