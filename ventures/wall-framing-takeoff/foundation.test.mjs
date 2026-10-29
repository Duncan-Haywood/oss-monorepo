import { test } from "node:test";
import assert from "node:assert/strict";
import { layoutFoundation, sampleFoundation, validateFoundation, foundationText } from "./foundation.mjs";

const near = (a, b, tol = 1e-3) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

test("stem footing volume is centreline length x width x depth, by hand", () => {
  // 40 x 28 ft outside, 20 in footing: centreline (480-20)+(336-20)=776 each way pair -> 1552 in
  const l = layoutFoundation({ ...sampleFoundation(), interior: [] });
  assert.ok(l.ok);
  near(l.centreline, 1552);
  near(l.pours.find((p) => p.name === "footing").cuYd, 1552 * 20 * 10 / 46656, 0.001);
});

test("stem slab is the clear area inside the stem wall", () => {
  const l = layoutFoundation(sampleFoundation());
  near(l.slabSqFt, (480 - 20 - 8) * (336 - 20 - 8) / 144, 0.1);
  near(l.pours.find((p) => p.name === "slab").cuYd, (452 * 308 * 4) / 46656, 0.001);
});

test("a monolithic slab is the whole slab plus only the deeper edge band", () => {
  const f = { type: "monolithic", width: 480, depth: 336, footing: { width: 12, depth: 16 }, slab: { thickness: 4 } };
  const l = layoutFoundation(f);
  near(l.pours.find((p) => p.name === "slab").cuYd, 480 * 336 * 4 / 46656, 0.001);
  const band = 480 * 336 - 456 * 312;
  near(l.pours.find((p) => p.name === "thickened edge").cuYd, band * 12 / 46656, 0.001);
});

test("truck count rounds up and warns about a short last load", () => {
  const l = layoutFoundation(sampleFoundation());
  assert.equal(l.concrete.trucks, Math.ceil(l.concrete.order / 10));
  const small = layoutFoundation({ ...sampleFoundation(), truck: 6 });
  assert.ok(small.concrete.trucks >= 1);
});

test("rebar longer than a stock bar gets lapped joints", () => {
  const l = layoutFoundation({ ...sampleFoundation(), interior: [] });
  const r = l.rebar.find((x) => x.what === "footing continuous bars");
  // loop = 2*((480-6)+(336-6)) = 1608 in, #4 lap 20 in, 20 ft stock -> ceil((1608-20)/220)=8 bars per line
  assert.equal(r.qty, 2 * 8);
  near(r.feet, 2 * (1608 + 7 * 20) / 12, 0.1);
});

test("slab grid counts bars each way from the spacing", () => {
  const l = layoutFoundation(sampleFoundation());
  const w = l.rebar.find((x) => x.what === "slab bars along the width");
  const d = l.rebar.find((x) => x.what === "slab bars along the depth");
  const ny = Math.floor((308 - 6) / 18) + 1;
  const nx = Math.floor((452 - 6) / 18) + 1;
  assert.equal(w.qty, ny * Math.ceil((452 - 6 - 15) / (240 - 15)));
  assert.equal(d.qty, nx * Math.ceil((308 - 6 - 15) / (240 - 15)));
});

