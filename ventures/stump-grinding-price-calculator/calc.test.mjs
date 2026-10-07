import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULTS, DEFAULT_DIAMETERS, num, money2, parseDiameters, grindMinutes, jobCost, perStumpPrices, quoteCheck, hardnessSensitivity, bundleSensitivity, speedSensitivity, wageSensitivity } from "./calc.mjs";

const near = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) < e, `${a} vs ${b}`);
const O = { ...DEFAULTS };
const D = parseDiameters(DEFAULT_DIAMETERS).diameters;

test("num parses money-ish text and rejects junk", () => {
  assert.equal(num("$1,200"), 1200);
  assert.ok(Number.isNaN(num("abc")));
  assert.equal(money2(-3.456), "-$3.46");
});

test("parseDiameters handles separators, repeats and junk", () => {
  assert.deepEqual(parseDiameters("14, 20 26;32x2").diameters, [14, 20, 26, 32, 32]);
  const p = parseDiameters("12, abc, -4, 0, 999");
  assert.deepEqual(p.diameters, [12]);
  assert.equal(p.skipped, 4);
  assert.deepEqual(parseDiameters("").diameters, []);
});

test("grind volume grows with the square of the diameter", () => {
  const a = grindMinutes(10, O);
  const b = grindMinutes(20, O);
  near(b.volume / a.volume, 4, 1e-9);
  near(a.volume, Math.PI * 25 * 14 * 1.25, 1e-6);
});

test("hardness and slower grinders lengthen cutting time proportionally", () => {
  const base = grindMinutes(24, O).minutes;
  near(grindMinutes(24, { ...O, hardness: 1.6 }).minutes, base * 1.6);
  near(grindMinutes(24, { ...O, cuInPerMin: 550 }).minutes, base * 2);
});

test("job cost adds labour for the whole trip, machine for cutting only, and truck miles", () => {
  const j = jobCost(D, O);
  near(j.grindMin, j.stumps.reduce((s, x) => s + x.grindMin, 0));
  near(j.onSiteMin, j.grindMin + 4 * (5 + 7) + 35);
  near(j.labour, ((j.onSiteMin + 40) / 60) * 2 * 24);
  near(j.machine, (j.grindMin / 60) * 28);
  near(j.truck, 24 * 0.85);
  near(j.direct, j.labour + j.machine + j.truck);
});

test("price = direct / (1 - overhead - margin) and delivers that margin", () => {
  const j = jobCost(D, { ...O, minCharge: 0 });
  near(j.price, j.direct / (1 - 0.37));
  const q = quoteCheck(D, { ...O, minCharge: 0, quotePerInch: j.price / j.totalInches });
  near(q.marginPct, 25, 1e-6);
  near(q.gap, 0, 1e-6);
});

test("minimum charge floors a small job and is flagged", () => {
  const j = jobCost([8], O);
  assert.equal(j.price, 150);
  assert.equal(j.minApplies, true);
  assert.equal(jobCost(D, O).minApplies, false);
});

test("per-stump prices add up to the job price and bigger stumps cost more", () => {
  const p = perStumpPrices(D, O);
  near(p.reduce((s, x) => s + x.price, 0), jobCost(D, O).price, 1e-6);
  assert.ok(p[3].price > p[0].price);
  assert.ok(p[0].perInch > p[3].perInch, "small stumps cost more per inch because setup is shared");
});

test("quote check shows a flat per-inch quote losing money on a hard job", () => {
  const q = quoteCheck(D, { ...O, hardness: 1.6, quotePerInch: 2 });
  assert.ok(q.gap < 0);
  assert.ok(q.profit < jobCost(D, { ...O, hardness: 1.6 }).price);
  assert.ok(q.neededPerInch > q.breakEvenPerInch);
});

test("sensitivities move the right way", () => {
  const h = hardnessSensitivity(D, O);
  assert.ok(h[0].price < h[3].price);
  const b = bundleSensitivity(D, O);
  assert.ok(b[0].each > b[3].each, "more stumps per trip lowers the price each");
  const s = speedSensitivity(D, O);
  assert.ok(s[0].price > s[4].price);
  const w = wageSensitivity(D, O);
  assert.ok(w[3].price > w[0].price);
});

test("empty, zero and hostile inputs never produce NaN or Infinity", () => {
  const e = jobCost([], O);
  assert.equal(e.price, 0);
  assert.deepEqual(perStumpPrices([], O), []);
  const z = jobCost(D, { ...O, cuInPerMin: 0, crewSize: 0, wage: -5, overheadPct: 60, targetMarginPct: 60 });
  assert.equal(z.price, null);
  assert.ok(Number.isFinite(z.direct));
  assert.equal(quoteCheck(D, { ...O, overheadPct: 60, targetMarginPct: 60 }).gap, null);
});
