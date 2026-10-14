import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, SAMPLE, summaryText, addMonths, dueDate, iso } from "./calc.mjs";

const base = { ...SAMPLE, maxBalance: "", avgBalance: "" };
const near = (a, b, tol = 0.02) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

test("due date is nine months and a day after the year end", () => {
  assert.equal(iso(dueDate(new Date(Date.UTC(2026, 2, 31)))), "2027-01-01");
  assert.equal(iso(dueDate(new Date(Date.UTC(2026, 5, 30)))), "2027-04-01");
  assert.equal(iso(dueDate(new Date(Date.UTC(2026, 4, 15)))), "2027-02-16");
});

test("month-end rolls to month-end, including leap February", () => {
  assert.equal(iso(addMonths(new Date(Date.UTC(2025, 4, 31)), 9)), "2026-02-28");
  assert.equal(iso(addMonths(new Date(Date.UTC(2027, 4, 31)), 9)), "2028-02-29");
});

test("s455 at 33.75% for an older loan", () => {
  const r = compute({ ...base, balance: "42000" });
  assert.deepEqual(r.errors, []);
  assert.equal(r.s455Rate, 33.75);
  assert.equal(r.s455, 14175);
  assert.equal(r.dueDate, "2027-01-01");
});

test("s455 at 35.75% for a loan made from 6 April 2026", () => {
  const r = compute({ ...base, balance: "10000", loanDate: "post" });
  assert.equal(r.s455, 3575);
});

test("repaying before the due date reduces or removes s455", () => {
  assert.equal(compute({ ...base, balance: "20000", repaid: "20000" }).s455, 0);
  assert.equal(compute({ ...base, balance: "20000", repaid: "5000" }).s455, 5062.5);
});

test("dividend route uses the allowance and the band rate", () => {
  const r = compute({ ...base, balance: "42000" });
  const d = r.options.find((o) => o.key === "dividend");
  near(d.leakage, (42000 - 500) * 0.3575);
});

test("bonus route grosses up for tax and NIC and credits corporation tax relief", () => {
  const r = compute({ ...base, balance: "42000" });
  const b = r.options.find((o) => o.key === "bonus");
  const gross = 42000 / 0.58;
  near(b.leakage, gross - 42000 + gross * 0.15 - gross * 1.15 * 0.25);
  assert.ok(b.leakage > r.options.find((o) => o.key === "dividend").leakage);
});

test("basic-rate payer: bonus uses 8% employee NIC", () => {
  const r = compute({ ...base, balance: "10000", taxBand: "20" });
  const gross = 10000 / (1 - 0.28);
  near(r.options.find((o) => o.key === "bonus").leakage, gross - 10000 + gross * 0.15 - gross * 1.15 * 0.25);
});

test("beneficial loan benefit applies only above 10,000 and falls with interest", () => {
  const r = compute({ ...SAMPLE });
  assert.equal(r.benefit, 1125);
  assert.equal(r.bikTax, 450);
  assert.equal(r.class1A, 168.75);
  assert.equal(compute({ ...SAMPLE, maxBalance: "9000", avgBalance: "9000", balance: "9000" }).benefit, 0);
  assert.equal(compute({ ...SAMPLE, interestPct: "3.75" }).benefit, 0);
});

test("refund date follows the period in which the loan is repaid", () => {
  const r = compute({ ...base, balance: "10000", repayDate: "2027-02-10" });
  assert.equal(r.refundDate, "2028-01-01");
  assert.ok(r.monthsTied >= 11 && r.monthsTied <= 13);
  const early = compute({ ...base, balance: "10000", repayDate: "2026-12-01" });
  assert.equal(early.refundDate, null);
  assert.ok(early.findings.some((f) => /no s455 would be payable/.test(f.title)));
});

test("re-borrowing triggers a warning", () => {
  const r = compute({ ...base, balance: "20000", redraw: "yes" });
  assert.ok(r.findings.some((f) => /30 days/.test(f.title)));
});

test("bad input is reported, not thrown", () => {
  assert.ok(compute({ ...base, yearEnd: "" }).errors.length);
  assert.ok(compute({ ...base, balance: "-5" }).errors.length);
  assert.ok(compute({ ...base, repayDate: "2025-01-01" }).errors.length);
  assert.ok(compute({ ...base, ctRate: "400" }).errors.length);
});

test("summary text carries the s455 figure and the disclaimer", () => {
  const t = summaryText(compute({ ...SAMPLE }));
  assert.match(t, /£14,175/);
  assert.match(t, /Not tax advice/);
});
