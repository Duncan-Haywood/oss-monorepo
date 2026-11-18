import { test } from "node:test";
import assert from "node:assert/strict";
import { battery, bill, runSelf, runPeak, runOptimal, compare, payback } from "./dispatch.mjs";
import { parseTariff, parseTariffs, hourlyPrices, EXAMPLE_TARIFFS } from "./tariff.mjs";
import { syntheticYear } from "./example.mjs";

const flatPrices = (n, imp, exp) => ({ imp: Float64Array.from({ length: n }, (_, i) => (typeof imp === "function" ? imp(i) : imp)), exp: Float64Array.from({ length: n }, (_, i) => (typeof exp === "function" ? exp(i) : exp)), month: new Int32Array(n), months: ["2025-01"] });
const near = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

test("bill: imports at the import price, exports at the export credit, fixed charge per month", () => {
  const p = flatPrices(4, 0.4, 0.1);
  const b = bill(Float64Array.from([1, 2, -3, 0]), p, 12);
  near(b.energy, 3 * 0.4 - 3 * 0.1);
  near(b.total, 0.9 + 12);
  assert.equal(b.byMonth[0].imported, 3);
  assert.equal(b.byMonth[0].exported, 3);
});

test("self-powered mode by hand: spare solar stored with losses, delivered to the evening load", () => {
  const bat = battery({ kwh: 10, kw: 5, roundTrip: 0.81, reserve: 0 });
  // 4 kWh spare at noon (stored 3.6), then 5 kWh of evening load: the battery delivers 3.6 x 0.9 = 3.24.
  const r = runSelf(Float64Array.from([-4, 5]), bat);
  near(r.grid[0], 0);
  near(r.grid[1], 5 - 3.24);
  near(r.delivered, 3.24);
  // The inverter limit: 8 kWh spare in an hour, only 5 go in.
  near(runSelf(Float64Array.from([-8]), bat).grid[0], -3);
  // The reserve is never spent.
  const res = runSelf(Float64Array.from([-10, 10]), battery({ kwh: 10, kw: 10, roundTrip: 1, reserve: 0.3 }));
  near(res.delivered, 10 - 3);
});

test("optimal: lossless daily arbitrage equals capacity x price gap (hand arithmetic)", () => {
  const days = 5, n = 24 * days;
  const net = new Float64Array(n).fill(2);
  const p = flatPrices(n, (i) => (i % 24 < 12 ? 0.1 : 0.5), 0);
  const bat = battery({ kwh: 4, kw: 2, roundTrip: 1, reserve: 0, gridCharge: true });
  const r = runOptimal(net, bat, p, { levels: 40 });
  const saving = bill(net, p).total - bill(r.grid, p).total;
  near(saving, days * 4 * 0.4, 1e-9);
  // Without grid charging and with no solar, the battery can do nothing.
  const r2 = runOptimal(net, battery({ ...bat, gridCharge: false }), p);
  near(bill(r2.grid, p).total, bill(net, p).total);
});

test("optimal with losses: trades only when price gap beats the round trip", () => {
  const n = 48, net = new Float64Array(n).fill(1);
  const bat = battery({ kwh: 2, kw: 2, roundTrip: 0.81, reserve: 0, gridCharge: true });
  // 0.10 -> 0.12: 0.12 x 0.81 < 0.10, not worth it.
  const p1 = flatPrices(n, (i) => (i % 24 < 12 ? 0.1 : 0.12), 0);
  near(bill(runOptimal(net, bat, p1).grid, p1).total, bill(net, p1).total);
  // 0.10 -> 0.40: buy 2/0.9 kWh to store 2, deliver 1.8 at 0.40 (split over the evening's 1 kWh hours).
  const p2 = flatPrices(n, (i) => (i % 24 < 12 ? 0.1 : 0.4), 0);
  const s = bill(net, p2).total - bill(runOptimal(net, bat, p2, { levels: 100 }).grid, p2).total;
  near(s, 2 * (1.8 * 0.4 - (2 / 0.9) * 0.1), 1e-6);
});

