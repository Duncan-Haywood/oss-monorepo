import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseSeasons, parseDurations, erlangB, analyticYear, makeRng, simulate, bestAnalytic,
  analyze, reportCsv, sampleSeasons, sampleDurations, money, money2, pct, DEFAULTS,
} from "./calc.mjs";

const near = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) < e, `${a} vs ${b}`);
const E = { price: 85, costPerRental: 18, unitCost: 1100, lostCost: 0, vmr: 1, seed: 1 };
const seasons = (t) => parseSeasons(t).rows;
const durs = (t) => parseDurations(t).rows;

test("parses seasons with a header and tabs, and skips bad lines", () => {
  const p = parseSeasons("season,days,per day\nPeak,150,2.4\nOff\t215\t0.2\nbad,x,1\nNeg,-5,1\nHalf,1.5,1");
  assert.equal(p.rows.length, 2);
  assert.deepEqual(p.rows[0], { name: "Peak", days: 150, rate: 2.4 });
  assert.equal(p.totalDays, 365);
  assert.match(p.warnings.join(" "), /3 season line/);
  assert.ok(parseSeasons("").error);
  assert.ok(parseSeasons("A,10,0").error, "no demand at all is an error");
  assert.match(parseSeasons("A,300,1\nB,100,1").error, /add up to 400 days/);
  assert.match(parseSeasons("A,100,1").warnings.join(" "), /265 days/);
});

test("parses rental lengths, normalises shares and reports the mean", () => {
  const p = parseDurations("days,share\n1,50\n3,50\n0,10\nx,1");
  assert.deepEqual(p.rows, [{ days: 1, share: 0.5 }, { days: 3, share: 0.5 }]);
  near(p.mean, 2);
  assert.match(p.warnings.join(" "), /2 rental-length line/);
  near(parseDurations("4").mean, 4);
  near(parseDurations("1,30\n2,60\n3,10").mean, 1.8);
  assert.ok(parseDurations("zero").error);
  assert.ok(parseDurations("").error);
});

test("Erlang B matches the textbook values and the closed form", () => {
  assert.equal(erlangB(0, 5), 1);
  near(erlangB(1, 1), 0.5);
  near(erlangB(2, 1), 0.2);
  near(erlangB(3, 0), 0);
  for (const [c, a] of [[5, 3], [10, 7.5], [20, 15], [4, 0.4]]) {
    let fact = 1, sum = 0, top = 0;
    for (let k = 0; k <= c; k++) { if (k) fact *= k; const t = Math.pow(a, k) / fact; sum += t; top = t; }
    near(erlangB(c, a), top / sum, 1e-12);
  }
  assert.ok(Number.isNaN(erlangB(-1, 2)) && Number.isNaN(erlangB(2.5, 2)));
  // decreasing and convex in c
  const b = Array.from({ length: 12 }, (_, c) => erlangB(c, 6));
  for (let c = 1; c < 11; c++) { assert.ok(b[c] < b[c - 1]); assert.ok(b[c - 1] - b[c] >= b[c] - b[c + 1] - 1e-12); }
});

test("analyticYear: hand calculation for one season", () => {
  // 100 days at 2 requests a day, rentals of 1.5 days -> load 3; 4 units.
  const b = erlangB(4, 3);
  const y = analyticYear(4, seasons("S,100,2"), 1.5, E);
  near(y.requests, 200);
  near(y.rentals, 200 * (1 - b));
  near(y.rentalDays, 200 * (1 - b) * 1.5);
  near(y.revenue, 200 * (1 - b) * 1.5 * 85);
  near(y.variable, 200 * (1 - b) * 18);
  near(y.owning, 4400);
  near(y.profit, y.revenue - y.variable - 4400);
  near(y.utilization, (3 * (1 - b)) / 4);
  near(y.turnAwayShare, b);
  const withLoss = analyticYear(4, seasons("S,100,2"), 1.5, { ...E, lostCost: 10 });
  near(withLoss.profit, y.profit - 10 * 200 * b);
});

