import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRows, parseDate, analyze, sampleText, reportCsv, ols, tQuantile, normQuantile } from "./calc.mjs";

function series(elasticity, { n = 60, noise = 0, seed = 1, levels = [20, 22, 24, 26, 28] } = {}) {
  let a = seed;
  const rnd = () => { a = (a * 1664525 + 1013904223) % 4294967296; return a / 4294967296; };
  return Array.from({ length: n }, (_, i) => {
    const price = levels[Math.floor(i / 3) % levels.length] + (i % 2) * 0.5;
    const eps = noise * (rnd() - 0.5) * 2;
    return { t: i, price, units: 100 * Math.pow(price / 24, elasticity) * Math.exp(eps) };
  });
}

test("OLS recovers an exact line", () => {
  const X = [1, 2, 3, 4].map((x) => [1, x]);
  const f = ols(X, [3, 5, 7, 9]);
  assert.ok(Math.abs(f.beta[0] - 1) < 1e-9 && Math.abs(f.beta[1] - 2) < 1e-9);
});

test("quantile helpers match tables", () => {
  assert.ok(Math.abs(normQuantile(0.975) - 1.95996) < 1e-4);
  assert.ok(Math.abs(tQuantile(0.975, 10) - 2.228) < 0.01);
  assert.ok(Math.abs(tQuantile(0.975, 60) - 2.0003) < 0.01);
});

test("noise-free constant-elasticity data returns the exact elasticity", () => {
  for (const e of [-0.6, -1.5, -3]) {
    const r = analyze(series(e), { trend: false, season: false });
    assert.ok(Math.abs(r.elasticity - e) < 1e-6, `${e} got ${r.elasticity}`);
  }
});

test("noisy data: the interval covers the truth and the verdict is usable", () => {
  const r = analyze(series(-1.8, { noise: 0.08, n: 80 }), { trend: false, season: false, dated: false });
  assert.ok(r.ci95[0] < -1.8 && -1.8 < r.ci95[1], JSON.stringify(r.ci95));
  assert.equal(r.verdict, "usable");
  assert.equal(r.type, "elastic");
});

test("optimum price matches c*e/(e-1) when it lies inside the tested range", () => {
  const rows = series(-2, { levels: [16, 20, 24, 28, 32] });
  const r = analyze(rows, { trend: false, season: false, cost: 10 });
  const expected = (10 * -2) / (-2 + 1); // 20
  assert.ok(Math.abs(r.optimum.price - expected) < 0.2, r.optimum.price);
  assert.ok(Math.abs(r.optimum.unconstrained - 20) < 1e-6);
  assert.equal(r.optimum.atBoundary, false);
});

test("inelastic demand pushes the optimum to the top of the tested range and says so", () => {
  const r = analyze(series(-0.5), { trend: false, season: false, cost: 10 });
  assert.equal(r.optimum.atBoundary, true);
  assert.ok(Math.abs(r.optimum.price - r.priceMax) < 0.3);
  assert.equal(r.optimum.unconstrained, null);
  assert.ok(r.warnings.some((w) => /edge of the prices/.test(w)));
});

test("a flat price is refused, not answered", () => {
  const rows = Array.from({ length: 30 }, (_, i) => ({ t: i, price: 25, units: 100 + i }));
  assert.match(analyze(rows, {}).error, /barely moved/);
  const two = Array.from({ length: 30 }, (_, i) => ({ t: i, price: i % 2 ? 25 : 26, units: 100 }));
  assert.match(analyze(two, {}).error, /barely moved/);
});

test("too few rows is refused", () => {
  assert.match(analyze(series(-1).slice(0, 8), {}).error, /At least 12 rows/);
});

test("a positive slope (price raised in busy weeks) is flagged unidentified", () => {
  const rows = series(0, { n: 60 }).map((r, i) => ({ ...r, units: 50 + r.price * 4 + (i % 3) }));
  const r = analyze(rows, { trend: false, season: false });
  assert.equal(r.verdict, "unidentified");
  assert.ok(r.warnings.some((w) => /unidentified/.test(w)));
  assert.equal(r.optimum, undefined);
});

test("a steady trend in both price and demand is absorbed by the trend control", () => {
  const rows = Array.from({ length: 60 }, (_, i) => ({ t: i, price: 20 + i * 0.1 + (i % 2) * 0.3, units: 100 * Math.exp(0.012 * i) * Math.pow((20 + i * 0.1) / 20, -1.2) }));
  const without = analyze(rows, { trend: false, season: false });
  const withT = analyze(rows, { trend: true, season: false });
  assert.ok(withT.warnings.some((w) => /straight line/.test(w)));
  assert.ok(Math.abs(withT.elasticity + 1.2) < Math.abs(without.elasticity + 1.2));
});

