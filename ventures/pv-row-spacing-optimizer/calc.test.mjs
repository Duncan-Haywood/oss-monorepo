import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, sampleInput, annuity, nineToThreeGcr, buildWeather, DEFAULTS } from "./calc.mjs";
import { shadedFraction } from "./rows.mjs";

const w = buildWeather(sampleInput());

test("annuity factors by hand: 2 years, 10%, no degradation and 50%", () => {
  const a = annuity(0.1, 2, 0);
  assert.ok(Math.abs(a.cost - (1 / 1.1 + 1 / 1.21)) < 1e-12);
  assert.ok(Math.abs(a.energy - a.cost) < 1e-12);
  assert.ok(Math.abs(annuity(0.1, 2, 0.5).energy - (1 / 1.1 + 0.5 / 1.21)) < 1e-12);
});

test("the 9-to-3 rule's GCR leaves the row exactly unshaded at 9:00 and 15:00 solar time on the winter solstice", () => {
  const lat = 40, tilt = 30, RAD = Math.PI / 180;
  const g = nineToThreeGcr(lat, tilt, 180);
  const d = -23.44 * RAD, p = lat * RAD, h = 45 * RAD;
  const up = Math.sin(p) * Math.sin(d) + Math.cos(p) * Math.cos(d) * Math.cos(h);
  const z = Math.acos(up);
  const az = Math.atan2(Math.sin(h), Math.cos(h) * Math.sin(p) - Math.tan(d) * Math.cos(p)) + Math.PI;
  const south = -Math.sin(z) * Math.cos(az);
  const cosAoi = south * Math.sin(tilt * RAD) + up * Math.cos(tilt * RAD);
  assert.ok(shadedFraction(up, cosAoi, g) < 1e-9);
  assert.ok(shadedFraction(up, cosAoi, g * 1.02) > 0);
  assert.equal(nineToThreeGcr(70, 30, 180), null); // polar night at 9:00
  assert.ok(nineToThreeGcr(-40, 30, 0) > 0); // southern hemisphere faces north
});

test("the chosen layouts are the best of everything searched", () => {
  const a = analyze(sampleInput(), w);
  assert.equal(a.rankBy, "npv");
  for (const row of a.fixed.npvGrid) for (const v of row) assert.ok(v <= a.fixed.best.npv + 1e-6);
  for (const r of a.tracker.curve) assert.ok(r.npv <= a.tracker.best.npv + 1e-6);
  assert.equal(a.choice, a.tracker.best.npv > a.fixed.best.npv ? "tracker" : "fixed");
  // Pitch and the clear gap between rows follow from the width and GCR.
  const b = a.fixed.best;
  assert.ok(Math.abs(b.pitch - DEFAULTS.collectorWidth / b.gcr) < 1e-12);
  assert.ok(Math.abs(b.gap - (b.pitch - DEFAULTS.collectorWidth * Math.cos((b.tilt * Math.PI) / 180))) < 1e-12);
  assert.ok(a.rule && a.rule.gcr > 0 && a.rule.gcr < 1);
});

test("land mode fills the acres; capacity mode leases what the rows need", () => {
  const land = analyze({ ...sampleInput(), mode: "land", acres: 40 }, w);
  assert.ok(Math.abs(land.fixed.best.acres - 40) < 1e-9);
  const b = land.fixed.best;
  const m2PerKwp = (1 / DEFAULTS.moduleEff / b.gcr) * (1 + DEFAULTS.overhead);
  assert.ok(Math.abs(b.kwp - (40 * 4046.8564224) / m2PerKwp) < 1e-6);
  const cap = analyze({ ...sampleInput(), mode: "capacity", mwdc: 5 }, w);
  assert.equal(cap.fixed.best.kwp, 5000);
  // Dearer land pushes rows closer together.
  const cheap = analyze({ ...sampleInput(), mode: "capacity", landCost: 0 }, w);
  const dear = analyze({ ...sampleInput(), mode: "capacity", landCost: 5000 }, w);
  assert.ok(dear.fixed.best.gcr > cheap.fixed.best.gcr, `${dear.fixed.best.gcr} vs ${cheap.fixed.best.gcr}`);
  assert.ok(dear.tracker.best.gcr > cheap.tracker.best.gcr);
});

test("when nothing pays, layouts are ranked by cost per MWh, with a note", () => {
  const a = analyze({ ...sampleInput(), price: 1 }, w);
  assert.equal(a.rankBy, "lcoe");
  for (const row of a.fixed.lcoeGrid) for (const v of row) assert.ok(v >= a.fixed.best.lcoe - 1e-9);
  assert.ok(a.notes.some((n) => /cost per MWh/.test(n)));
  assert.equal(analyze({ ...sampleInput(), price: 1, rankBy: "npv" }, w).rankBy, "npv");
});

test("an optimum on the edge of the search is flagged; bad input is refused", () => {
  const a = analyze({ ...sampleInput(), tiltMin: 5, tiltMax: 10 }, w);
  assert.ok(a.notes.some((n) => /best tilt is at the top/.test(n)));
  assert.throws(() => analyze({ lat: 95 }), /lat must be/);
  assert.throws(() => analyze({ gcrMin: 0.6, gcrMax: 0.4 }), /gcrMax is below/);
  assert.throws(() => analyze({ mode: "both" }), /mode must be/);
});

test("string inputs from a form are read as numbers", () => {
  const a = analyze({ ...sampleInput(), acres: "40", price: "50", backtrack: "true" }, w);
  assert.equal(a.input.acres, 40);
  assert.equal(a.input.backtrack, true);
});