test("seasons are priced separately: a fleet sized for the average loses the peak", () => {
  const s = seasons("Peak,60,6\nOff,305,0.5");
  const y = analyticYear(8, s, 2, E);
  assert.ok(y.bySeason[0].turnAway > 10 * y.bySeason[1].turnAway);
  assert.equal(y.bySeason.length, 2);
  near(y.bySeason[0].load, 12);
  near(y.bySeason[1].load, 1);
});

test("the random generators have the right mean and spread", () => {
  const r = makeRng(7);
  const n = 40000;
  const draw = (f) => { const x = Array.from({ length: n }, f); const m = x.reduce((s, v) => s + v, 0) / n; return [m, x.reduce((s, v) => s + (v - m) ** 2, 0) / n]; };
  const [pm, pv] = draw(() => r.poisson(2.4));
  assert.ok(Math.abs(pm - 2.4) < 0.05 && Math.abs(pv - 2.4) < 0.1, `${pm} ${pv}`);
  const [bm, bv] = draw(() => r.poisson(r.gamma(2.4 / 1.5) * 1.5));
  assert.ok(Math.abs(bm - 2.4) < 0.07 && Math.abs(bv / bm - 2.5) < 0.15, `${bm} ${bv / bm}`);
  const [lm] = draw(() => r.poisson(40));
  assert.ok(Math.abs(lm - 40) < 0.3, "large means are split correctly");
  const [gm] = draw(() => r.gamma(0.4));
  assert.ok(Math.abs(gm - 0.4) < 0.02);
  const a = makeRng(5), b = makeRng(5);
  assert.deepEqual([a.uniform(), a.uniform()], [b.uniform(), b.uniform()]);
});

test("simulation matches the exact day-batch answer for one-day rentals", () => {
  // One-day rentals booked by date: a day's units are free again the next
  // morning, so the turn-away share is E[(N - c)+] / lambda with N ~ Poisson.
  const lam = 2.4, c = 4;
  let p = Math.exp(-lam), e = 0;
  for (let n = 1; n < 80; n++) { p *= lam / n; if (n > c) e += (n - c) * p; }
  const sim = simulate(seasons("A,365,2.4"), durs("1"), E, 5, 400);
  assert.ok(Math.abs(sim[c - 1].turnAwayShare - e / lam) < 0.006, `${sim[c - 1].turnAwayShare} vs ${e / lam}`);
});

test("simulation is repeatable, monotone in fleet size, and cautious Erlang B is above it", () => {
  const s = seasons(sampleSeasons()), d = durs(sampleDurations());
  const a = simulate(s, d, E, 14, 60), b = simulate(s, d, E, 14, 60);
  assert.deepEqual(a, b);
  for (let i = 1; i < a.length; i++) {
    assert.ok(a[i].turnAwayShare <= a[i - 1].turnAwayShare + 1e-12, "more units never turn away more (same simulated years)");
    assert.ok(a[i].utilization <= a[i - 1].utilization + 1e-12);
  }
  const mean = parseDurations(sampleDurations()).mean;
  for (const c of [4, 8, 12]) assert.ok(a[c - 1].turnAwayShare < analyticYear(c, s, mean, E).turnAwayShare, "date-booked fleets block less than the any-hour model");
  const c = simulate(s, d, { ...E, seed: 2 }, 3, 60);
  assert.notDeepEqual(c[0], a[0]);
});

test("simulated utilization is consistent with revenue", () => {
  const s = seasons("A,365,1.2"), d = durs("2");
  const sim = simulate(s, d, E, 6, 300);
  // busy unit-days per year = accepted requests x 2 days; accepted = requests x (1 - turn-away)
  const expectDays = 365 * 1.2 * (1 - sim[3].turnAwayShare) * 2;
  assert.ok(Math.abs(sim[3].utilization * 4 * 365 - expectDays) / expectDays < 0.02);
});

test("clustered bookings turn away more customers and widen the spread", () => {
  const s = seasons(sampleSeasons()), d = durs(sampleDurations());
  const calm = simulate(s, d, E, 10, 150), lumpy = simulate(s, d, { ...E, vmr: 3 }, 10, 150);
  assert.ok(lumpy[8].turnAwayShare > calm[8].turnAwayShare);
  assert.ok(lumpy[8].p90 - lumpy[8].p10 > calm[8].p90 - calm[8].p10);
});

