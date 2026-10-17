import { test } from "node:test";
import assert from "node:assert/strict";
import { analyse, parseClients, rateFor, retainerFor, money, pct } from "./calc.mjs";

const base = { salary: 200000, bonus: 40000, benefits: 30000, businessCosts: 10000, seTaxPct: 7.65,
  workingDays: 260, timeOffDays: 30, nonBillablePct: 20, soldPct: 80, hoursPerDay: 8, retainerDiscountPct: 0 };
const near = (a, b, eps = 0.011) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

test("parse accepts commas, tabs, header rows; reports bad lines", () => {
  const p = parseClients("client,days\nAcme, 4\nBeta\t2.5\nbad, x\nsolo");
  assert.deepEqual(p.rows, [{ name: "Acme", daysPerMonth: 4 }, { name: "Beta", daysPerMonth: 2.5 }]);
  assert.equal(p.bad.length, 2);
});

test("hand-checked day rate", () => {
  // needed = (240000+30000+10000)/(1-.0765) = 280000/.9235 = 303194.37
  // capacity days = (260-30)*.8 = 184; sold = 147.2; rate = 2059.74
  const r = rateFor(base);
  near(r.revenueNeeded, 303194.37, 0.02);
  near(r.capacityDays, 184); near(r.soldDays, 147.2);
  near(r.dayRate, 2059.74, 0.02);
  near(r.hourlyRate, r.dayRate / 8);
  near(r.capacityPerMonth, 184 / 12);
  near(r.fteDayPay, 200000 / 260);
  near(r.multiple, r.dayRate / (200000 / 260), 1e-4);
});

test("selling fewer days raises the rate; less non-billable time lowers it", () => {
  assert.ok(rateFor({ ...base, soldPct: 60 }).dayRate > rateFor(base).dayRate);
  assert.ok(rateFor({ ...base, nonBillablePct: 10 }).dayRate < rateFor(base).dayRate);
});

test("zero billable days gives a null rate, not Infinity", () => {
  const r = rateFor({ ...base, timeOffDays: 260 });
  assert.equal(r.dayRate, null);
  const a = analyse({ ...base, timeOffDays: 260, clientText: "A, 4" });
  assert.equal(a.result, null);
  assert.match(a.findings[0].title, /No billable days/);
});

test("retainer discount lowers the effective day rate", () => {
  const r = retainerFor(2000, 4, 10);
  assert.equal(r.list, 8000); assert.equal(r.price, 7200); assert.equal(r.effectiveDayRate, 1800);
});

test("client mix: revenue, capacity and the shortfall finding", () => {
  const a = analyse({ ...base, clientText: "Acme, 4\nBeta, 2" });
  const day = a.result.rate.dayRate;
  near(a.result.monthlyRevenue, 6 * day, 0.05);
  assert.equal(a.result.bookedDays, 6);
  // 6 days/month is well under the ~15 capacity days, so it falls short of the target
  assert.ok(a.result.gap > 0);
  assert.ok(a.findings.some((f) => /does not replace your target/.test(f.title)));
});

test("a full book meets the target", () => {
  const a = analyse({ ...base, clientText: "A, 6\nB, 6.27" });
  assert.ok(Math.abs(a.result.gap) < 100, `gap ${a.result.gap}`);
  assert.ok(a.findings.some((f) => /meets your target/.test(f.title)));
});

test("over-capacity and concentration are flagged", () => {
  const a = analyse({ ...base, clientText: "Big, 14\nSmall, 3" });
  assert.ok(a.findings.some((f) => /exceed your capacity/.test(f.title)));
  assert.ok(a.findings.some((f) => /Big is over half/.test(f.title)));
});

test("a low multiple is flagged", () => {
  const a = analyse({ salary: 200000, benefits: 0, businessCosts: 0, seTaxPct: 0, workingDays: 260, timeOffDays: 0, nonBillablePct: 0, soldPct: 100, clientText: "" });
  assert.ok(a.findings.some((f) => /1\.0x/.test(f.title) && f.severity === "medium"));
});

test("empty salary returns no result", () => {
  const a = analyse({ ...base, salary: 0, bonus: 0, clientText: "" });
  assert.equal(a.result, null);
  assert.equal(a.findings[0].severity, "high");
});

test("money and pct format", () => {
  assert.equal(money(-1234.4), "-$1,234");
  assert.equal(pct(0.4281), "42.8%");
  assert.equal(pct(null), "n/a");
});
