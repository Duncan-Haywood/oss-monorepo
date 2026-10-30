import { test } from "node:test";
import assert from "node:assert/strict";
import { layoutInsulation, validateInsulation, insulationText } from "./insulation.mjs";

const wall = (members, length = 96, stud = "2x4") => ({ id: "A", length, stud, members });
const m = (x, y, w, h) => ({ x, y, w, h });
const plan = { defaultHeaderHeight: 82.5, walls: [{ id: "A", length: 96 }] };

test("cavity is panel area less framed members, by hand", () => {
  // panel 96 x 96 (y 0..96); two plates 96x1.5 and three studs 1.5 x 93
  const r = { walls: [wall([m(0, 0, 96, 1.5), m(0, 94.5, 96, 1.5), m(0, 1.5, 1.5, 93), m(47, 1.5, 1.5, 93), m(94.5, 1.5, 1.5, 93)])] };
  const l = layoutInsulation({}, plan, r);
  const cavity = 96 * 96 - (2 * 96 * 1.5 + 3 * 1.5 * 93);
  assert.ok(Math.abs(l.cavitySqFt - cavity / 144) < 1e-9);
  assert.equal(l.sizes[0].rValue, 15);
  assert.equal(l.bags, Math.ceil(((cavity / 144) * 1.05) / 88)); // 1 bag
});

test("an opening's rough area leaves the cavity", () => {
  const r = { walls: [wall([m(0, 0, 96, 1.5), m(0, 94.5, 96, 1.5)], 96)] };
  const p = { defaultHeaderHeight: 82.5, walls: [{ id: "A", length: 96, openings: [{ offset: 20, width: 36, height: 48 }] }] };
  const a = layoutInsulation({}, p, r), b = layoutInsulation({}, plan, r);
  assert.ok(Math.abs((b.cavitySqFt - a.cavitySqFt) - (36 * 48) / 144) < 1e-9);
});

test("2x6 walls default to R-21 and are grouped apart; price multiplies bags", () => {
  const r = { walls: [wall([m(0, 0, 96, 96)], 96, "2x6"), { ...wall([m(0, 0, 10, 10)], 192), id: "B" }] };
  const l = layoutInsulation({ price: 50 }, { defaultHeaderHeight: 82.5, walls: [] }, r);
  assert.equal(l.sizes.find((s) => s.size === "2x6").rValue, 21);
  assert.equal(l.cost, l.bags * 50);
});

test("bad inputs are refused", () => {
  assert.equal(validateInsulation({ bagSqFt: 5 }).length, 1);
  assert.equal(layoutInsulation({ waste: 0.9 }, plan, { walls: [] }).ok, false);
});

test("attic loose fill: depth from R and R per inch, volume by hand", () => {
  const r = { walls: [wall([m(0, 0, 96, 96)])] };
  // 20 ft x 30 ft ceiling = 600 sq ft; R-38 at R-3.8/in = 10 in; 600 x 10/12 = 500 cu ft; +5% = 525
  const l = layoutInsulation({ attic: { ceiling: [{ width: 240, depth: 360 }], rPerInch: 3.8, bagCuFt: 30, price: 20 } }, plan, r);
  assert.equal(l.ok, true);
  assert.ok(Math.abs(l.attic.depthIn - 10) < 1e-9);
  assert.ok(Math.abs(l.attic.cuFt - 525) < 1e-9);
  assert.equal(l.attic.bags, 18); // 525 / 30 = 17.5
  assert.equal(l.attic.cost, 360);
  assert.ok(insulationText(l).some((x) => x.includes("10.0 in")));
});

test("attic without a bag volume gives depth and cubic feet but no bag count; area falls back to drywall ceilings, then roof", () => {
  const r = { walls: [] };
  const a = layoutInsulation({ attic: {} }, { ...plan, drywall: { ceiling: [{ width: 120, depth: 120 }] } }, r);
  assert.equal(a.attic.bags, null);
  assert.equal(a.attic.rPerInchAssumed, true);
  assert.ok(Math.abs(a.attic.sqFt - 100) < 1e-9);
  const b = layoutInsulation({ attic: {} }, { ...plan, roof: { width: 240, length: 360 } }, r);
  assert.ok(Math.abs(b.attic.sqFt - 600) < 1e-9);
  assert.equal(layoutInsulation({ attic: {} }, plan, r).ok, false);
  assert.equal(validateInsulation({ attic: { rValue: 5 } }).length, 1);
});

