import { test } from "node:test";
import assert from "node:assert/strict";
import { check, frsCompare, parseMonths, SAMPLE, summaryText, R } from "./calc.mjs";

const flat = (v, n = 12) => Array(n).fill(v);

test("below the threshold with plenty of headroom", () => {
  const r = check({ months: flat(3000), endYear: 2026, endMonth: 8 });
  assert.equal(r.ok, true);
  assert.equal(r.status, "below");
  assert.equal(r.last.rolling, 36000);
  assert.equal(r.headroom, 54000);
});

test("exactly at the threshold is not over it; one pound over is", () => {
  assert.equal(check({ months: flat(7500), endYear: 2026, endMonth: 8 }).breach, null);
  const r = check({ months: [...flat(7500, 11), 7501], endYear: 2026, endMonth: 8 });
  assert.equal(r.status, "registration-due");
  assert.equal(r.breach.label, "Sep 2026");
});

test("deadline is 30 days after month end and effective date is the second month after", () => {
  const r = check({ months: [...flat(0, 11), 95000], endYear: 2026, endMonth: 8 });
  assert.equal(r.deadline, "30 Oct 2026");
  assert.equal(r.effective, "1 Nov 2026");
  const dec = check({ months: [...flat(0, 11), 95000], endYear: 2026, endMonth: 11 });
  assert.equal(dec.deadline, "30 Jan 2027");
  assert.equal(dec.effective, "1 Feb 2027");
});

test("rolling window drops old months", () => {
  const months = [100000, ...flat(0, 12)];
  const r = check({ months, endYear: 2026, endMonth: 8 });
  assert.equal(r.breach.label, "Sep 2025");
  assert.equal(r.last.rolling, 0);
});

test("forward 30-day test and close warning", () => {
  assert.equal(check({ months: flat(1000), endYear: 2026, endMonth: 0, next30: 95000 }).status, "forward-look");
  assert.equal(check({ months: flat(6500), endYear: 2026, endMonth: 0 }).status, "close");
});

test("bad input is rejected, not clamped", () => {
  assert.equal(check({ months: [], endYear: 2026, endMonth: 0 }).ok, false);
  assert.equal(check({ months: [1, -5], endYear: 2026, endMonth: 0 }).ok, false);
  assert.equal(check({ months: [1], endYear: 2026, endMonth: 12 }).ok, false);
  assert.equal(check({ months: "1 x 3", endYear: 2026, endMonth: 0 }).ok, false);
  assert.deepEqual(parseMonths("1, 2;3 4"), [1, 2, 3, 4]);
});

test("flat rate scheme: low-cost service firm hits the limited cost trader rate", () => {
  const f = frsCompare({ turnover: 60000, costs: 2000, goodsCost: 300, sector: "consulting", firstYear: "no" });
  assert.equal(f.limitedCost, true);
  assert.equal(f.rate, 0.165);
  assert.equal(Math.round(f.frsPay), Math.round(72000 * 0.165));
  assert.ok(f.diff < 0);
});

test("flat rate scheme: goods-heavy retailer is better off and first-year discount applies", () => {
  const f = frsCompare({ turnover: 100000, costs: 10000, goodsCost: 10000, sector: "retail", firstYear: "yes" });
  assert.equal(f.limitedCost, false);
  assert.ok(Math.abs(f.rate - 0.065) < 1e-9);
  assert.ok(f.diff > 0);
  const g = frsCompare({ turnover: 40000, costs: 0, goodsCost: 0, sector: "building", firstYear: "no" });
  assert.equal(g.limitedCost, true);
});

test("frs rejects bad input and flags turnover above entry limit", () => {
  assert.equal(frsCompare({ turnover: 1, costs: 5, goodsCost: 9, sector: "other" }).ok, false);
  assert.equal(frsCompare({ turnover: 1, costs: 5, goodsCost: 0, sector: "nope" }).ok, false);
  const f = frsCompare({ turnover: R.frsEntry + 1, costs: 0, goodsCost: 0, sector: "other" });
  assert.ok(f.findings.some((x) => x.severity === "high"));
});

test("sample runs and the summary states it is not advice", () => {
  const r = check(SAMPLE);
  const f = frsCompare(SAMPLE);
  assert.ok(r.ok && f.ok);
  assert.match(summaryText(SAMPLE, r, f), /Not tax advice/);
});
