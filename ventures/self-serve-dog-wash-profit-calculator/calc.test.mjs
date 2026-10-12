import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, parse, SAMPLE, summaryText, sweepCsv, monthsCsv, startupCost, payment, balanceAfter, irr, rampAt, seasonFactor, monthModel, yearModel, capacityPerTub, variablePerWash, WEEKS_PER_MONTH } from "./calc.mjs";

// 2 tubs, open 5 weekdays, 4 washes per tub per day at $20: 2 x 4 x 5 x 52 = 2,080 washes and $41,600 a year.
// Variable cost per wash: 25 gal x $10/1000 = 0.25, + 0.25 heat + 1.50 supplies + 0.50 towels = $2.50.
const BASE = {
  tubs: "2", price: "20", weekdaysOpen: "5", weekendDaysOpen: "0", openHours: "8", washMinutes: "30", cleanupMinutes: "10", washesWeekday: "4",
  gallonsPerWash: "25", waterPer1000: "10", heatPerWash: "0.25", suppliesPerWash: "1.5", towelPerWash: "0.5", cardPct: "3",
  attendantHours: "4", attendantWage: "15", rent: "1500",
  tubCost: "6000", sqft: "1000", buildPerSqft: "40", permits: "3000", signagePos: "2000", inventory: "1000", cashReserve: "10000",
};
const near = (a, b, tol = 0.01) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

test("capacity per tub is open minutes over wash plus clean-up time", () => {
  assert.equal(capacityPerTub(parse(BASE)), 12); // 480 / 40
  assert.equal(capacityPerTub(parse({ ...BASE, openHours: "10" })), 15);
  near(variablePerWash(parse(BASE)), 2.5, 1e-9);
});

test("start-up cost adds equipment, build-out and every other line", () => {
  const c = startupCost(parse(BASE));
  near(c.equipment, 12000);
  near(c.buildOut, 40000);
  near(c.total, 12000 + 40000 + 3000 + 2000 + 1000 + 10000);
});

test("a year of self-serve sales and costs worked by hand", () => {
  const r = compute(BASE);
  assert.deepEqual(r.errors, []);
  const s = r.steady;
  near(s.self, 2080);
  near(s.revenue, 41600);
  near(s.card, 1248);
  near(s.variable, 5200);
  near(s.attendant, 15600); // 4 h x 260 days x $15
  near(s.fixed, 18000);
  near(s.operating, 41600 - 1248 - 5200 - 15600 - 18000);
  near(r.yieldOnCost, 1552 / 68000, 1e-9);
});

test("break-even washes per day plug back in to zero operating profit", () => {
  const r = compute(BASE);
  near(r.perWash, 20 * 0.97 - 2.5, 1e-9);
  near(r.beOpDay, (2800 / (20 * 0.97 - 2.5)) / (5 * WEEKS_PER_MONTH), 1e-9);
  near(r.bePerTubDebt, r.beDebtDay / 2, 1e-9);
  // 2 tubs, 5 days: scaling traffic to the break-even washes gives zero profit.
  const perTubDay = r.beOpDay / 2;
  const back = compute({ ...BASE, washesWeekday: String(perTubDay) });
  near(back.steady.operating, 0, 1e-6);
});

test("break-even with a loan covers the payment, and the target price plugs back in", () => {
  const input = { ...BASE, ltcPct: "50", loanRate: "6", termYears: "5", cardPct: "3", repairsPct: "2", addOnPrice: "5", addOnPct: "40", targetYield: "30" };
  const r = compute(input);
  const back = compute({ ...input, washesWeekday: String(r.beDebtDay / 2) });
  near(back.cashAfterDebt, 0, 1e-6);
  const priced = compute({ ...input, price: String(r.priceForTarget) });
  near(priced.yieldOnCost, 0.3, 1e-9);
});

test("full-service dogs add their sales net of labor, supplies and card fees", () => {
  const base = compute(BASE);
  const r = compute({ ...BASE, fsWashesPerDay: "2", fsPrice: "50", fsMinutes: "45", fsWage: "18" });
  assert.deepEqual(r.errors, []);
  // 2 dogs x 260 days = 520 dogs: $26,000 sales, labor 520 x 0.75 h x $18 = $7,020, card 780, supplies 520 x 2.50 = 1,300.
  near(r.steady.full, 520);
  near(r.steady.fullRev, 26000);
  near(r.steady.fullLabor, 7020);
  near(r.steady.operating - base.steady.operating, 26000 - 780 - 1300 - 7020);
});

