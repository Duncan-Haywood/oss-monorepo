import { test } from "node:test";
import assert from "node:assert/strict";
import {
  analyze, normalize, steadyState, rampFactor, cashCurve, breakEvenUtilization, breakEvenMembers,
  utilizationRateGrid, membershipGrid, rankLevers, reportCsv, sampleInputs, DEFAULTS, WEEKS_PER_MONTH,
  money, pct, yrs, months,
} from "./calc.mjs";

const near = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) < e, `${a} vs ${b}`);
const ss = (o) => steadyState(normalize({ feePct: 0, ...o }).values);

// Two courts, 10 peak hours a week at $40, 50% booked: 2*10*52/12 = 86.667
// capacity hours, 43.333 booked, $1,733.33 a month.
const simple = { courts: 2, peakHours: 10, peakRate: 40, peakUtil: 50 };

test("capacity, booked hours and court revenue match a hand calculation", () => {
  const s = ss(simple);
  near(s.capTotal, 2 * 10 * WEEKS_PER_MONTH);
  near(s.capTotal, 86.6666667, 1e-5);
  near(s.bookedTotal, 43.3333333, 1e-5);
  near(s.courtRevenue, 1733.3333333, 1e-5);
  near(s.utilization, 0.5);
  near(s.revPerAvailableCourtHour, 20, 1e-9);
  near(s.revPerBookedCourtHour, 40, 1e-9);
});

test("three dayparts add up with their own rates and utilization", () => {
  const s = ss({ courts: 1, peakHours: 12, offPeakHours: 24, weekendHours: 12, peakRate: 50, offPeakRate: 20, weekendRate: 40, peakUtil: 100, offPeakUtil: 50, weekendUtil: 25 });
  const w = WEEKS_PER_MONTH;
  near(s.courtRevenue, 12 * w * 50 + 24 * w * 0.5 * 20 + 12 * w * 0.25 * 40, 1e-6);
  near(s.capTotal, 48 * w);
});

test("membership dues count, and member play comes out of the booked hours", () => {
  const s = ss({ ...simple, members: 10, memberFee: 100, memberHours: 2 });
  near(s.membershipRevenue, 1000);
  near(s.memberCourtHours, 20);
  near(s.payToPlayHours.peak, 43.3333333 - 20, 1e-5);
  near(s.courtRevenue, (43.3333333 - 20) * 40, 1e-4);
  near(s.occupiedHours, 43.3333333, 1e-5);
});

test("member hours beyond the booked hours raise occupancy and leave nothing to sell", () => {
  const s = ss({ ...simple, members: 20, memberFee: 50, memberHours: 3 });
  near(s.memberCourtHours, 60);
  near(s.courtRevenue, 0);
  near(s.occupiedHours, 60);
  assert.equal(s.memberCapped, false);
  assert.match(s.warnings.join(" "), /more than the booked hours/);
});

test("member court-hours above capacity are capped, with a warning", () => {
  const s = ss({ ...simple, members: 100, memberFee: 50, memberHours: 5 });
  assert.equal(s.memberCapped, true);
  near(s.memberCourtHours, s.capTotal);
  near(s.occupiedHours, s.capTotal);
  near(s.utilization, 1);
  near(s.courtRevenue, 0);
  near(s.membershipRevenue, 5000, 1e-9);
  assert.match(s.warnings.join(" "), /capped at capacity/);
});

test("zero courts yields zero court and member revenue and a warning, not NaN", () => {
  const s = ss({ courts: 0, peakHours: 10, peakRate: 40, peakUtil: 50, members: 50, memberFee: 100, memberHours: 4, leagueRevenue: 500 });
  assert.equal(s.capTotal, 0);
  assert.equal(s.courtRevenue, 0);
  assert.equal(s.membershipRevenue, 0);
  assert.equal(s.revenue, 500);
  assert.equal(s.revPerAvailableCourtHour, null);
  assert.match(s.warnings.join(" "), /No courts/);
  const r = analyze({ courts: 0 });
  assert.ok(!r.error);
  assert.equal(r.breakEvenMembers, null);
  assert.ok(Object.values(r.steady).every((v) => typeof v !== "number" || Number.isFinite(v)));
});

