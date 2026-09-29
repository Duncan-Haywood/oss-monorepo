import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULTS, truckRates, grossPayout, keepFactor, evaluate, sensitivity, parseCalls, rankCalls, summaryText, sampleCalls, money } from "./calc.mjs";

const near = (a, b, e = 0.005) => assert.ok(Math.abs(a - b) < e, `${a} !~ ${b}`);

test("truck rates spread fixed cost over billable hours only and add loaded wage", () => {
  const r = truckRates({ truckPayment: 1000, insurance: 500, overhead: 500, hoursOnDuty: 200, billableSharePct: 50, driverWage: 20, burdenPct: 10, fuelPrice: 4, mpg: 8, maintPerMile: 0.5 });
  near(r.billableHours, 100);
  near(r.fixedPerHour, 20);
  near(r.wageLoaded, 22);
  near(r.costPerHour, 42);
  near(r.costPerMile, 1.0);
});

test("zero billable hours or zero mpg is an error, not Infinity", () => {
  assert.match(truckRates({ hoursOnDuty: 0 }).error, /Billable hours/);
  assert.match(truckRates({ mpg: 0 }).error, /Miles per gallon/);
  assert.match(evaluate({ avgMph: 0 }).error, /speed/);
  assert.match(evaluate({ deadheadMiles: 0, loadedMiles: 0, waitMinutes: 0, returnMiles: 0 }).error, /miles or wait/);
});

test("payout is flat plus per-mile beyond the included miles only", () => {
  near(grossPayout({ flat: 100, includedMiles: 10, perMile: 5, loadedMiles: 8 }), 100);
  near(grossPayout({ flat: 100, includedMiles: 10, perMile: 5, loadedMiles: 14 }), 120);
});

test("keep factor subtracts fee, chargebacks and the carrying cost of late pay", () => {
  near(keepFactor({ clubFeePct: 10, chargebackPct: 5, capitalAprPct: 36.5, payDays: 30 }), 1 - 0.1 - 0.05 - 0.365 * 30 / 365, 1e-9);
});

const base = { truckPayment: 1000, insurance: 500, overhead: 500, hoursOnDuty: 200, billableSharePct: 50, driverWage: 20, burdenPct: 10, fuelPrice: 4, mpg: 8, maintPerMile: 0.5,
  avgMph: 30, deadheadMiles: 10, loadedMiles: 20, returnMiles: 0, waitMinutes: 30, afterHours: false, weatherSlowdownPct: 0,
  flat: 100, includedMiles: 10, perMile: 5, clubFeePct: 0, clubFixedFee: 0, chargebackPct: 0, capitalAprPct: 0, payDays: 0, thresholdMarginPct: 10, altProfitPerHour: 0 };

test("cost, profit and profit per truck-hour are arithmetic on the inputs", () => {
  const e = evaluate(base);
  near(e.hours, 1.5);            // 30 miles / 30 mph + 0.5 h
  near(e.hourCost, 1.5 * 42);    // 63
  near(e.mileCost, 30 * 1.0);    // 30
  near(e.cost, 93);
  near(e.gross, 150);
  near(e.profit, 57);
  near(e.profitPerHour, 38);
  near(e.marginPct, 38);
  assert.equal(e.verdict, "accept");
});

test("break-even payout makes profit exactly zero and min acceptable meets the margin threshold", () => {
  const noClub = evaluate(base);
  near(noClub.breakEven, 93);
  const o = { ...base, clubFeePct: 10, chargebackPct: 5, clubFixedFee: 2, capitalAprPct: 0 };
  const e = evaluate(o);
  const at = evaluate({ ...o, grossOverride: e.breakEven });
  near(at.profit, 0);
  const m = evaluate({ ...o, grossOverride: e.minAcceptable });
  near(m.marginPct, 10, 0.01);
  assert.equal(m.verdict, "accept");
  assert.equal(evaluate({ ...o, grossOverride: e.minAcceptable - 1 }).verdict, "decline");
});

test("opportunity cost of a cash call raises the minimum and can flip the verdict", () => {
  const e = evaluate({ ...base, altProfitPerHour: 50 });   // earns 38/hr < 50/hr
  assert.equal(e.verdict, "decline");
  assert.match(e.reasons.join(" "), /cash call/);
  near(e.opportunityCost, 75);
  const at = evaluate({ ...base, altProfitPerHour: 50, grossOverride: e.minAcceptable });
  near(at.profitPerHour, 50, 0.01);
  assert.equal(at.verdict, "accept");
});

test("a losing call is declined and says by how much", () => {
  const e = evaluate({ ...base, flat: 50, loadedMiles: 5 });
  assert.equal(e.verdict, "decline");
  assert.match(e.reasons[0], /loses \$/);
});

test("after-hours premium and weather slowdown raise cost", () => {
  const b = evaluate(base);
  const a = evaluate({ ...base, afterHours: true, afterHoursWagePct: 50 });
  near(a.afterHoursCost, 1.5 * 22 * 0.5);
  assert.ok(a.cost > b.cost);
  const w = evaluate({ ...base, weatherSlowdownPct: 50 });
  near(w.hours, 2.25);
});

test("deductions that consume the payout give no break-even and a decline", () => {
  const e = evaluate({ ...base, clubFeePct: 100 });
  assert.equal(e.breakEven, null);
  assert.equal(e.minAcceptable, null);
  assert.equal(e.verdict, "decline");
});

test("sensitivity falls as deadhead and wait grow, and its base cell matches evaluate", () => {
  const s = sensitivity(base, [0, 10, 20], [0, 30, 60]);
  assert.equal(s.rows.length, 3);
  for (const row of s.rows) for (let c = 1; c < row.cells.length; c++) assert.ok(row.cells[c].profit < row.cells[c - 1].profit);
  for (let r = 1; r < s.rows.length; r++) assert.ok(s.rows[r].cells[0].profit < s.rows[r - 1].cells[0].profit);
  near(s.rows[1].cells[1].profit, evaluate(base).profit);
});

test("batch lines parse with header, quotes, tabs and report bad lines", () => {
  const { calls, skipped } = parseCalls('label,deadhead,loaded,wait,payout\n"A, B",5,10,15,$80\nC\t3;x\nD;2;4;10;60;y\nE,1,2,3,-4\nbad,a,b,c,d');
  assert.equal(calls.length, 2);
  assert.equal(calls[0].label, "A, B");
  assert.equal(calls[0].gross, 80);
  assert.equal(calls[1].afterHours, true);
  assert.equal(skipped.length, 3);
  assert.ok(skipped.every((s) => s.line > 1));
});

test("batch ranks by profit per truck-hour, best first, and reconciles with evaluate", () => {
  const r = rankCalls("X,10,20,30,150\nY,10,20,30,90\nZ,10,20,30,120", base);
  assert.deepEqual(r.rows.map((x) => x.label), ["X", "Z", "Y"]);
  assert.deepEqual(r.rows.map((x) => x.rank), [1, 2, 3]);
  near(r.rows[0].profit, evaluate(base).profit);
  assert.ok(r.rows[2].profitPerHour < r.rows[1].profitPerHour);
});

test("the sample batch parses cleanly and summaries carry the not-advice line", () => {
  const r = rankCalls(sampleCalls(), DEFAULTS);
  assert.equal(r.skipped.length, 0);
  assert.equal(r.rows.length, 5);
  const e = evaluate(DEFAULTS);
  assert.match(summaryText(e, r), /not rate, legal or financial advice/);
  assert.equal(money(-3.456), "-$3.46");
});

test("results are deterministic", () => {
  assert.deepEqual(evaluate(base), evaluate(base));
});
