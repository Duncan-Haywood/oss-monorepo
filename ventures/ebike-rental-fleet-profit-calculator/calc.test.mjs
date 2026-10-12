import { test } from "node:test";
import assert from "node:assert/strict";
import { solve, compareScenarios, validateInput, loanPayment, sampleInput, sampleScenario, resultText, resultCsv, serializeState, parseState, money, cents, pct } from "./calc.mjs";

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);
const base = () => sampleInput();

test("slots, revenue and cost lines add up by hand", () => {
  const r = solve(base());
  near(r.available, 40 * 180);
  near(r.rented, 40 * 100 * 0.7 + 40 * 80 * 0.25);
  near(r.utilization, 3600 / 7200);
  near(r.revSlot, 0.45 * 65 / 2 + 0.55 * 40);
  near(r.rentals, 3600 * (1 - 0.225));
  near(r.revenue, r.rented * r.revSlot + r.rentals * 6);
  near(r.staffCost, 2 * 9 * 180 * 17 * 1.12);
  near(r.reserve, 20 * 2200 * 0.65 / 3);
  near(r.battery, r.rentals * 650 / 700);
  near(r.costs, r.lossCost + r.cardFees + r.staffCost + r.wear + r.battery + r.reserve + r.fixed);
  near(r.fixed, 2500 * 8 + 4000 + 3000 + 1500);
  near(r.operating, r.revenue - r.costs);
});

test("start-up cost and payback", () => {
  const r = solve(base());
  near(r.capex, 20 * 2200 + 12000);
  near(r.paybackYears, r.capex / r.operating);
  near(r.paybackMonths, r.paybackYears * 12);
  assert.equal(r.meets, true);
});

test("the loan is the standard amortization and payback ignores it", () => {
  near(loanPayment(12000, 0, 12), 1000);
  near(loanPayment(0, 9, 48), 0);
  const a = solve({ ...base(), financedPct: 60 });
  const b = solve(base());
  near(a.loanPayment, loanPayment(b.capex * 0.6, 9, 48) * 12);
  near(a.paybackYears, b.paybackYears);
  near(a.profit, b.operating - a.loanPayment);
});

test("break-even utilization reproduces zero profit when scaled back in", () => {
  const i = { ...base(), financedPct: 50 };
  const r = solve(i);
  const k = r.breakevenUtil / r.utilization;
  near(solve({ ...i, peakUtil: i.peakUtil * k, offPeakUtil: i.offPeakUtil * k }).profit, 0, 1e-4);
});

test("utilization for the payback target reproduces it", () => {
  const r = solve(base());
  const k = r.paybackUtil / r.utilization;
  near(solve({ ...base(), peakUtil: 70 * k, offPeakUtil: 25 * k }).paybackYears, 2, 1e-6);
});

test("lowest prices reproduce break-even, the target margin and the payback target", () => {
  const i = { ...base(), financedPct: 40 };
  const r = solve(i);
  const at = (p) => solve({ ...i, halfPrice: p.half, fullPrice: p.full });
  near(at(r.breakevenPrices).profit, 0, 1e-4);
  near(at(r.marginPrices).margin, 0.2, 1e-6);
  near(at(r.paybackPrices).paybackYears, 2, 1e-6);
  near(r.marginPrices.full / r.marginPrices.half, 65 / 40);
});

test("fixed costs make zero utilization lose money", () => {
  const r = solve({ ...base(), peakUtil: 0, offPeakUtil: 0 });
  assert.ok(r.operating < 0);
  assert.equal(r.paybackYears, null);
  assert.equal(r.margin, null);
  assert.ok(r.notes.some((n) => /do not cover|does not cover/.test(n)));
});

test("sensitivity cuts utilization by 10% and 20%", () => {
  const r = solve(base());
  assert.deepEqual(r.sensitivity.map((s) => s.change), [-10, -20]);
  assert.ok(r.sensitivity[0].profit < r.profit && r.sensitivity[1].profit < r.sensitivity[0].profit);
  near(r.sensitivity[0].utilization, r.utilization * 0.9);
});

test("a bigger fleet at lower utilization can earn more in total and less per bike", () => {
  const c = compareScenarios(base(), sampleScenario());
  assert.equal(c.winnerProfit, "B");
  assert.equal(c.winnerPayback, "B");
  const worse = compareScenarios(base(), { bikes: 40, peakUtil: 35, offPeakUtil: 12 });
  assert.ok(worse.notes.some((n) => /earns less per bike/.test(n)));
  assert.equal(worse.winnerProfit, "A");
});

test("invalid inputs are named", () => {
  for (const [k, v, re] of [["bikes", 0, /Bikes/], ["bikes", 2.5, /Bikes/], ["peakDays", 300, /cannot be more than 366/], ["peakUtil", 120, /Busy-day/], ["fullPrice", -1, /Full-day/], ["termMonths", 0, /term/], ["batteryLife", 0, /battery/], ["wage", NaN, /wage/]]) {
    assert.ok(validateInput({ ...base(), [k]: v }).some((m) => re.test(m)), `${k}=${v}`);
  }
  assert.equal(validateInput(base()).length, 0);
  assert.equal(solve({ ...base(), bikes: 0 }).ok, false);
});

test("notes: heavy staff, full-day price, zero damage", () => {
  const r = solve({ ...base(), staff: 5, lossPct: 0, fullPrice: 90 });
  assert.ok(r.notes.some((n) => /Staff is \d+% of revenue/.test(n)));
  assert.ok(r.notes.some((n) => /no reason to take a full day/.test(n)));
  assert.ok(r.notes.some((n) => /Damage and theft is set to zero/.test(n)));
});

test("exports carry the headline numbers", () => {
  const r = solve(base());
  assert.match(resultText(r), /fleet replacement reserve/);
  assert.match(resultText(r), /not tax, legal, lending or financial advice/);
  const csv = resultCsv(r);
  assert.match(csv, /^metric,value\n/);
  assert.match(csv, /payback_years,/);
  assert.match(csv, /margin_target_full_day_price,/);
});

test("saved files round-trip and reject strangers", () => {
  const out = parseState(serializeState(base(), sampleScenario()));
  assert.deepEqual(out.input, base());
  assert.deepEqual(out.scenario, sampleScenario());
  assert.equal(parseState("nope").error, "That file is not valid JSON.");
  assert.match(parseState('{"app":"other"}').error, /not a saved e-bike/);
  const partial = parseState(JSON.stringify({ app: "ebike-rental-fleet-profit-calculator", input: { bikes: 8 } }));
  assert.equal(partial.input.bikes, 8);
  assert.equal(partial.input.bikeCost, 2200);
});

test("formatters", () => {
  assert.equal(money(-1234.4), "-$1,234");
  assert.equal(cents(12.345), "$12.35");
  assert.equal(pct(0.0825), "8.3%");
});
