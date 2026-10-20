import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, parse, SAMPLE, openHoursWeek, capacityScale, leagueFactor, payment, scaleAt, summaryText, sweepCsv } from "./calc.mjs";

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);
const W = 52 / 12;
// Hand-checkable center: 1 lane open 10 h on 5 weekdays and 0 on weekends = 50 open hours; all off-peak, 50% booked, $20 an hour, $1,000 rent.
const BASE = { lanes: "1", hoursWeekday: "10", hoursWeekend: "0", peakShare: "0", peakUtil: "0", offUtil: "50", peakPrice: "40", offPrice: "20", rentMonthly: "1000" };

test("open and booked hours", () => {
  const p = parse(BASE);
  assert.equal(openHoursWeek(p), 50);
  const r = compute(BASE);
  near(r.steady.hours, 25 * W);
  near(r.plannedUtil, 0.5);
});

test("lane revenue, fixed cost and profit follow the stated rules", () => {
  const r = compute(BASE);
  assert.deepEqual(r.errors, []);
  near(r.steady.revenue, 25 * W * 20);
  near(r.steady.fixed, 1000);
  near(r.steady.profit, 25 * W * 20 - 1000);
  near(r.bePctOps, 1000 / (25 * W * 20) * 100, 1e-9);
  near(r.beHoursOps, 25 * 1000 / (25 * W * 20), 1e-9);
  near(r.beUtilOps, r.beHoursOps / 50, 1e-9);
});

test("league discount lowers the average lane price", () => {
  const p = parse({ ...BASE, leaguePct: "40", leagueDiscount: "25" });
  near(leagueFactor(p), 0.9);
  near(compute({ ...BASE, leaguePct: "40", leagueDiscount: "25" }).steady.laneRev, 25 * W * 20 * 0.9);
});

test("peak and off-peak hours are priced separately", () => {
  const r = compute({ ...BASE, peakShare: "20", peakUtil: "100", offUtil: "50" });
  // 10 peak hours fully booked at $40, 40 off-peak hours half booked at $20.
  near(r.steady.laneRev, (10 * 40 + 20 * 20) * W);
});

test("fees come off revenue and raise break-even", () => {
  const r = compute({ ...BASE, feesPct: "10" });
  near(r.steady.lost, 25 * W * 20 * 0.1);
  near(r.bePctOps, 1000 / (25 * W * 20 * 0.9) * 100, 1e-9);
});

test("parties carry the party cost share as a variable cost", () => {
  const r = compute({ ...BASE, partiesWeek: "10", partyPrice: "60", partyCostPct: "70" });
  near(r.steady.partyRev, 10 * W * 60);
  near(r.steady.variable, 10 * W * 60 * 0.7);
});

test("food, drink and arcade use bowlers per hour and the arcade margin", () => {
  const r = compute({ ...BASE, bowlersPerHour: "4", fbSpend: "5", fbCogsPct: "40", arcadePerHour: "2", arcadeMarginPct: "50", perHourCost: "1" });
  const h = 25 * W;
  near(r.steady.fb, h * 4 * 5);
  near(r.steady.arcade, h * 2);
  near(r.steady.variable, h * 20 * 0.4 + h * 2 * 0.5 + h * 1);
});

test("staff cost is hours x wage x payroll load x 52/12", () => {
  const r = compute({ ...BASE, staffHours: "100", wage: "15", burdenPct: "20" });
  near(r.steady.fixed, 1000 + 100 * W * 15 * 1.2);
});

test("the price factor lands exactly on the target margin", () => {
  const r = compute(SAMPLE);
  const p = parse(SAMPLE);
  const x = r.priceFactor;
  const scaled = compute({ ...SAMPLE, peakPrice: String(p.peakPrice * x), offPrice: String(p.offPrice * x), partyPrice: String(p.partyPrice * x) });
  near(scaled.margin, p.targetMargin / 100, 1e-9);
});