test("bootstrap is deterministic for a seed and changes with another", () => {
  const rows = series(-1.6, { noise: 0.1 });
  const a = analyze(rows, { cost: 9, trend: false, season: false });
  const b = analyze(rows, { cost: 9, trend: false, season: false });
  const c = analyze(rows, { cost: 9, trend: false, season: false, seed: 5 });
  assert.deepEqual(a.ci80, b.ci80);
  assert.notDeepEqual(a.ci80, c.ci80);
});

test("holdout: price helps predict when it drives demand, and not when it does not", () => {
  const good = analyze(series(-2, { noise: 0.05, n: 80 }), { trend: false, season: false });
  assert.equal(good.holdout.helps, true);
  const rows = series(0, { noise: 0.2, n: 80, seed: 9 });
  const bad = analyze(rows, { trend: false, season: false });
  assert.notEqual(bad.verdict, "usable");
});

test("recovers the known elasticity of the built-in sample within its interval", () => {
  const p = parseRows(sampleText());
  assert.equal(p.rows.length, 64);
  const r = analyze(p.rows, { dated: true, cost: 10, currentPrice: 29 });
  assert.ok(r.ci95[0] < -1.8 && r.ci95[1] > -1.8, JSON.stringify(r.ci95));
  assert.equal(r.verdict, "usable");
  assert.ok(r.optimum.gain > 0);
  assert.ok(r.optimum.price < 29, "current 29 is above the profit-maximising price");
});

test("without a cost there is revenue advice and no optimum", () => {
  const r = analyze(series(-0.5), { trend: false, season: false });
  assert.equal(r.optimum, undefined);
  assert.match(r.revenueAdvice, /raising price increased revenue/);
});

test("scenarios: a 10% rise scales units by 1.1^e and flags untested prices", () => {
  const r = analyze(series(-1.5), { trend: false, season: false, currentPrice: 24, cost: 10 });
  const base = r.scenarios.find((s) => s.change === 0), up = r.scenarios.find((s) => s.change === 0.1);
  assert.ok(Math.abs(up.units / base.units - Math.pow(1.1, -1.5)) < 1e-6);
  assert.equal(r.scenarios.find((s) => s.change === -0.2).tested, false);
  assert.equal(base.tested, true);
});

test("parser: header, money formats, dates, merging, zero units, bad rows", () => {
  const p = parseRows("Date,Price,Units\n2025-01-06,$24.00,10\n1/13/2025,\"$25.50\",8\n2025-01-13,25.50,4\n2025-01-20,26,0\nnope,1,1\n2025-01-27,-3,5");
  assert.equal(p.rows.length, 2);
  assert.equal(p.rows[1].units, 12);
  assert.equal(p.rows[1].price, 25.5);
  assert.ok(p.warnings.some((w) => /zero units/.test(w)));
  assert.ok(p.warnings.some((w) => /skipped/.test(w)));
  assert.ok(p.warnings.some((w) => /shared a date/.test(w)));
});

test("parser: two columns means price,units in time order; empty input errors", () => {
  const p = parseRows("price,units\n10,100\n11,90");
  assert.equal(p.dated, false);
  assert.deepEqual(p.rows.map((r) => r.price), [10, 11]);
  assert.match(parseRows("").error, /Paste or upload/);
  assert.match(parseRows("5\n6").error, /at least price and units/);
  assert.ok(Number.isNaN(parseDate("banana")));
});

test("csv export has a row per scenario", () => {
  const r = analyze(series(-1.5), { trend: false, season: false, cost: 10 });
  assert.equal(reportCsv(r).split("\n").length, r.scenarios.length + 1);
});

// Kill criterion: the elasticity or its interval must agree with a standard
// log-log OLS with HC1 robust errors. This reference uses the closed-form
// simple-regression sandwich, not the matrix code in calc.mjs.
test("agrees with an independent closed-form log-log OLS with HC1 errors", () => {
  const rows = series(-1.4, { noise: 0.15, n: 70, seed: 42 });
  const r = analyze(rows, { trend: false, season: false, dated: false });
  const x = rows.map((q) => Math.log(q.price)), y = rows.map((q) => Math.log(q.units));
  const n = rows.length;
  const mx = x.reduce((s, v) => s + v, 0) / n, my = y.reduce((s, v) => s + v, 0) / n;
  const sxx = x.reduce((s, v) => s + (v - mx) ** 2, 0);
  const b = x.reduce((s, v, i) => s + (v - mx) * (y[i] - my), 0) / sxx;
  const a = my - b * mx;
  const meat = x.reduce((s, v, i) => s + ((v - mx) ** 2) * (y[i] - a - b * v) ** 2, 0);
  const se = Math.sqrt((n / (n - 2)) * meat) / sxx;
  assert.ok(Math.abs(r.elasticity - b) < 1e-9, `slope ${r.elasticity} vs ${b}`);
  assert.ok(Math.abs(r.se - se) < 1e-9, `se ${r.se} vs ${se}`);
  const t = tQuantile(0.975, n - 2);
  assert.ok(Math.abs(r.ci95[0] - (b - t * se)) < 1e-9 && Math.abs(r.ci95[1] - (b + t * se)) < 1e-9);
});