test("0% utilization earns no hourly revenue and costs still run", () => {
  const s = ss({ ...simple, peakUtil: 0, rentMonthly: 4000 });
  assert.equal(s.courtRevenue, 0);
  assert.equal(s.utilization, 0);
  assert.equal(s.revPerBookedCourtHour, null);
  near(s.noi, -4000);
});

test("100% utilization books every hour", () => {
  const s = ss({ ...simple, peakUtil: 100 });
  near(s.courtRevenue, 86.6666667 * 40, 1e-4);
});

test("other revenue, pro-shop gross profit and the percentage fee", () => {
  const s = steadyState(normalize({ ...simple, leagueRevenue: 1000, lessonRevenue: 500, eventRevenue: 500, proShopSales: 4000, proShopMarginPct: 25, feePct: 3 }).values);
  near(s.programRevenue, 2000);
  near(s.proShopProfit, 1000);
  near(s.feeBase, 1733.3333333 + 2000, 1e-5);
  near(s.processing, (1733.3333333 + 2000) * 0.03, 1e-5);
  near(s.revenue, 1733.3333333 + 2000 + 1000, 1e-5);
});

test("noi subtracts fixed costs and fees, cash subtracts debt service", () => {
  const s = steadyState(normalize({ ...simple, staffMonthly: 500, rentMonthly: 300, utilitiesMonthly: 100, insuranceMonthly: 50, otherMonthly: 50, feePct: 10, debtServiceMonthly: 200 }).values);
  near(s.fixedCosts, 1000);
  near(s.processing, 173.3333333, 1e-5);
  near(s.noi, 1733.3333333 - 1000 - 173.3333333, 1e-5);
  near(s.cash, s.noi - 200);
});

test("normalize reports bad input by field and accepts $ and % text", () => {
  assert.match(normalize({ courts: "abc" }).errors[0], /Courts is not a number/);
  assert.match(normalize({ peakUtil: 120 }).errors[0], /Peak utilization % must be between/);
  assert.match(normalize({ rentMonthly: -5 }).errors[0], /Rent per month must be between/);
  const ok = normalize({ courts: "6", peakRate: "$48.50", peakUtil: "70%" });
  assert.equal(ok.errors.length, 0);
  assert.equal(ok.values.peakRate, 48.5);
  assert.equal(ok.values.peakUtil, 70);
  assert.equal(normalize({}).values.feePct, DEFAULTS.feePct);
  const frac = normalize({ courts: 4.7 });
  assert.equal(frac.values.courts, 4);
  assert.match(frac.warnings.join(" "), /rounded down/);
  assert.ok(analyze({ courts: "x" }).error);
});

test("ramp factor climbs linearly to steady state and stays there", () => {
  near(rampFactor(1, 0, 30), 1);
  near(rampFactor(0, 10, 20), 0.2);
  near(rampFactor(5, 10, 20), 0.6);
  near(rampFactor(10, 10, 20), 1);
  near(rampFactor(40, 10, 20), 1);
});

test("cash curve starts at own cash out, ramps revenue, and charges fixed costs from month 1", () => {
  const v = normalize({ ...simple, rentMonthly: 500, buildOutCost: 10000, loanProceeds: 4000, rampMonths: 4, rampStartPct: 50, feePct: 0 }).values;
  const s = steadyState(v);
  const c = cashCurve(v, s, 6);
  assert.equal(c[0].cumulative, -6000);
  near(c[1].revenue, s.revenue * (0.5 + 0.5 * 1 / 4));
  near(c[1].noi, s.revenue * 0.625 - 500);
  near(c[4].revenue, s.revenue);
  near(c[6].cumulative, -6000 + c.slice(1).reduce((a, r) => a + r.cash, 0));
});

test("months to cash break-even and peak drawdown on a hand example", () => {
  // 2 courts, $1,733.33 revenue, $733.33 costs => $1,000 a month at steady state, no ramp.
  const r = analyze({ ...simple, feePct: 0, rentMonthly: 733.3333333333, buildOutCost: 5000, rampMonths: 0 });
  near(r.steady.noi, 1000, 1e-4);
  assert.equal(r.monthsToCashBreakeven, 5);
  near(r.peakCashDrawdown, 5000);
  near(r.buildOutPaybackYears, 5000 / 12000, 1e-6);
  assert.equal(r.curve.length, 25);
});