test("a sweep row at 100% matches the planned month and a row past capacity is capped", () => {
  const r = compute(SAMPLE);
  near(r.demandSweep.find((x) => x.scale === 1).profit, r.steady.profit, 0.01);
  near(r.priceSweep.find((x) => x.pct === 0).profit, r.steady.profit, 0.01);
  near(r.wageSweep.find((x) => x.pct === 0).profit, r.steady.profit, 0.01);
  const full = compute({ ...BASE, offUtil: "95" });
  near(capacityScale(parse({ ...BASE, offUtil: "95" })), 100 / 95);
  const row = full.demandSweep.find((x) => x.scale === 1.1);
  assert.equal(row.capped, true);
  near(row.util, 1);
});

test("break-even is unreachable when it needs more hours than the lanes hold", () => {
  const r = compute({ ...BASE, rentMonthly: "9000" });
  assert.equal(r.beHoursOps, null);
  assert.ok(r.findings.some((f) => f.severity === "high" && /loses/.test(f.title)));
});

test("higher wages cut profit by the staff share they touch", () => {
  const r = compute(SAMPLE);
  const up = r.wageSweep.find((x) => x.pct === 10), base = r.wageSweep.find((x) => x.pct === 0);
  const p = parse(SAMPLE);
  near(base.profit - up.profit, p.staffHours * W * p.wage * (1 + p.burdenPct / 100) * 0.1, 0.01);
});

test("loan payment matches the annuity formula", () => {
  near(payment(100000, 0, 10), 100000 / 120);
  near(payment(100000, 6, 10), 1110.2050, 1e-3);
  assert.equal(payment(0, 6, 10), 0);
});

test("startup cost sums lanes, fit-out, barkitchen, deposit, launch and contingency", () => {
  const r = compute({ ...BASE, lanes: "2", laneCost: "50000", fitout: "100000", barkitchen: "20000", launch: "5000", depositMonths: "2", contingencyPct: "10" });
  near(r.cost.lanes, 100000);
  near(r.cost.contingency, 22500);
  near(r.cost.total, 100000 + 100000 + 20000 + 2000 + 5000 + 22500);
});

test("ramp-up starts low, shows a cash trough, and payback is the first month cumulative cash covers equity", () => {
  assert.equal(scaleAt(parse({ ...BASE, startPct: "20", rampMonths: "5" }), 1), 0.2);
  assert.equal(scaleAt(parse({ ...BASE, startPct: "20", rampMonths: "5" }), 5), 1);
  near(scaleAt(parse({ ...BASE, startPct: "20", rampMonths: "5" }), 3), 0.6);
  const slow = compute({ ...BASE, startPct: "0", rampMonths: "12", laneCost: "2000" });
  assert.ok(slow.reserve > 0);
  assert.ok(slow.firstProfitMonth > 1);
});

test("the example is plausible and bad input is rejected, never clamped", () => {
  const ok = compute(SAMPLE);
  assert.deepEqual(ok.errors, []);
  assert.ok(ok.steady.profit > 0);
  for (const bad of [{ lanes: "" }, { lanes: "0" }, { lanes: "2.5" }, { peakPrice: "" }, { peakPrice: "-1" }, { hoursWeekday: "25" }, { peakShare: "101" }, { offUtil: "101" }, { feesPct: "30" }, { bowlersPerHour: "7" }, { termYears: "0" }, { rampMonths: "61" }, { targetMargin: "0" }]) {
    assert.ok(compute({ ...BASE, ...bad }).errors.length > 0, JSON.stringify(bad));
  }
  assert.ok(compute({ ...BASE, hoursWeekday: "0", hoursWeekend: "0" }).errors.length > 0);
  assert.ok(compute({ ...BASE, offUtil: "0", peakUtil: "0" }).errors.length > 0);
});

test("summary and CSV carry the key figures", () => {
  const r = compute(SAMPLE);
  assert.match(summaryText(r), /Break-even: \d+ booked lane-hours a week/);
  const csv = sweepCsv(r).split("\n");
  assert.equal(csv.length, 7);
  assert.match(csv[0], /bookings_vs_plan_pct/);
});
