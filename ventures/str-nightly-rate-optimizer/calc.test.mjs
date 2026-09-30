import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRows, parseOutcome, fitLogit, analyze, nightMargin, expectedValue, sampleText, reportCsv } from "./calc.mjs";

const sig = (z) => 1 / (1 + Math.exp(-z));

// Deterministic simulated nights: P(booked) = sigmoid(a + b * (price - 150)) on the raw price.
function nights({ n = 600, a = 1.5, b = -0.04, seed = 5, center = 150, spread = 35 } = {}) {
  let s = seed;
  const rnd = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());
  return Array.from({ length: n }, () => {
    const price = Math.max(60, center + spread * gauss());
    return { price, booked: rnd() < sig(a + b * (price - center)) ? 1 : 0 };
  });
}
const ECO = { feePct: 0.03, turnoverCost: 100, avgStay: 3, nightlyCost: 10 };

test("outcome words map to booked and empty, and unknown words are not guessed", () => {
  for (const w of ["1", "Booked", "YES", "reserved", "Occupied"]) assert.equal(parseOutcome(w), 1, w);
  for (const w of ["0", "Empty", "no", "vacant", "Available"]) assert.equal(parseOutcome(w), 0, w);
  assert.equal(parseOutcome("blocked"), null);
  assert.equal(parseOutcome(""), null);
});

test("parseRows reads a date column, headers in any order and money formats, and skips unreadable rows", () => {
  const p = parseRows("Date,Status,Nightly price\n2026-01-01,booked,\"$1,150\"\n2026-01-02,empty,180\n2026-01-03,blocked,170\n2026-01-04,booked,abc");
  assert.deepEqual(p.rows[0], { price: 1150, booked: 1 });
  assert.equal(p.rows.length, 2);
  assert.ok(p.warnings.some((w) => /skipped/.test(w)));
});

test("parseRows without a header reads price then result, with tab and semicolon delimiters", () => {
  assert.equal(parseRows("150,1\n180,0").rows.length, 2);
  assert.equal(parseRows("150\t1").rows[0].price, 150);
  assert.equal(parseRows("price;booked\n150;yes").rows[0].booked, 1);
});

test("empty and one-column input give an error", () => {
  assert.ok(parseRows("").error);
  assert.ok(parseRows("150\n180").error);
});

test("the economics: a booked night nets price less fee, turnover spread over the stay, and nightly cost", () => {
  assert.ok(Math.abs(nightMargin(200, ECO) - (200 * 0.97 - 100 / 3 - 10)) < 1e-9);
  const f = { a: 0, b: 0 };
  assert.ok(Math.abs(expectedValue(f, Math.log(200), ECO) - 0.5 * nightMargin(200, ECO)) < 1e-9);
});

test("logit recovers a known slope from a large simulated sample", () => {
  const rows = nights({ n: 6000, a: 1, b: -0.05 });
  const f = fitLogit(rows.map((r) => Math.log(r.price)), rows.map((r) => r.booked));
  assert.ok(f.converged);
  // slope on ln(price) near -0.05 * 150 = -7.5 around the centre
  assert.ok(f.b < -5 && f.b > -10, `slope ${f.b}`);
});

test("perfectly separated data stays finite and is flagged", () => {
  const rows = Array.from({ length: 60 }, (_, i) => ({ price: 100 + i * 3, booked: i < 30 ? 1 : 0 }));
  const r = analyze(rows, ECO);
  assert.ok(Number.isFinite(r.slope));
  assert.ok(r.warnings.some((w) => /perfectly split/.test(w)));
});

test("a real curve is usable and the best price is inside the tested range and near a brute-force optimum", () => {
  const r = analyze(nights({ n: 800 }), ECO);
  assert.equal(r.verdict, "usable");
  const p = r.optimum.price;
  assert.ok(p >= r.range.lo - 1e-6 && p <= r.range.hi + 1e-6);
  assert.ok(r.optimum.priceRange80[0] <= p + 1e-6 && p <= r.optimum.priceRange80[1] + 1e-6);
  let best = -Infinity, bp = 0;
  for (let q = r.range.lo; q <= r.range.hi; q += 0.25) {
    const v = expectedValue({ a: r.intercept, b: r.slope }, Math.log(q), r.eco);
    if (v > best) { best = v; bp = q; }
  }
  assert.ok(Math.abs(p - bp) / bp < 0.02, `got ${p} want ${bp}`);
  assert.ok(r.optimum.gain >= -1e-9 && r.optimum.pGain > 0.5);
});