test("rim joist bays: width x joist depth less joist ends, both sides, by hand", () => {
  const r = { walls: [] };
  const floor = { width: 480, depth: 336, joist: "2x10", spacing: 16 };
  const l = layoutInsulation({ rim: true, price: 10 }, { ...plan, floor }, r);
  assert.equal(l.ok, true);
  // 480 in wide at 16 o.c.: 31 joists (edge joists included); 9.25 in deep; 1.5 in thick
  const per = 480 * 9.25 - 31 * 1.5 * 9.25;
  assert.ok(Math.abs(l.rim.sqFt - (2 * per) / 144) < 1e-9);
  assert.equal(l.rim.bags, Math.ceil((l.rim.sqFt * 1.05) / 88 - 1e-9));
  assert.equal(l.rim.cost, l.rim.bags * 10);
  assert.ok(insulationText(l).some((x) => x.includes("Rim joist bays")));
  assert.equal(layoutInsulation({ rim: true }, plan, r).ok, false);
  assert.equal(layoutInsulation({ rim: true }, { ...plan, floor: { ...floor, rim: false } }, r).ok, false);
});

test("attic eave baffles: one per bay on both eaves, by hand", () => {
  const r = { walls: [wall([m(0, 0, 96, 96)])] };
  const roof = { width: 336, length: 480, spacing: 24 };
  const l = layoutInsulation({ attic: { baffles: true } }, { defaultHeaderHeight: 82.5, walls: [], roof }, r);
  assert.equal(l.attic.baffles.bays, 20); // 480 / 24
  assert.equal(l.attic.baffles.count, 40);
  const t = layoutInsulation({ attic: { baffles: true } }, { defaultHeaderHeight: 82.5, walls: [], roof: { ...roof, spacing: 16, trusses: { spacing: 24 } } }, r);
  assert.equal(t.attic.baffles.count, 40); // truss spacing wins
  const n = layoutInsulation({ attic: { baffles: true } }, { defaultHeaderHeight: 82.5, walls: [] }, r);
  assert.equal(n.ok, false);
});

test("eave compression: the squeezed band and the missing fill, by hand", () => {
  const r = { walls: [] };
  const roof = { width: 336, length: 480, pitch: 4, spacing: 24 };
  const p = { defaultHeaderHeight: 82.5, walls: [], roof };
  const l = layoutInsulation({ waste: 0, attic: { heel: 3.5, bagCuFt: 40 } }, p, r);
  assert.equal(l.ok, true);
  const depth = 38 / 2.5, run = (depth - 3.5) * 3; // 11.7 in of rise to make up at 4/12 = 35.1 in of run
  assert.ok(Math.abs(l.attic.eave.runIn - run) < 1e-9);
  assert.ok(Math.abs(l.attic.eave.bandSqFt - (2 * run * 480) / 144) < 1e-9);
  const lost = (2 * 480 * run * (depth - 3.5)) / 2 / 1728; // a triangle along each eave
  assert.ok(Math.abs(l.attic.eave.lostCuFt - lost) < 1e-9);
  const full = layoutInsulation({ waste: 0, attic: { bagCuFt: 40 } }, p, r);
  assert.ok(Math.abs(full.attic.cuFt - l.attic.cuFt - lost) < 1e-9);
  assert.ok(insulationText(l).some((x) => x.includes("Eave compression")));
  // a heel as tall as the depth loses nothing
  assert.equal(layoutInsulation({ attic: { heel: 16 } }, p, r).attic.eave.lostCuFt, 0);
  assert.equal(layoutInsulation({ attic: { heel: 3.5 } }, { ...p, roof: undefined, drywall: { ceiling: [{ width: 100, depth: 100 }] } }, r).ok, false);
});