test("full-service dogs take tub time, so self-serve is capped and the model says so", () => {
  // 2 tubs x 480 min = 960 min a day. 10 full-service dogs x (60 + 10) = 700 min, leaving 260 min = 6.5 self-serve washes of 40 min.
  const r = compute({ ...BASE, washesWeekday: "3", fsWashesPerDay: "10", fsPrice: "60", fsMinutes: "60", fsWage: "15" });
  assert.deepEqual(r.errors, []); // 3 per tub = 6 washes, under 6.5
  const m = monthModel(parse({ ...BASE, washesWeekday: "3", fsWashesPerDay: "10", fsPrice: "60", fsMinutes: "60", fsWage: "15" }), 1, 1.2);
  assert.equal(m.capped, true); // 20% busier: 7.2 washes wanted, 6.5 fit (and 12 dogs would not fit either)
});

test("busy and slow seasons move traffic and wrap around the year end", () => {
  const p = parse({ ...BASE, peakFirstMonth: "11", peakMonths: "4", peakPct: "150", offPct: "50" });
  assert.deepEqual([11, 12, 1, 2, 3, 6].map((m) => seasonFactor(p, m)), [1.5, 1.5, 1.5, 1.5, 0.5, 0.5]);
  assert.equal(seasonFactor(parse(BASE), 7), 1);
  const y = yearModel(p);
  near(y.self, 2080 * (4 * 1.5 + 8 * 0.5) / 12);
});

test("weekends count separately from weekdays", () => {
  const r = compute({ ...BASE, weekendDaysOpen: "2", washesWeekend: "6" });
  near(r.steady.self, 2 * (4 * 5 + 6 * 2) * 52);
  assert.equal(compute({ ...BASE, weekdaysOpen: "0", weekendDaysOpen: "1", washesWeekend: "5" }).errors.length, 0);
});

test("the ramp climbs linearly from the month-1 share to full traffic", () => {
  const p = parse({ ...BASE, startUtilPct: "20", rampMonths: "5" });
  assert.deepEqual([1, 2, 3, 4, 5, 9].map((m) => rampAt(p, m)), [0.2, 0.4, 0.6, 0.8, 1, 1]);
  assert.equal(rampAt(parse(BASE), 1), 1);
});

test("month-by-month cash, trough and payback agree with a hand calculation", () => {
  // No ramp, no loan: every month is a twelfth of the year, 1,552 / 12 of profit when traffic is flat.
  const r = compute({ ...BASE, horizonMonths: "12" });
  near(r.months[0].operating, 1552 / 12, 0.01);
  near(r.months[11].cumulative, -68000 + 1552, 0.05);
  assert.equal(r.paybackMonth, null);
  const rich = compute({ ...BASE, price: "40", horizonMonths: "24", ltcPct: "0" });
  assert.ok(rich.paybackMonth > 1 && rich.paybackMonth <= 24);
  assert.ok(rich.months[rich.paybackMonth - 1].cumulative >= 0 && rich.months[rich.paybackMonth - 2].cumulative < 0);
});

test("a slow ramp digs a cash hole that the trough reports", () => {
  const r = compute({ ...BASE, price: "40", startUtilPct: "0", rampMonths: "6", horizonMonths: "36" });
  assert.ok(r.trough < -r.equity);
  assert.ok(r.troughMonth >= 1);
  assert.ok(r.findings.some((f) => /ramp-up/.test(f.title)));
  assert.ok(r.firstProfitMonth > 1);
});

test("loan maths: known payment, zero-rate payment and balance", () => {
  near(payment(100000, 6, 30), 599.55, 0.01);
  near(payment(100000, 0, 10), 100000 / 120, 1e-9);
  near(balanceAfter(50000, 0, 10, 60), 25000, 1e-9);
  assert.equal(balanceAfter(50000, 6, 10, 120), 0);
  const r = compute({ ...BASE, ltcPct: "50", loanRate: "0", termYears: "10" });
  near(r.loan, 34000);
  near(r.annualDebt, 3400, 1e-9);
  near(r.equity, 34000);
  near(r.cashAfterDebt, 1552 - 3400);
});

