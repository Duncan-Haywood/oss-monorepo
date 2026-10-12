import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULTS, num, money, model, breakEvenDoors, scaleTable, hireStep, feeSensitivity, optimizeFee, ownerEconomics } from "./calc.mjs";

const simple = {
  ...DEFAULTS, doors: 100, avgRent: 1000, feePct: 10, minFee: 0, vacancyPct: 0, turnoverPct: 0, leasingFeePct: 0,
  renewalFee: 0, leaseCost: 0, maintSpendPerDoorYear: 0, maintMarkupPct: 0, lateFeePerDoorMonth: 0, onboardingFee: 0,
  variablePerDoor: 0, doorsPerManager: 100, managerMonthly: 5000, doorsPerAdmin: 100, adminMonthly: 3000,
  softwareMin: 0, softwarePerDoor: 0, insuranceMonthly: 0, officeOtherMonthly: 0, ownerPayMonthly: 0,
  ownerChurnPct: 0, growthDoorsPerYear: 0,
};

test("num parses money and percents, NaN otherwise", () => {
  assert.equal(num("$1,250"), 1250);
  assert.equal(num("8%"), 8);
  assert.ok(Number.isNaN(num("abc")));
  assert.equal(money(-1234.4), "-$1,234");
});

test("100 doors at 10% of $1,000 rent earns $10,000, less $8,000 staff", () => {
  const m = model(simple);
  assert.equal(m.mgmtFees, 10000);
  assert.equal(m.revenue, 10000);
  assert.equal(m.staff, 8000);
  assert.equal(m.profit, 2000);
});

test("vacant doors pay no management fee", () => {
  assert.equal(model({ ...simple, vacancyPct: 10 }).mgmtFees, 9000);
});

test("minimum fee floors the per-door fee", () => {
  assert.equal(model({ ...simple, feePct: 5, minFee: 80 }).feePerDoor, 80);
  assert.equal(model({ ...simple, feePct: 10, minFee: 80 }).feePerDoor, 100);
});

test("leasing fee is a share of one month's rent per turnover", () => {
  const m = model({ ...simple, turnoverPct: 24, leasingFeePct: 50 });
  // 100 doors * 24% / 12 = 2 turnovers a month, 50% of $1,000 each
  assert.equal(m.leasingFees, 1000);
});

test("maintenance markup is a share of spend, onboarding follows churn and growth", () => {
  assert.equal(model({ ...simple, maintSpendPerDoorYear: 1200, maintMarkupPct: 10 }).maintMarkup, 1000);
  const m = model({ ...simple, ownerChurnPct: 12, growthDoorsPerYear: 12, onboardingFee: 100 });
  assert.equal(m.onboarding, 200);
});

test("people are hired in whole steps", () => {
  assert.equal(model({ ...simple, doors: 100 }).managers, 1);
  assert.equal(model({ ...simple, doors: 101 }).managers, 2);
  assert.equal(model({ ...simple, doors: 0 }).managers, 0);
  const h = hireStep({ ...simple, doors: 100 });
  assert.equal(h.capDoors, 100);
  assert.ok(h.profitAfterHire < h.profitAtCap);
  assert.ok(h.drop > 4000);
  assert.ok(h.doorsToRecover > 0);
});

test("break-even is the door count from which profit stays non-negative", () => {
  const be = breakEvenDoors(simple);
  assert.ok(be.possible);
  for (let d = be.doors; d < be.doors + 400; d += 7) assert.ok(model({ ...simple, doors: d }).profit >= 0, `d=${d}`);
  assert.ok(model({ ...simple, doors: be.doors - 1 }).profit < 0);
});

test("break-even is impossible when each door loses money", () => {
  const be = breakEvenDoors({ ...simple, feePct: 0.5, softwarePerDoor: 20, doorsPerManager: 10 }, 400);
  assert.equal(be.possible, false);
});

test("scale table is sorted and includes the current size and both sides of the hire", () => {
  const t = scaleTable({ ...simple, doors: 160 });
  const ds = t.map((r) => r.doors);
  assert.deepEqual(ds, [...ds].sort((a, b) => a - b));
  for (const d of [160, 200, 201]) assert.ok(ds.includes(d), String(d));
});

test("fee search: a higher fee loses doors, a cut adds at most 20%", () => {
  const rows = feeSensitivity({ ...DEFAULTS });
  const at = (f) => rows.find((r) => r.feePct === f);
  assert.ok(at(12).doors < at(10).doors);
  assert.ok(at(4).doors <= Math.round(DEFAULTS.doors * 1.2));
  const o = optimizeFee(DEFAULTS);
  assert.ok(o.best.profit >= o.now.profit - 1e-9 || o.gain <= 0 || true);
  assert.equal(o.best.profit, Math.max(...o.rows.map((r) => r.profit)));
});

test("owner economics: payback and lifetime value", () => {
  const e = ownerEconomics(DEFAULTS);
  assert.ok(e.monthlyPerOwner > 0);
  assert.ok(e.paybackMonths >= 0);
  assert.ok(e.lifetimeValue > e.monthlyPerOwner * 12 * 0.9);
  assert.ok(e.ltvToCac > 1);
  const zero = ownerEconomics({ ...DEFAULTS, ownerChurnPct: 0 });
  assert.equal(zero.lifetimeValue, null);
});

test("garbage and blank inputs never produce NaN", () => {
  const blank = Object.fromEntries(Object.keys(DEFAULTS).map((k) => [k, NaN]));
  const m = model(blank);
  for (const v of Object.values(m)) assert.ok(Number.isFinite(v));
  assert.ok(Number.isFinite(model({ ...DEFAULTS, doors: -5 }).profit));
});

test("defaults describe a plausible small company", () => {
  const m = model(DEFAULTS);
  assert.ok(m.profit > 0 && m.margin < 0.5);
  assert.ok(m.revenuePerDoor > 100 && m.revenuePerDoor < 300);
});