test("a costlier turnover pushes the best price up, since fewer bookings mean fewer resets", () => {
  const rows = nights({ n: 800 });
  const cheap = analyze(rows, { ...ECO, turnoverCost: 0, nightlyCost: 0 });
  const dear = analyze(rows, { ...ECO, turnoverCost: 400, nightlyCost: 40 });
  assert.ok(dear.optimum.price >= cheap.optimum.price - 1e-6);
});

test("the result is reproducible: the bootstrap is seeded", () => {
  const rows = nights({ n: 200 });
  const a = analyze(rows, ECO), b = analyze(rows, ECO);
  assert.deepEqual(a.optimum.priceRange80, b.optimum.priceRange80);
  assert.equal(a.optimum.pGain, b.optimum.pGain);
});

test("a flat curve (price does not matter) is not called usable", () => {
  assert.notEqual(analyze(nights({ n: 300, b: 0, seed: 9 }), ECO).verdict, "usable");
});

test("a positive slope is unidentified and says why", () => {
  const r = analyze(nights({ n: 400, b: 0.06, seed: 4 }), ECO);
  assert.equal(r.verdict, "unidentified");
  assert.ok(r.warnings.some((w) => /already in demand/.test(w)));
});

test("refusals: too few nights, too few of one outcome, flat prices, too few levels", () => {
  assert.match(analyze(nights({ n: 30 }), ECO).error, /at least 40/);
  const few = nights({ n: 80 }).map((r, i) => ({ ...r, booked: i < 3 ? 0 : 1 }));
  assert.match(analyze(few, ECO).error, /booked nights and 8 empty/);
  const flat = nights({ n: 80, spread: 0 }).map((r, i) => ({ ...r, booked: i % 3 ? 1 : 0 }));
  assert.match(analyze(flat, ECO).error, /barely varied/);
  const two = nights({ n: 80 }).map((r, i) => ({ price: i % 2 ? 150 : 200, booked: i % 3 ? 1 : 0 }));
  assert.match(analyze(two, ECO).error, /distinct/);
});

test("a usual price outside the tested range is called a guess", () => {
  const r = analyze(nights({ n: 300 }), { ...ECO, usualPrice: 900 });
  assert.ok(r.warnings.some((w) => /outside the range/.test(w)));
});

test("scenarios: booking chance falls as price rises and untested ones are marked", () => {
  const r = analyze(nights({ n: 400 }), ECO);
  for (let i = 1; i < r.scenarios.length; i++) assert.ok(r.scenarios[i].bookChance < r.scenarios[i - 1].bookChance);
  assert.ok(r.scenarios.every((s) => typeof s.tested === "boolean"));
  assert.ok(r.sens.drop5 > 0);
});

test("bands cover every night and the fitted rate tracks the observed rate on a real curve", () => {
  const r = analyze(nights({ n: 800 }), ECO);
  assert.equal(r.bands.reduce((s, b) => s + b.n, 0), 800);
  for (const b of r.bands) assert.ok(Math.abs(b.observed - b.fitted) < 0.12, JSON.stringify(b));
});

test("hold-out: knowing the price helps on a real curve", () => {
  assert.ok(analyze(nights({ n: 500 }), ECO).holdout.helps);
});

test("the built-in example parses, analyses and is usable", () => {
  const p = parseRows(sampleText());
  assert.equal(p.rows.length, 240);
  const r = analyze(p.rows, { ...ECO, turnoverCost: 120, nightlyCost: 12, usualPrice: 140 });
  assert.equal(r.verdict, "usable");
  assert.equal(reportCsv(r).split("\n").length, r.scenarios.length + 1);
});
