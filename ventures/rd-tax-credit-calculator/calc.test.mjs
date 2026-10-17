import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ASSUMPTIONS, parseEmployees, regularCredit, simplifiedCredit, payrollOffset, rdCreditEstimate, money,
} from "./calc.mjs";

test("stated assumptions", () => {
  assert.equal(ASSUMPTIONS.regularRate, 0.2);
  assert.equal(ASSUMPTIONS.ascRate, 0.14);
  assert.equal(ASSUMPTIONS.ascNoHistoryRate, 0.06);
  assert.equal(ASSUMPTIONS.contractShare, 0.65);
  assert.equal(ASSUMPTIONS.offsetSocialSecurityCap + ASSUMPTIONS.offsetMedicareCap, 500_000);
});

test("staff lines parse with commas, tabs, $ and % signs and a header", () => {
  const { rows, errors } = parseEmployees("name,wages,percent\nAna, $180,000, 80%\nBo\t150000\t60\nCy;120000;50%");
  assert.deepEqual(errors, []);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map((r) => r.share), [0.8, 0.6, 0.5]);
  assert.equal(rows[0].wages, 180_000);
});

test("unreadable staff lines are reported, never silently dropped", () => {
  const { rows, errors } = parseEmployees("Ana, 100000, 50\nBo, lots, 50\nJust a name\nCy, 90000, 150");
  assert.equal(rows.length, 1);
  assert.equal(errors.length, 3);
});

test("QREs add wage share, supplies and 65% of contractors", () => {
  const r = rdCreditEstimate({ employeesText: "A, 100000, 50", supplies: 10_000, contractors: 20_000 });
  assert.equal(r.wageQre, 50_000);
  assert.equal(r.contractQre, 13_000);
  assert.equal(r.qres, 73_000);
});

test("regular credit: 20% over the larger of the receipts base and half of QREs", () => {
  const floor = regularCredit({ qres: 100_000, avgGrossReceipts: 0, fixedBasePct: 0.03 });
  assert.equal(floor.base, 50_000);
  assert.equal(floor.credit, 10_000);
  const big = regularCredit({ qres: 100_000, avgGrossReceipts: 2_000_000, fixedBasePct: 0.03 });
  assert.equal(big.base, 60_000);
  assert.equal(big.credit, 8_000);
});

test("simplified credit: 14% over half the prior average, or 6% with no history", () => {
  const s = simplifiedCredit({ qres: 200_000, prior: [60_000, 90_000, 120_000] });
  assert.equal(s.base, 45_000);
  assert.ok(Math.abs(s.credit - 0.14 * 155_000) < 1e-6);
  const none = simplifiedCredit({ qres: 200_000, prior: [60_000, 0, 120_000] });
  assert.equal(none.credit, 12_000);
  assert.equal(none.noHistory, true);
});

test("the larger method wins and section 280C costs credit times the rate", () => {
  const r = rdCreditEstimate({
    employeesText: "Ana, 180000, 80\nBo, 150000, 60\nCy, 120000, 50",
    supplies: 12_000, contractors: 40_000, priorQres: [80_000, 120_000, 150_000], avgGrossReceipts: 600_000,
  });
  assert.equal(r.qres, 332_000);
  assert.equal(r.method, "simplified");
  assert.ok(r.grossCredit > r.regular.credit);
  assert.ok(Math.abs(r.reducedCredit - r.grossCredit * 0.79) < 1e-6);
  assert.ok(Math.abs(r.section280cCost - r.grossCredit * 0.21) < 1e-6);
  assert.ok(Math.abs(r.marginalPer10k - 1_400) < 1e-6);
  const pass = rdCreditEstimate({ employeesText: "Ana, 100000, 100", entity: "pass-through" });
  assert.equal(pass.taxRate, 0.37);
});

test("payroll offset needs a qualified small business and is capped by payroll tax", () => {
  const ok = payrollOffset({ credit: 40_000, grossReceipts: 900_000, yearsSinceFirstReceipts: 2, staffWages: [200_000, 100_000] });
  assert.equal(ok.eligible, true);
  const ss = 0.062 * (184_500 + 100_000);
  assert.ok(Math.abs(ok.socialSecurity - Math.min(40_000, ss)) < 1e-6);
  assert.ok(Math.abs(ok.total + ok.carryforward - 40_000) < 1e-6);
  const tooBig = payrollOffset({ credit: 40_000, grossReceipts: 6_000_000, yearsSinceFirstReceipts: 2, staffWages: [200_000] });
  assert.equal(tooBig.eligible, false);
  assert.equal(tooBig.total, 0);
  const tooOld = payrollOffset({ credit: 40_000, grossReceipts: 1_000_000, yearsSinceFirstReceipts: 5, staffWages: [200_000] });
  assert.equal(tooOld.eligible, false);
});

test("a large credit is limited to $250,000 + $250,000 and the rest carries forward", () => {
  const r = payrollOffset({ credit: 900_000, grossReceipts: 1_000_000, yearsSinceFirstReceipts: 1, staffWages: Array(120).fill(180_000) });
  assert.equal(r.socialSecurity, 250_000);
  assert.equal(r.medicare, 250_000);
  assert.equal(r.carryforward, 400_000);
});

test("findings flag heavy time shares and unread lines", () => {
  const r = rdCreditEstimate({ employeesText: "Ana, 100000, 95\nbad line", supplies: 0 });
  assert.ok(r.findings.some((f) => /95|90%\+/.test(f.title) || /90%\+/.test(f.title)));
  assert.ok(r.findings.some((f) => f.severity === "high" && /not read/.test(f.title)));
});

test("garbage input yields zeros, not NaN", () => {
  const r = rdCreditEstimate({ employeesText: 42, supplies: "x", contractors: null, priorQres: "nope" });
  assert.equal(r.qres, 0);
  assert.ok(Number.isFinite(r.grossCredit));
  assert.equal(r.grossCredit, 0);
  assert.equal(money(1234.5), "$1,235");
});