test("dynamic programme is never more than half a cent behind a fine brute-force search on short horizons", () => {
  let seed = 3;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let trial = 0; trial < 20; trial++) {
    const n = 5;
    const net = Float64Array.from({ length: n }, () => 4 * rnd() - 2);
    const p = flatPrices(n, () => 0.1 + 0.5 * rnd(), () => 0.3 * rnd());
    const bat = battery({ kwh: 3, kw: 1 + 2 * rnd(), roundTrip: 0.8 + 0.2 * rnd(), reserve: 0, gridCharge: rnd() < 0.5, gridExport: rnd() < 0.5 });
    // Brute force over a fine grid of stored-energy paths (0.05 kWh), allowing any move within limits.
    const K = 60, step = 3 / K, eta = Math.sqrt(bat.roundTrip);
    let layer = new Map([[0, 0]]);
    for (let t = 0; t < n; t++) {
      const nextL = new Map(), x = net[t];
      for (const [k, cost] of layer) for (let j = 0; j <= K; j++) {
        const d = (j - k) * step;
        let g = x;
        if (d > 0) { const c = d / eta; if (c > bat.kw + 1e-9 || (!bat.gridCharge && c > Math.max(0, -x) + 1e-9)) continue; g = x + c; }
        if (d < 0) { const o = -d * eta; if (o > bat.kw + 1e-9 || (!bat.gridExport && o > Math.max(0, x) + 1e-9)) continue; g = x - o; }
        const v = cost + (g > 0 ? g * p.imp[t] : g * p.exp[t]);
        if (!(nextL.get(j) <= v)) nextL.set(j, v);
      }
      layer = nextL;
    }
    const brute = Math.min(...layer.values());
    const dp = bill(runOptimal(net, bat, p, { levels: 30 }).grid, p).total;
    // The programme is free of the brute force's 0.05 kWh grid, so it often does better; it may trail
    // only by what interpolating between its 30 levels costs (under half a cent over five hours).
    // The exact reference, a linear programme solved by HiGHS, is eval/lp-check.py.
    assert.ok(dp <= brute + 0.005, `trial ${trial}: brute ${brute} vs dp ${dp}`);
  }
});

test("on a synthetic year, the optimum is never beaten by the rule-based modes, and flat one-for-one net metering earns nothing", () => {
  const { start, net } = syntheticYear();
  const plans = parseTariffs(EXAMPLE_TARIFFS);
  assert.ok(plans.every((p) => p.ok));
  for (const t of plans) {
    const p = hourlyPrices(t.plan, start, net.length);
    const c = compare(net, { kwh: 13.5, kw: 5, roundTrip: 0.9, reserve: 0.2 }, p, t.plan.fixed, { levels: 60 });
    // The optimum may trail a rule's continuous schedule by cents at most (interpolation between levels).
    assert.ok(c.optimal.saving >= c.self.saving - 1, `${t.plan.name}: ${c.optimal.saving} < ${c.self.saving}`);
    assert.ok(c.optimal.saving >= c.peak.saving - 1, t.plan.name);
    assert.ok(c.optimal.bill.total <= c.none.bill.total + 1e-9);
  }
  const flat = hourlyPrices(plans[2].plan, start, net.length);
  near(compare(net, { kwh: 13.5, kw: 5, roundTrip: 0.9 }, flat, 10).optimal.saving, 0, 1e-6);
});

test("finer level grids close in on the optimum (the gap the page's default leaves is small)", () => {
  const { start, net } = syntheticYear({ seed: 11 });
  const t = parseTariff(EXAMPLE_TARIFFS.split("---")[0]).plan;
  const p = hourlyPrices(t, start, 24 * 60);
  const sub = net.slice(0, 24 * 60);
  const bat = battery({ kwh: 13.5, kw: 5, roundTrip: 0.9, reserve: 0.2, gridExport: true });
  const cost = (K) => bill(runOptimal(sub, bat, p, { levels: K }).grid, p).total;
  const c30 = cost(30), c60 = cost(60), c540 = cost(540);
  const base = bill(sub, p).total;
  assert.ok(Math.abs(c60 - c540) / (base - c540) < 0.001, "60 levels within 0.1% of the saving at 540");
  assert.ok(Math.abs(c30 - c540) / (base - c540) < 0.005, "30 levels within 0.5%");
});

test("time-based mode discharges only in the day's top-price hours", () => {
  const n = 24;
  const net = Float64Array.from({ length: n }, (_, h) => (h >= 10 && h < 14 ? -3 : 1));
  const p = flatPrices(n, (h) => (h >= 16 && h < 21 ? 0.5 : 0.2), 0.05);
  const r = runPeak(net, battery({ kwh: 10, kw: 5, roundTrip: 1 }), p);
  for (let h = 0; h < n; h++) if (net[h] > 0 && !(h >= 16 && h < 21)) assert.equal(r.grid[h], net[h], `hour ${h}`);
  for (let h = 16; h < 21; h++) assert.equal(r.grid[h], 0);
});

test("payback scales the data to a year", () => {
  const p = payback(100, 4380, 1000);
  near(p.perYear, 200);
  near(p.years, 5);
  assert.equal(payback(-5, 8760, 1000).years, null);
});