test("analyze: the recommendation is the profit-maximising whole number of units", () => {
  const r = analyze(seasons(sampleSeasons()), durs(sampleDurations()), { bookingStyle: "anytime" });
  assert.equal(r.primary, "Erlang B");
  const best = r.curve.reduce((m, c) => (c.analytic.profit > m.analytic.profit ? c : m));
  assert.equal(r.recommendedUnits, best.units);
  assert.equal(r.recommended.units, best.units);
  // concave: marginal profit falls, and is positive up to the optimum
  for (let i = 1; i < r.curve.length; i++) assert.ok(r.curve[i].marginalAnalytic <= r.curve[i - 1].marginalAnalytic + 1e-9);
  for (const c of r.curve) { if (c.units <= r.recommendedUnits) assert.ok(c.marginalAnalytic > 0); else assert.ok(c.marginalAnalytic <= 1e-9); }
  assert.ok(r.curve.length >= r.recommendedUnits + 3, "the curve is evaluated past the optimum");
  near(r.meanDays, 2.45);
  near(r.curve[0].marginalAnalytic, r.curve[0].analytic.profit);
  assert.equal(r.recommendedUnits, 11);
  assert.match(r.verdict, /Own 11 units/);
});

test("analyze: calendar-date booking uses the simulation and recommends no more units than Erlang B", () => {
  const s = seasons(sampleSeasons()), d = durs(sampleDurations());
  const any = analyze(s, d, { bookingStyle: "anytime" }), date = analyze(s, d, {});
  assert.equal(date.primary, "day-by-day simulation");
  assert.ok(date.recommendedUnits <= any.recommendedUnits);
  assert.ok(date.recommendedUnits >= any.recommendedUnits - 3);
  assert.equal(date.curve[0].sim.units, 1);
  assert.equal(date.years, 200);
});

test("analyze: a turn-away cap can force more units than profit alone and says what it costs", () => {
  const s = seasons(sampleSeasons()), d = durs(sampleDurations());
  const free = analyze(s, d, { bookingStyle: "anytime" });
  const capped = analyze(s, d, { bookingStyle: "anytime", maxTurnAway: 0.5 });
  assert.ok(capped.recommendedUnits > free.recommendedUnits);
  assert.equal(capped.capUnits, capped.curve.find((c) => c.analytic.turnAwayShare * 100 <= 0.5).units);
  assert.match(capped.verdict, /turn-away cap/);
  assert.equal(analyze(s, d, { bookingStyle: "anytime", maxTurnAway: 90 }).recommendedUnits, free.recommendedUnits);
  const impossible = analyze(s, d, { bookingStyle: "anytime", maxTurnAway: 0, maxUnits: 5 });
  assert.equal(impossible.capUnits, null);
  assert.match(impossible.warnings.join(" "), /No fleet up to 5 units/);
});

test("analyze: compares with the fleet you own today", () => {
  const s = seasons(sampleSeasons()), d = durs(sampleDurations());
  const r = analyze(s, d, { bookingStyle: "anytime", currentUnits: 6 });
  near(r.current.profit, r.curve[5].analytic.profit);
  assert.match(r.verdict, /Against the 6 you own today that is \+\$/);
  const same = analyze(s, d, { bookingStyle: "anytime", currentUnits: r.recommendedUnits });
  assert.match(same.verdict, /matches the \d+ you own today/);
  assert.ok(analyze(s, d, { currentUnits: 40 }).curve.length >= 40, "a large current fleet is still evaluated");
  assert.equal(analyze(s, d, { currentUnits: 0 }).current.profit, 0);
});

test("analyze: when nothing pays, it says so instead of recommending a loss", () => {
  const r = analyze(seasons("A,365,0.05"), durs("1"), { bookingStyle: "anytime", unitCost: 5000 });
  assert.equal(r.recommendedUnits, 0);
  assert.equal(r.recommended, null);
  assert.match(r.verdict, /no fleet size earns more than it costs/);
  const cheap = analyze(seasons("A,365,2"), durs("2"), { price: 5, costPerRental: 40 });
  assert.match(cheap.warnings.join(" "), /does not cover the per-rental cost/);
  assert.equal(cheap.recommendedUnits, 0);
});

