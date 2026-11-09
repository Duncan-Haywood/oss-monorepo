import test from "node:test";
import assert from "node:assert/strict";
import { markerSvg, cutTicketCsv, patternPieces, packStrip, markerFor, cuttingPlan } from "./marker.mjs";

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

test("placed pieces sit inside the cloth and never overlap", () => {
  const p = cuttingPlan("hoodie", { S: 20, M: 40, L: 20 });
  for (const g of p.groups) {
    const usable = g.usableWidthCm;
    assert.ok(g.placed.length > 0);
    for (const a of g.placed) assert.ok(a.x >= 0 && a.x + a.w <= usable + 1e-6 && a.y >= 0);
    for (let i = 0; i < g.placed.length; i++) for (let j = i + 1; j < g.placed.length; j++) {
      const a = g.placed[i], b = g.placed[j];
      const apart = a.x + a.w <= b.x + 0.11 || b.x + b.w <= a.x + 0.11 || a.y + a.l <= b.y + 0.11 || b.y + b.l <= a.y + 0.11;
      assert.ok(apart, `${a.size} ${a.name} overlaps ${b.size} ${b.name}`);
    }
    const perMarker = Object.values(g.ratio).reduce((x, y) => x + y, 0);
    assert.ok(g.placed.length >= perMarker * 4, "every garment contributes its pieces");
  }
});

test("markerSvg draws one rect per piece, escapes labels, and is empty without a layout", () => {
  const g = cuttingPlan("tee", { M: 10 }).groups[0];
  const svg = markerSvg(g);
  assert.ok(svg.startsWith("<svg"));
  assert.equal((svg.match(/<title>/g) || []).length, g.placed.length);
  assert.ok(!markerSvg({ placed: [{ name: "<b>", size: "M", x: 0, y: 0, w: 50, l: 50 }], ratio: { M: 1 }, fabricWidthCm: 150, edgeCm: 1.5 }).includes("<b>"));
  assert.equal(markerSvg({}), "");
});

test("cut ticket CSV: spares and totals reconcile with the plan", () => {
  const plan = cuttingPlan("hoodie", { XS: 18, S: 47, M: 69, L: 47, XL: 16, XXL: 3 });
  const rows = cutTicketCsv(plan).trim().split("\n").map(r => r.split(","));
  const body = rows.slice(1, -1), total = rows.at(-1);
  assert.equal(body.reduce((a, r) => a + Number(r[6]), 0), plan.pieces);
  assert.equal(Number(total[6]), plan.pieces);
  assert.equal(body.reduce((a, r) => a + Number(r[7]), 0), Number(total[7]));
  assert.equal(Number(total[9]), plan.metresToBuy);
  assert.equal(cutTicketCsv({ ok: false }), "");
});

test("nested cutting plan lays the real outlines, uses less cloth than rectangles, and draws them", () => {
  const order = { S: 2, M: 4, L: 2 };
  const rect = cuttingPlan("tee", order);
  const nst = cuttingPlan("tee", order, { nested: true });
  assert.ok(rect.ok && nst.ok && nst.nested && !rect.nested);
  assert.ok(nst.metresToBuy < rect.metresToBuy, `${nst.metresToBuy} < ${rect.metresToBuy}`);
  assert.deepEqual(nst.groups.map(g => [g.lays, g.plies]), rect.groups.map(g => [g.lays, g.plies]));
  assert.ok(markerSvg(nst.groups[0]).includes("<svg"));
  assert.ok(/drafted outlines/.test(nst.notes.join(" ")));
  // a garment with no draft (hoodie) falls back to rectangles
  const h = cuttingPlan("hoodie", { M: 4 }, { nested: true });
  assert.ok(h.ok && !h.nested);
});