test("a sale at a multiple of last year's profit pays off the loan and feeds the IRR", () => {
  const input = { ...BASE, price: "40", horizonMonths: "12", exitMultiple: "3" };
  const r = compute(input);
  near(r.salePrice, 3 * r.steady.operating, 0.05);
  near(r.saleProceeds, r.salePrice - r.payoff);
  const m = Math.pow(1 + r.equityIrr, 1 / 12) - 1;
  let npv = -r.equity;
  for (let i = 1; i <= 12; i++) npv += (r.months[i - 1].cash + (i === 12 ? r.saleProceeds : 0)) / Math.pow(1 + m, i);
  near(npv, 0, 1e-3);
  assert.equal(compute({ ...BASE, price: "40" }).saleProceeds, 0); // no multiple, no sale
});

test("irr finds a known rate and refuses flows with no sign change", () => {
  near(irr([-100, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 112]), 0.12, 1e-6);
  assert.equal(irr([100, 10, 10]), null);
});

test("sensitivity tables recompute from the inputs", () => {
  const r = compute(BASE);
  near(r.sweep.find((x) => x.scale === 1).operating, 1552);
  near(r.sweep.find((x) => x.scale === 0.8).operating, 41600 * 0.8 * 0.97 - 5200 * 0.8 - 33600, 0.02);
  near(r.priceSweep.find((x) => x.pct === 10).operating, 2080 * 22 * 0.97 - 5200 - 33600, 0.02);
  assert.match(sweepCsv(r), /^traffic_vs_plan_pct,/);
  assert.equal(monthsCsv(r).split("\n").length, 61);
});

test("a shop that loses money is flagged and the sample runs clean", () => {
  const r = compute({ ...BASE, price: "10" });
  assert.ok(r.findings.some((f) => f.severity === "high"));
  const s = compute(SAMPLE);
  assert.deepEqual(s.errors, []);
  assert.match(summaryText(s), /Debt coverage/);
  assert.ok(s.findings.some((f) => /zoning/i.test(f.title)));
  assert.ok(s.months.length === 60 && s.steady.revenue > 0);
});

test("a price that cannot cover per-wash cost cannot break even", () => {
  const r = compute({ ...BASE, price: "2" });
  assert.equal(r.beDebtDay, null);
  assert.ok(r.findings.some((f) => /earns/.test(f.title)));
});

test("bad input is rejected instead of clamped", () => {
  const bad = [{ tubs: "0" }, { tubs: "2.5" }, { tubs: "" }, { price: "0" }, { price: "" }, { weekdaysOpen: "6" }, { weekdaysOpen: "0", weekendDaysOpen: "0" }, { weekendDaysOpen: "3" },
    { openHours: "0" }, { openHours: "25" }, { washMinutes: "2" }, { cleanupMinutes: "-1" }, { washesWeekday: "" }, { washesWeekday: "-1" }, { washesWeekday: "13" },
    { peakMonths: "13" }, { peakFirstMonth: "0" }, { peakPct: "400" }, { offPct: "-5" }, { cardPct: "25" }, { repairsPct: "30" }, { burdenPct: "70" }, { addOnPct: "101" },
    { fsWashesPerDay: "2" }, { fsWashesPerDay: "2", fsPrice: "50", fsMinutes: "2" }, { fsWashesPerDay: "30", fsPrice: "50", fsMinutes: "60" },
    { attendantHours: "30" }, { rent: "-1" }, { tubCost: "-5" }, { startMonth: "13" }, { startUtilPct: "120" }, { rampMonths: "2.5" }, { ltcPct: "95" }, { loanRate: "40" },
    { termYears: "0" }, { horizonMonths: "6" }, { exitMultiple: "20" }, { targetYield: "0" }, { targetPayback: "0" }, { price: "abc" }];
  for (const b of bad) assert.ok(compute({ ...BASE, ...b }).errors.length > 0, JSON.stringify(b));
  assert.equal(compute({ ...BASE, price: "$20.00" }).errors.length, 0);
});

test("payback later than the target is noted", () => {
  const r = compute({ ...BASE, price: "40", horizonMonths: "60", targetPayback: "1" });
  assert.ok(r.paybackMonth > 1);
  assert.ok(r.findings.some((f) => /later than your 1-month target/.test(f.title)));
});
