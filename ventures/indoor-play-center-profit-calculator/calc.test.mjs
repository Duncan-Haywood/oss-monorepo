import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, parse, SAMPLE, blendedAdmission, visitsPerWeek, payment, scaleAt, summaryText, sweepCsv } from "./calc.mjs";

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);
const W = 52 / 12;
// Hand-checkable centre: 100 visits a week at $10, nothing else but $1,000 fixed rent. Month = 100 x 52/12 x 10.
const BASE = { weekdayDays: "5", weekdayVisits: "10", weekendDays: "2", weekendVisits: "25", admission: "10", rentMonthly: "1000" };

test("visits and blended admission", () => {
  const p = parse({ ...BASE, memberPct: "50", memberVisit: "6" });
  assert.equal(visitsPerWeek(p), 100);
  near(blendedAdmission(p), 8);
});

test("monthly revenue, fixed cost and profit follow the stated rules", () => {
  const r = compute(BASE);
  assert.deepEqual(r.errors, []);
  near(r.steady.revenue, 100 * W * 10);
  near(r.steady.fixed, 1000);
  near(r.steady.profit, 100 * W * 10 - 1000);
  // Contribution is all of revenue; break-even scale = 1000 / revenue.
  near(r.bePctOps, 1000 / (100 * W * 10) * 100, 1e-9);
  near(r.beVisitsOps, 100 * 1000 / (100 * W * 10), 1e-9);
});

test("fees come off revenue and raise break-even", () => {
  const r = compute({ ...BASE, feesPct: "10" });
  near(r.steady.lost, 100 * W * 10 * 0.1);
  near(r.bePctOps, 1000 / (100 * W * 10 * 0.9) * 100, 1e-9);
});

test("parties scale with visits and carry food and staff cost at the loaded wage", () => {
  const r = compute({ ...BASE, partiesWeek: "4", partyPrice: "300", partyCost: "50", partyStaffMin: "60", wage: "20", burdenPct: "10" });
  near(r.steady.partyRev, 4 * W * 300);
  near(r.steady.variable, 4 * W * (50 + 22));
  const half = compute({ ...BASE, partiesWeek: "4", partyPrice: "300", partyCost: "50", partyStaffMin: "60", wage: "20", burdenPct: "10" });
  assert.equal(half.demandSweep[0].scale, 0.6);
  near(half.demandSweep[0].visitsWeek, 60);
});

test("staff cost is hours x wage x payroll load x 52/12", () => {
  const r = compute({ ...BASE, staffHours: "100", wage: "15", burdenPct: "20" });
  near(r.steady.fixed, 1000 + 100 * W * 15 * 1.2);
});

test("the price factor lands exactly on the target margin", () => {
  const r = compute({ ...SAMPLE });
  const p = parse(SAMPLE);
  const scaled = compute({ ...SAMPLE, admission: String(p.admission * r.priceFactor), memberVisit: String(p.memberVisit * r.priceFactor), partyPrice: String(p.partyPrice * r.priceFactor) });
  near(scaled.margin, p.targetMargin / 100, 1e-9);
});

test("a sweep row at 100% matches the planned month", () => {
  const r = compute(SAMPLE);
  near(r.demandSweep.find((x) => x.scale === 1).profit, r.steady.profit, 0.01);
  near(r.priceSweep.find((x) => x.pct === 0).profit, r.steady.profit, 0.01);
  near(r.wageSweep.find((x) => x.pct === 0).profit, r.steady.profit, 0.01);
});

test("higher wages cut profit by the staff share they touch", () => {
  const r = compute({ ...SAMPLE, partiesWeek: "0" });
  const up = r.wageSweep.find((x) => x.pct === 10);
  const base = r.wageSweep.find((x) => x.pct === 0);
  const p = parse({ ...SAMPLE, partiesWeek: "0" });
  near(base.profit - up.profit, p.staffHours * W * p.wage * (1 + p.burdenPct / 100) * 0.1, 0.01);
});

test("loan payment matches the annuity formula and a zero rate is straight line", () => {
  near(payment(100000, 0, 10), 100000 / 120);
  near(payment(100000, 6, 10), 1110.2050, 1e-3);
  assert.equal(payment(0, 6, 10), 0);
});

test("startup cost sums fit-out, equipment, deposit, launch and contingency", () => {
  const r = compute({ ...BASE, sqft: "1000", buildoutPerSqft: "20", playEquipment: "30000", cafeEquipment: "10000", launch: "5000", depositMonths: "2", contingencyPct: "10" });
  near(r.cost.contingency, (20000 + 30000 + 10000 + 5000) * 0.1);
  near(r.cost.total, 20000 + 30000 + 10000 + 2000 + 5000 + 6500);
});

test("ramp-up starts low, shows a cash trough, and payback is the first month cumulative cash covers equity", () => {
  assert.equal(scaleAt(parse({ ...BASE, startPct: "20", rampMonths: "5" }), 1), 0.2);
  assert.equal(scaleAt(parse({ ...BASE, startPct: "20", rampMonths: "5" }), 5), 1);
  near(scaleAt(parse({ ...BASE, startPct: "20", rampMonths: "5" }), 3), 0.6);
  const slow = compute({ ...BASE, startPct: "0", rampMonths: "12", playEquipment: "2000" });
  assert.ok(slow.reserve > 0);
  assert.ok(slow.firstProfitMonth > 1);
  const flat = compute({ ...BASE, playEquipment: "2000" });
  assert.ok(flat.paybackMonth >= 1 && flat.paybackMonth <= 60);
});

test("a centre that loses money is flagged high and the example is plausible", () => {
  const bad = compute({ ...BASE, rentMonthly: "9000" });
  assert.ok(bad.findings.some((f) => f.severity === "high" && /loses/.test(f.title)));
  const ok = compute(SAMPLE);
  assert.deepEqual(ok.errors, []);
  assert.ok(ok.steady.profit > 0 && ok.findings.some((f) => f.severity !== "info"));
});

test("bad input is rejected with a message, never clamped", () => {
  for (const bad of [{ admission: "" }, { admission: "-1" }, { weekdayDays: "6" }, { weekendDays: "3" }, { weekdayDays: "2.5" }, { memberPct: "101" }, { feesPct: "30" }, { termYears: "0" }, { rampMonths: "61" }, { targetMargin: "0" }, { weekdayVisits: "-5" }]) {
    const r = compute({ ...BASE, ...bad });
    assert.ok(r.errors.length > 0, JSON.stringify(bad));
  }
  assert.ok(compute({ ...BASE, weekdayVisits: "0", weekendVisits: "0" }).errors.length > 0);
});

test("summary and CSV carry the key figures", () => {
  const r = compute(SAMPLE);
  assert.match(summaryText(r), /Break-even: \d+ visits a week/);
  const csv = sweepCsv(r).split("\n");
  assert.equal(csv.length, 7);
  assert.match(csv[0], /attendance_vs_plan_pct/);
});