test("debt service delays break-even; a facility that loses money never breaks even", () => {
  const base = { ...simple, feePct: 0, rentMonthly: 733.3333333333, buildOutCost: 5000, rampMonths: 0 };
  assert.equal(analyze({ ...base, debtServiceMonthly: 500 }).monthsToCashBreakeven, 10);
  const loss = analyze({ ...base, rentMonthly: 2000 });
  assert.equal(loss.monthsToCashBreakeven, null);
  assert.equal(loss.buildOutPaybackYears, null);
  assert.match(loss.warnings.join(" "), /loses money/);
  assert.match(loss.verdict, /does not turn positive/);
});

test("zero build-out cost: profitable pays back in month 1, a loss-maker never does", () => {
  const r = analyze({ ...simple, feePct: 0, rentMonthly: 100, rampMonths: 0 });
  assert.equal(r.monthsToCashBreakeven, 1);
  assert.equal(r.peakCashDrawdown, 0);
  assert.equal(analyze({ ...simple, feePct: 0, rentMonthly: 5000, rampMonths: 0 }).monthsToCashBreakeven, null);
  assert.equal(r.buildOutPaybackYears, null);
});

test("financing more than the build-out is clamped, with a warning", () => {
  const r = analyze({ ...simple, buildOutCost: 1000, loanProceeds: 5000 });
  assert.equal(r.ownCash, 0);
  assert.match(r.warnings.join(" "), /own cash in is treated as zero/);
});

test("break-even utilization zeroes cash after debt service", () => {
  const v = normalize({ ...simple, feePct: 0, rentMonthly: 800 }).values;
  const u = breakEvenUtilization(v);
  near(u, 800 / 40 / (2 * 10 * WEEKS_PER_MONTH), 1e-6);
  near(steadyState({ ...v, peakUtil: u * 100 }).cash, 0, 1e-4);
});

test("break-even utilization keeps the peak/off-peak shape and can be unreachable", () => {
  const v = normalize({ courts: 1, peakHours: 10, offPeakHours: 10, peakRate: 40, offPeakRate: 20, peakUtil: 80, offPeakUtil: 40, feePct: 0, rentMonthly: 1000 }).values;
  const u = breakEvenUtilization(v);
  assert.ok(u > 0 && u < 0.6);
  const k = u / 0.6; // shape scales by the same factor
  near(steadyState({ ...v, peakUtil: 80 * k, offPeakUtil: 40 * k }).cash, 0, 1e-4);
  assert.equal(breakEvenUtilization({ ...v, rentMonthly: 1e6 }), null);
  assert.equal(breakEvenUtilization({ ...v, rentMonthly: 0 }), 0);
});

test("break-even members count dues net of the hourly play they displace", () => {
  // Full-rate hours are worth $20 a head (2h at $10... use cheap rate so dues win).
  const v = normalize({ courts: 2, peakHours: 10, peakRate: 10, peakUtil: 100, feePct: 0, memberFee: 100, memberHours: 1, rentMonthly: 1000, members: 0 }).values;
  // Without members: 86.667 h * $10 = $866.67, cost $1,000 => -133.33. Each member nets 100 - 10 = 90.
  assert.equal(breakEvenMembers(v), 2);
  assert.equal(breakEvenMembers({ ...v, rentMonthly: 0 }), 0);
  assert.equal(breakEvenMembers({ ...v, memberFee: 5 }), null);
  assert.equal(breakEvenMembers({ ...v, courts: 0 }), null);
});

test("utilization x peak rate grid: centre cell is the base case, rows and columns are monotone", () => {
  const v = normalize(sampleInputs()).values;
  const g = utilizationRateGrid(v);
  assert.equal(g.length, 5);
  near(g[2].cells[2].cash, steadyState(v).cash, 1e-6);
  for (const row of g) for (let i = 1; i < 5; i++) assert.ok(row.cells[i].cash >= row.cells[i - 1].cash - 1e-9);
  for (let i = 1; i < 5; i++) assert.ok(g[i].cells[2].cash >= g[i - 1].cells[2].cash - 1e-9);
  assert.ok(g.every((r) => r.cells.every((c) => Number.isFinite(c.cash))));
});