test("bad inputs are refused with the reason", () => {
  assert.match(validateFoundation({ ...sampleFoundation(), width: 50 })[0], /width/);
  assert.match(validateFoundation({ ...sampleFoundation(), footing: { bar: 9 } }).join(" "), /#9/);
  assert.match(validateFoundation({ type: "monolithic", width: 480, depth: 336, footing: { depth: 4 } }).join(" "), /deeper/);
  assert.equal(layoutFoundation({ ...sampleFoundation(), stem: { thickness: 30 } }).ok, false);
});

test("text output names the pours, the trucks and the rebar weight", () => {
  const t = foundationText(layoutFoundation(sampleFoundation())).join("\n");
  assert.match(t, /footing/);
  assert.match(t, /truck/);
  assert.match(t, /Rebar, \d+ lb/);
});

test("anchor bolts: two per plate piece, within the end distance, at most the spacing apart", () => {
  // stem 8 in: plate sides are 460+8=468 in and 316+8=324 in, each cut into 192 in stock pieces
  const l = layoutFoundation({ ...sampleFoundation(), anchorBolts: {} });
  assert.ok(l.ok);
  // 468 -> 3 pieces of 156 in: ceil((156-24)/72)+1 = 3 bolts each (x2 sides = 18)
  // 324 -> 2 pieces of 162 in: ceil((162-24)/72)+1 = 3 bolts each (x2 sides = 12)
  assert.equal(l.anchors.pieces, 10);
  assert.equal(l.anchors.bolts, 30);
  assert.ok(foundationText(l).some((x) => /Anchor bolts: 30/.test(x)));
});

test("a short plate piece still gets two bolts; no anchorBolts key means no count", () => {
  const l = layoutFoundation({ type: "stem", width: 144, depth: 144, anchorBolts: { spacing: 120 } });
  assert.equal(l.anchors.bolts, 8); // 4 sides of ~136 in, ceil((136-24)/120)+1 = 2 each
  assert.equal(layoutFoundation(sampleFoundation()).anchors, null);
});

test("anchor bolt inputs are validated", () => {
  assert.ok(validateFoundation({ ...sampleFoundation(), anchorBolts: { spacing: 200 } }).some((x) => /spacing/.test(x)));
});

test("cornerBars: straight side runs plus an L-bar per layer per corner, legs one lap long", () => {
  const base = layoutFoundation(sampleFoundation());
  const l = layoutFoundation({ ...sampleFoundation(), cornerBars: true });
  assert.ok(l.ok);
  const footL = l.rebar.find((r) => /footing corner L-bars/.test(r.what));
  assert.equal(footL.qty, 8); // 2 layers x 4 corners
  near(footL.length, 40 / 12, 0.01); // #4 lap = 40 x 0.5 in = 20 in a leg
  assert.equal(l.rebar.find((r) => /stem horizontal corner L-bars/.test(r.what)).qty, 8);
  assert.ok(!l.rebar.some((r) => /continuous/.test(r.what)));
  // sides: 2 layers x (474 + 474 + 330 + 330) in of straight bar, plus splices, plus the corner bars
  const side = l.rebar.filter((r) => /footing bars, (long|short) sides/.test(r.what)).reduce((s, r) => s + r.feet, 0);
  assert.ok(side >= 2 * 2 * (474 + 330) / 12 - 0.5);
  assert.ok(l.rebarLb > base.rebarLb); // corner bars add steel to the bent-loop count
  assert.ok(base.notes.some((n) => /continuous loop/.test(n)) && l.notes.some((n) => /L-bar at every corner/.test(n)));
});

test("piers: pad and column volume and rebar by hand", () => {
  const base = layoutFoundation(sampleFoundation());
  const l = layoutFoundation({ ...sampleFoundation(), piers: [{ name: "deck", count: 4, pad: 24, padDepth: 12, column: 8, columnHeight: 30 }] });
  assert.ok(l.ok);
  const p = l.pours.find((x) => x.name.startsWith("deck"));
  near(p.cuYd, 4 * (24 * 24 * 12 + 8 * 8 * 30) / 46656, 0.001);
  // verticals: 4 per column, (12 - 3 + 30 + 20) in each; mat: floor(18/6)+1 = 4 bars each way, 18 in long
  const v = l.rebar.find((r) => r.what === "deck column verticals"), m = l.rebar.find((r) => r.what === "deck pad mat");
  assert.equal(v.qty, 16); near(v.feet, 16 * 59 / 12, 0.1);
  assert.equal(m.qty, 32); near(m.feet, 32 * 18 / 12, 0.1);
  assert.ok(l.rebarLb > base.rebarLb);
});

test("piers are validated", () => {
  assert.ok(validateFoundation({ ...sampleFoundation(), piers: [{ count: 0, pad: 24, padDepth: 12 }] }).length);
  assert.ok(validateFoundation({ ...sampleFoundation(), piers: [{ count: 2, pad: 12, padDepth: 12, column: 16, columnHeight: 10 }] }).length);
});

test("a footing step makes the stem taller over the lowered run and adds a riser block", () => {
  const base = layoutFoundation({ ...sampleFoundation(), interior: [] });
  const f = sampleFoundation(); f.interior = []; f.footing = { ...f.footing, steps: [{ rise: 16, length: 120 }] };
  const l = layoutFoundation(f);
  assert.ok(l.ok);
  near(l.pours.find((p) => p.name === "stem wall").cuYd - base.pours.find((p) => p.name === "stem wall").cuYd, 120 * 16 * 8 / 46656, 1e-3);
  near(l.pours.find((p) => p.name === "footing step risers").cuYd, 20 * 16 * 10 / 46656, 1e-3);
  near(l.forms.contactSqFt - base.forms.contactSqFt, 2 * 120 * 16 / 144, 0.1);
  assert.ok(l.rebar.some((r) => r.what.startsWith("step 1 stem verticals") && r.qty === Math.ceil(120 / 32)));
  assert.ok(!l.notes.some((n) => n.includes("steeper")));
});

test("a step steeper than 1 to 2 warns, and a bad rise is refused", () => {
  const f = sampleFoundation(); f.footing = { ...f.footing, steps: [{ rise: 20, length: 30 }] };
  assert.ok(layoutFoundation(f).notes.some((n) => n.includes("steeper")));
  f.footing.steps = [{ rise: 40, length: 100 }];
  assert.ok(!layoutFoundation(f).ok);
});
