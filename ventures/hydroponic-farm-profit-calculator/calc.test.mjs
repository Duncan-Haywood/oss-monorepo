import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, parse, SAMPLE, summaryText, sweepCsv, production, blendedPrice, netPerHead, variablePerHead, energyMonthly, fixedMonthly, startupCost, payment, scaleAt } from "./calc.mjs";

// 100 sq ft x 10 plants = 1,000 plants a cycle; 30-day crop + 6 days turnaround = 36 days; 365/36 cycles. No loss at 0%.
// Make it round: 30-day crop, 0 turnaround ~ 12.1667 cycles. Use cycleDays 73 so cycles = 5 exactly.
const BASE = { growSqft: "100", plantsPerSqft: "10", cycleDays: "73", turnDays: "0", lossPct: "0", wholesalePct: "100", wholesalePrice: "2", retailPrice: "2", managerMonthly: "300", rentMonthly: "200" };
const near = (a, b, tol = 0.01) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

test("output: area x density x cycles a year, less loss", () => {
  const o = production(parse(BASE));
  near(o.cyclesPerYear, 5, 1e-9); near(o.headsPerYear, 5000, 1e-6); near(o.headsPerMonth, 5000 / 12, 1e-6); near(o.headsPerWeek, 5000 / 52, 1e-6);
  near(production(parse({ ...BASE, lossPct: "20" })).headsPerYear, 4000, 1e-6);
  near(production(parse({ ...BASE, cycleDays: "60", turnDays: "13" })).cyclesPerYear, 5, 1e-9);
});

test("blended price, net per head and variable cost by hand", () => {
  const p = parse({ ...BASE, wholesalePct: "60", wholesalePrice: "2", retailPrice: "4", feesPct: "3", returnsPct: "2", seedPerHead: "0.1", nutrientsPerHead: "0.1", packagingPerHead: "0.2", deliveryPerHead: "0.1", laborMinPerHead: "3", wage: "20" });
  near(blendedPrice(p), 2.8); // 0.6 x 2 + 0.4 x 4
  near(netPerHead(p), 2.8 * 0.95);
  near(variablePerHead(p), 0.5 + 1); // 3 min at $20 an hour = $1
});

test("energy is lighting kWh at price plus a climate share; fixed cost adds the rest", () => {
  const p = parse({ ...BASE, lightKw: "10", lightHours: "10", kwhPrice: "0.10", climatePct: "50", waterOtherMonthly: "50", insuranceYear: "1200", otherMonthly: "20" });
  const e = energyMonthly(p);
  near(e.lighting, 300); near(e.climate, 150); near(e.total, 450);
  near(fixedMonthly(p), 200 + 450 + 50 + 300 + 100 + 20);
});

test("startup cost and a level loan", () => {
  const c = startupCost(parse({ ...BASE, buildoutPerSqft: "100", equipmentTotal: "5000", launch: "1000", depositMonths: "2", contingencyPct: "10" }));
  near(c.buildout, 10000); near(c.deposit, 400); near(c.contingency, 1600); near(c.total, 10000 + 5000 + 400 + 1000 + 1600);
  near(payment(12000, 0, 1), 1000);
});

test("full-production profit, margin and break-even worked by hand", () => {
  const r = compute(BASE);
  assert.deepEqual(r.errors, []);
  // 5000 heads a year at $2 = $833.33 a month; no variable cost; fixed 500.
  near(r.steady.revenue, 5000 / 12 * 2, 1e-6); near(r.steady.fixed, 500); near(r.steady.profit, 5000 / 12 * 2 - 500, 1e-6);
  near(r.beHeadsOps, 250, 1e-9); // 500 / $2 a head
  near(r.bePctOps, 250 / (5000 / 12) * 100, 1e-9);
  // Price for a 20% margin: net revenue 500 / 0.8 = 625 against 833.33 now.
  near(r.priceFactor, 625 / (5000 / 12 * 2), 1e-9);
});

test("fees and returns come off revenue and raise break-even", () => {
  const r = compute({ ...BASE, feesPct: "5", returnsPct: "5" });
  near(r.steady.lost, 5000 / 12 * 2 * 0.1, 1e-6);
  near(r.beHeadsOps, 500 / (2 * 0.9), 1e-9);
});

test("a head that costs more than it nets loses money and is flagged", () => {
  const r = compute({ ...BASE, packagingPerHead: "2.5" });
  assert.ok(r.contribution < 0);
  assert.equal(r.beHeadsOps, null);
  assert.ok(r.findings.some((f) => f.severity === "high" && /Selling more loses more money/.test(f.title)));
});

test("ramp-up starts low, shows a cash trough, and payback is the first month cumulative cash covers equity", () => {
  assert.equal(scaleAt(parse({ ...BASE, startPct: "20", rampMonths: "5" }), 1), 0.2);
  assert.equal(scaleAt(parse({ ...BASE, startPct: "20", rampMonths: "5" }), 5), 1);
  near(scaleAt(parse({ ...BASE, startPct: "20", rampMonths: "5" }), 3), 0.6);
  const slow = compute({ ...BASE, startPct: "0", rampMonths: "12", equipmentTotal: "2000" });
  assert.ok(slow.reserve > 0);
  assert.ok(slow.firstProfitMonth > 1);
  const flat = compute({ ...BASE, equipmentTotal: "2000" }); // equity 2,000 at ~$333 a month
  assert.equal(flat.paybackMonth, 6);
});

test("a loan is level payments and debt coverage divides yearly profit by yearly payments", () => {
  const r = compute({ ...BASE, equipmentTotal: "12000", ltcPct: "50", loanRate: "0", termYears: "2" });
  near(r.loan, 6000); near(r.pmt, 250);
  near(r.dscr, r.annualProfit / 3000, 1e-9);
  near(r.cashAfterDebt, r.steady.profit - 250);
});

test("sweeps move profit linearly with output, price and power price", () => {
  const r = compute({ ...BASE, lightKw: "10", lightHours: "10", kwhPrice: "0.1" });
  const base = r.steady.profit;
  near(r.yieldSweep.find((x) => x.scale === 1).profit, base);
  near(r.priceSweep.find((x) => x.pct === 10).profit, base + 5000 / 12 * 2 * 0.1, 0.01);
  near(r.powerSweep.find((x) => x.pct === 50).profit, base - 300 * 0.5, 0.01);
  near(r.powerSweep.find((x) => x.pct === 0).profit, base);
});

test("bad input is rejected with a message, never clamped", () => {
  for (const bad of [{ growSqft: "" }, { growSqft: "0" }, { plantsPerSqft: "0" }, { cycleDays: "0" }, { wholesalePrice: "" }, { wholesalePct: "120" }, { lossPct: "95" }, { feesPct: "40" }, { lightHours: "30" }, { termYears: "0" }, { targetMargin: "95" }, { rentMonthly: "-1" }, { rampMonths: "2.5" }, { wholesalePrice: "0", retailPrice: "0" }]) {
    const r = compute({ ...BASE, ...bad });
    assert.ok(r.errors.length > 0, JSON.stringify(bad));
  }
});

test("the worked example computes and its summary and CSV are well formed", () => {
  const r = compute(SAMPLE);
  assert.deepEqual(r.errors, []);
  assert.ok(r.steady.profit > 0 && r.contribution > 0);
  assert.ok(/Indoor farm/.test(summaryText(r)));
  assert.equal(sweepCsv(r).split("\n").length, 7);
  assert.ok(r.beHeadsDebt >= r.beHeadsOps);
});
