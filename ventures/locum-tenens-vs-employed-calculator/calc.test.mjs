import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, locumYear, employedYear, breakEvenRate, incomeTax, num, money, samplePlan, reportCsv, SENSITIVITY_WEEKS } from "./calc.mjs";

const base = () => {
  const r = analyze(samplePlan());
  return r.p;
};

test("num parses currency text and rejects blanks", () => {
  assert.equal(num("$1,250.50"), 1250.5);
  assert.ok(Number.isNaN(num("")));
  assert.ok(Number.isNaN(num("abc")));
  assert.equal(money(-1234.4), "-$1,234");
});

test("income tax brackets: single 2026", () => {
  assert.equal(incomeTax(0, "single"), 0);
  assert.equal(Math.round(incomeTax(12400, "single")), 1240);
  // 1240 + (50400-12400)*.12 = 5800
  assert.equal(Math.round(incomeTax(50400, "single")), 5800);
  assert.ok(incomeTax(500000, "mfj") < incomeTax(500000, "single"));
});

test("locum side: hand-checked simple case with no deductions", () => {
  const p = { status: "single", rate: 100, hours: 40, weeks: 50, travelReimb: 0, travelCost: 0, malpractice: 0, expenses: 0, health: 0, retire: 0 };
  const l = locumYear(p);
  assert.equal(l.gross, 200000);
  const seEarn = 200000 * 0.9235;
  const ss = Math.min(seEarn, 184500) * 0.124;
  const med = seEarn * 0.029;
  const addl = Math.max(0, seEarn - 200000) * 0.009;
  assert.ok(Math.abs(l.seTax - (ss + med + addl)) < 0.01);
  const taxable = 200000 - (ss + med) / 2 - 16100;
  assert.ok(Math.abs(l.incTax - incomeTax(taxable, "single")) < 0.01);
  assert.ok(Math.abs(l.takeHome - (200000 - l.seTax - l.incTax)) < 0.01);
});

test("locum side: SS wage base caps social security portion", () => {
  const p = { status: "single", rate: 500, hours: 40, weeks: 50, travelReimb: 0, travelCost: 0, malpractice: 0, expenses: 0, health: 0, retire: 0 };
  const l = locumYear(p);
  const seEarn = 1_000_000 * 0.9235;
  const expected = 184500 * 0.124 + seEarn * 0.029 + (seEarn - 200000) * 0.009;
  assert.ok(Math.abs(l.seTax - expected) < 0.01);
});

test("expenses, malpractice, health and retirement reduce both tax and cash correctly", () => {
  const p = { status: "single", rate: 200, hours: 40, weeks: 40, travelReimb: 0, travelCost: 0, malpractice: 0, expenses: 0, health: 0, retire: 0 };
  const plain = locumYear(p);
  const withCosts = locumYear({ ...p, malpractice: 10000, expenses: 5000 });
  assert.ok(withCosts.takeHome < plain.takeHome);
  assert.ok(plain.takeHome - withCosts.takeHome < 15000); // some of it comes back as lower tax
  const withRetire = locumYear({ ...p, retire: 30000 });
  assert.equal(withRetire.retire, 30000);
  assert.ok(withRetire.incTax < plain.incTax);
  assert.ok(withRetire.total > plain.total - 30000 * 0.5);
});

test("retirement contribution is capped by the deferral plus employer share", () => {
  const p = { status: "single", rate: 100, hours: 20, weeks: 10, travelReimb: 0, travelCost: 0, malpractice: 0, expenses: 0, health: 0, retire: 500000 };
  const l = locumYear(p);
  assert.ok(l.retire <= 20000 && l.retireClamped);
  const rich = locumYear({ ...p, rate: 1000, hours: 40, weeks: 52, retire: 500000 });
  assert.ok(rich.retire <= 72000);
});

test("travel: reimbursement above cost is income, below cost is a deductible loss", () => {
  const p = { status: "single", rate: 100, hours: 40, weeks: 10, travelReimb: 0, travelCost: 0, malpractice: 0, expenses: 0, health: 0, retire: 0 };
  const none = locumYear(p);
  const short = locumYear({ ...p, travelCost: 1000, travelReimb: 600 });
  assert.equal(short.netTravel, 4000);
  assert.equal(short.profit, none.profit - 4000);
  const over = locumYear({ ...p, travelCost: 500, travelReimb: 800 });
  assert.equal(over.profit, none.profit + 3000);
});

test("employed side: FICA, deferral and match", () => {
  const p = { status: "single", salary: 200000, w2Hours: 40, pto: 4, w2Health: 0, w2EmployerHealth: 8000, w2Own401k: 30000, w2Match: 6000, w2Cme: 2000 };
  const e = employedYear(p);
  assert.equal(e.own, 24500); // capped at the deferral limit
  const fica = 184500 * 0.062 + 200000 * 0.0145;
  assert.ok(Math.abs(e.fica - fica) < 0.01);
  assert.ok(Math.abs(e.takeHome - (200000 - 24500 - fica - e.incTax)) < 0.01);
  assert.equal(e.total, e.takeHome + 24500 + 6000 + 8000 + 2000);
  assert.equal(e.hoursWorked, 40 * 48);
});

test("break-even rate makes locum total value equal the employed total value", () => {
  const p = base();
  const be = breakEvenRate(p);
  const e = employedYear(p);
  assert.ok(Math.abs(locumYear(p, p.weeks, be).total - e.total) < 1);
  assert.ok(locumYear(p, p.weeks, be + 20).total > e.total);
});

test("break-even rate falls as weeks worked rise", () => {
  const r = analyze(samplePlan());
  for (let i = 1; i < r.rows.length; i++) assert.ok(r.rows[i].breakEven < r.rows[i - 1].breakEven);
  assert.equal(r.rows.length, SENSITIVITY_WEEKS.length);
  assert.equal(r.rows[0].gap, 52 - r.rows[0].weeks);
});

test("analyze reports a winner, the difference, and weeks needed", () => {
  const r = analyze(samplePlan());
  assert.equal(r.diffTotal, r.locum.total - r.employed.total);
  assert.ok(r.winner === "locum" || r.winner === "employed");
  const rich = analyze({ ...samplePlan(), rate: "500" });
  assert.equal(rich.winner, "locum");
  assert.ok(rich.breakEvenWeeks >= 1 && rich.breakEvenWeeks < 40);
});

test("analyze validates input", () => {
  assert.match(analyze({ ...samplePlan(), rate: "" }).error, /Locum hourly rate/);
  assert.match(analyze({ ...samplePlan(), weeks: "60" }).error, /between 1 and 52/);
  assert.match(analyze({ ...samplePlan(), salary: "0" }).error, /greater than zero/);
  assert.match(analyze({ ...samplePlan(), malpractice: "-5" }).error, /negative/);
  assert.equal(analyze({ ...samplePlan(), pto: "", travelCost: "" }).error, undefined);
});

test("csv has one line per weeks scenario plus header", () => {
  const csv = reportCsv(analyze(samplePlan()));
  assert.equal(csv.trim().split("\n").length, SENSITIVITY_WEEKS.length + 1);
});