test("utilization deltas clamp at 0 and 100 percent", () => {
  const v = normalize({ ...simple, peakUtil: 95 }).values;
  const g = utilizationRateGrid(v, [20], [0]);
  near(g[0].cells[0].cash, steadyState({ ...v, peakUtil: 100 }).cash);
  const lo = utilizationRateGrid(normalize({ ...simple, peakUtil: 5 }).values, [-20], [0]);
  near(lo[0].cells[0].cash, steadyState({ ...v, peakUtil: 0 }).cash);
});

test("membership fee x member count grid: centre is the base case and member counts round", () => {
  const v = normalize({ ...sampleInputs(), members: 33 }).values;
  const g = membershipGrid(v);
  near(g[2].cells[2].cash, steadyState(v).cash, 1e-6);
  assert.deepEqual(g[2].cells.map((c) => c.members), [17, 25, 33, 41, 50]);
  near(g[4].memberFee, v.memberFee * 1.2);
});

test("lever ranking: sorted by swing, symmetric for linear inputs, zero-valued inputs skipped", () => {
  const v = normalize({ ...simple, feePct: 0, rentMonthly: 500, staffMonthly: 200 }).values;
  const rows = rankLevers(v);
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i - 1].swing >= rows[i].swing);
  const rent = rows.find((r) => r.key === "rentMonthly");
  near(rent.up, -50 * 12);
  near(rent.down, 50 * 12);
  const rate = rows.find((r) => r.key === "peakRate");
  near(rate.up, 1733.3333333 * 0.1 * 12, 1e-4);
  near(rate.elasticity, (1733.3333333 * 0.1 * 12) / ((1733.3333333 - 700) * 12) / 0.1, 1e-6);
  assert.equal(rows.find((r) => r.key === "members"), undefined);
  assert.equal(rows.find((r) => r.key === "offPeakRate"), undefined);
});

test("lever ranking handles zero NOI (no elasticity) and clamps percentage inputs", () => {
  const flat = rankLevers(normalize({ ...simple, feePct: 0, rentMonthly: 1733.3333333333333 }).values);
  assert.equal(flat.find((r) => r.key === "peakRate").elasticity, null);
  const full = rankLevers(normalize({ ...simple, peakUtil: 100 }).values);
  near(full.find((r) => r.key === "peakUtil").up, 0, 1e-9);
});

test("the sample runs end to end and is internally consistent", () => {
  const r = analyze(sampleInputs());
  assert.ok(!r.error);
  near(r.annual.noi, r.steady.noi * 12);
  near(r.annual.cash, r.annual.noi - r.annual.debt);
  near(r.steady.revenue - r.steady.opex, r.steady.noi);
  assert.equal(r.curve[0].month, 0);
  assert.equal(r.curve[24].month, 24);
  near(r.curve[24].cumulative, r.curve[0].cumulative + r.curve.slice(1).reduce((a, c) => a + c.cash, 0), 1e-6);
  assert.ok(r.breakEvenUtilization > 0 && r.breakEvenUtilization < 1);
  assert.ok(r.peakCashDrawdown >= r.ownCash);
  assert.equal(r.levers[0].key, "hours");
  assert.deepEqual(r.warnings, []);
});

test("analysis is deterministic: the same inputs give identical output", () => {
  assert.deepEqual(analyze(sampleInputs()), analyze(sampleInputs()));
});

test("CSV export quotes commas and carries the headline numbers", () => {
  const csv = reportCsv(analyze(sampleInputs()));
  assert.match(csv, /^Line,Per month at steady state\n/);
  assert.match(csv, /Pro-shop \/ F&B gross profit,/);
  assert.match(csv, /Month,Revenue,Operating costs,Debt service,Cash,Cumulative cash/);
  assert.equal(csv.trim().split("\n").filter((l) => /^\d+,/.test(l)).length, 25);
  assert.match(reportCsv(analyze({ ...simple, rentMonthly: 9999 })), /Months to cash break-even,\n/);
});

test("formatters", () => {
  assert.equal(money(-1234.5), "-$1,235");
  assert.equal(money(0), "$0");
  assert.equal(pct(0.1234), "12.3%");
  assert.equal(pct(null), "n/a");
  assert.equal(yrs(2.25), "2.3 years");
  assert.equal(yrs(null), "never");
  assert.equal(months(null), "not within 10 years");
  assert.equal(months(7), "month 7");
});