test("analyze: break-even rental days and demand sensitivity", () => {
  const r = analyze(seasons(sampleSeasons()), durs(sampleDurations()), { bookingStyle: "anytime" });
  near(r.perUnitMargin, 85 - 18 / 2.45);
  near(r.breakEvenDays, 1100 / r.perUnitMargin);
  assert.deepEqual(r.sensitivity.map((x) => x.factor), [0.7, 0.85, 1, 1.15, 1.3]);
  for (let i = 1; i < r.sensitivity.length; i++) assert.ok(r.sensitivity[i].units >= r.sensitivity[i - 1].units);
  assert.equal(r.sensitivity[2].units, r.recommendedUnits);
  assert.ok(r.sensitivity[0].units < r.sensitivity[4].units);
  const b = bestAnalytic(seasons("A,365,1"), 2, E, 30);
  assert.ok(b.units >= 1 && b.profit > 0);
  // the marginal unit at the optimum is worth roughly its cost: marginal days x margin ~ unit cost
  const m = r.curve[r.recommendedUnits - 1].marginalDays * r.perUnitMargin;
  assert.ok(m >= 1100 && r.curve[r.recommendedUnits].marginalDays * r.perUnitMargin < 1100);
});

test("analyze: validates its inputs and caps its own work", () => {
  const s = seasons(sampleSeasons()), d = durs(sampleDurations());
  for (const bad of [{ price: 0 }, { costPerRental: -1 }, { unitCost: -5 }, { vmr: 0.5 }, { vmr: 40 }, { maxTurnAway: 100 }, { currentUnits: 2.5 }, { maxUnits: 0 }, { lostCost: -1 }]) {
    assert.ok(analyze(s, d, bad).error, JSON.stringify(bad));
  }
  const big = analyze(seasons("A,365,35"), durs("5"), { years: 2000 });
  assert.ok(big.years < 2000 && big.years >= 20);
  assert.match(big.warnings.join(" "), /ran \d+ years instead of 2000/);
  assert.match(big.warnings.join(" "), /larger operation/);
  assert.ok(big.maxC <= 200);
  assert.equal(analyze(s, d, { maxUnits: 4 }).curve.length, 4);
});

test("CSV has one row per fleet size and escapes cleanly", () => {
  const r = analyze(seasons(sampleSeasons()), durs(sampleDurations()), { years: 20 });
  const lines = reportCsv(r).trim().split("\n");
  assert.equal(lines.length, r.curve.length + 1);
  assert.equal(lines[0].split(",").length, 10 + 0);
  assert.ok(lines[1].startsWith("1,"));
});

test("formatting helpers and defaults", () => {
  assert.equal(money(1234.6), "$1,235");
  assert.equal(money(-50), "−$50");
  assert.equal(money(NaN), "—");
  assert.equal(money2(5), "$5.00");
  assert.equal(pct(0.1234, 1), "12.3%");
  assert.equal(DEFAULTS.vmr, 1);
  assert.ok(parseSeasons(sampleSeasons()).rows.length === 3);
  assert.equal(parseSeasons(sampleSeasons()).warnings.length, 0);
});

test("sub-renting overflow adds its margin to profit and never raises the best fleet size", () => {
  const se = seasons("S,100,2");
  const base = analyticYear(2, se, 1.5, E);
  const ov = analyticYear(2, se, 1.5, { ...E, overflowMargin: 20, overflowShare: 50 });
  assert.ok(Math.abs(ov.overflow - base.turnedAway * 10) < 1e-9);
  assert.ok(Math.abs(ov.profit - (base.profit + base.turnedAway * 10)) < 1e-9);
  const dur = [{ days: 1, share: 1 }, { days: 2, share: 1 }].map((d) => ({ ...d, share: 0.5 }));
  const a = analyze(se, dur, { ...E, years: 40 });
  const b = analyze(se, dur, { ...E, years: 40, overflowMargin: 40, overflowShare: 100 });
  assert.ok(b.recommendedUnits <= a.recommendedUnits);
  assert.match(b.verdict, /sub-rent/);
  assert.ok(analyze(se, dur, { ...E, overflowShare: 120 }).error);
  assert.ok(analyze(se, dur, { ...E, overflowMargin: -1 }).error);
});
