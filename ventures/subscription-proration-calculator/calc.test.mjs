import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, parse, SAMPLE, summaryText, sweepCsv, dollars } from "./calc.mjs";

const base = { ...SAMPLE };

test("mid-month upgrade is prorated by days: hand-computed", () => {
  // 31-day period. 16 days at 100 = 51.61, 15 days at 150 = 72.58, total 124.19, billed 100.
  const r = compute(base);
  assert.deepEqual(r.errors, []);
  assert.equal(r.segments.length, 2);
  assert.equal(r.segments[0].days, 16);
  assert.equal(r.segments[0].charge, 5161);
  assert.equal(r.segments[1].days, 15);
  assert.equal(r.segments[1].charge, 7258);
  assert.equal(r.net, 2419);
  assert.equal(r.nextAmount, 15000);
});

test("downgrade produces a credit", () => {
  const r = compute({ ...base, startAmount: "150", changes: "2026-01-17, 100" });
  // 16/31*150 = 77.42, 15/31*100 = 48.39, total 125.81, billed 150 -> credit 24.19
  assert.equal(r.net, 12581 - 15000);
  assert.match(r.findings[0].title, /owed \$24\.19/);
});

test("cancelling (amount 0) credits the unused days", () => {
  const r = compute({ ...base, changes: "2026-01-17, 0" });
  assert.equal(r.net, 5161 - 10000);
  assert.ok(r.findings.some((f) => /cancellation/.test(f.title)));
});

test("reset mode credits unused time and charges a full new period from the change date", () => {
  const r = compute({ ...base, mode: "reset" });
  assert.equal(r.creditUnused, 4839); // 15/31 * 100
  assert.equal(r.chargeNew, 15000);
  assert.equal(r.net, 15000 - 4839);
  assert.equal(new Date(r.nextRenewal).toISOString().slice(0, 10), "2026-02-17");
});

test("multiple changes are sorted and priced as segments that cover the whole period", () => {
  const r = compute({ ...base, changes: "2026-01-21, 200\n2026-01-11, 120" });
  assert.deepEqual(r.errors, []);
  assert.equal(r.segments.length, 3);
  assert.equal(r.segments.reduce((s, x) => s + x.days, 0), 31);
  assert.equal(r.segments[0].days, 10);
  assert.equal(r.segments[1].amount, 12000);
  assert.equal(r.segments[2].amount, 20000);
  const sum = r.segments.reduce((s, x) => s + x.charge, 0);
  assert.equal(r.net, sum - 10000);
  assert.equal(r.nextAmount, 20000);
});

test("a change on the first day replaces the whole period", () => {
  const r = compute({ ...base, changes: "2026-01-01, 150" });
  assert.equal(r.segments.length, 1);
  assert.equal(r.net, 5000);
});

test("tax is applied to the net balance, including credits", () => {
  const r = compute({ ...base, taxPct: "10" });
  assert.equal(r.tax, 242); // 24.19 * 10% = 2.419 -> 2.42
  assert.equal(r.invoice, 2419 + 242);
  const c = compute({ ...base, changes: "2026-01-17, 50", taxPct: "10" });
  assert.ok(c.net < 0 && c.tax < 0);
});

test("leap-year February has 29 days", () => {
  const r = compute({ ...base, periodStart: "2028-02-01", periodEnd: "2028-03-01", startAmount: "29", changes: "2028-02-16, 58" });
  assert.equal(r.totalDays, 29);
  assert.equal(r.segments[0].days, 15);
  assert.equal(r.segments[0].charge, 1500);
  assert.equal(r.segments[1].days, 14);
  assert.equal(r.segments[1].charge, 2800); // 14/29 * 58
});

test("bad input is rejected, not clamped", () => {
  assert.match(compute({ ...base, periodStart: "2026-02-30" }).errors[0], /start/);
  assert.match(compute({ ...base, periodEnd: "2025-12-01" }).errors.join(" "), /after it starts/);
  assert.match(compute({ ...base, changes: "2026-03-01, 150" }).errors[0], /outside the period/);
  assert.match(compute({ ...base, changes: "2026-01-05, 10\n2026-01-05, 20" }).errors[0], /share the date/);
  assert.match(compute({ ...base, changes: "2026-01-05, -4" }).errors[0], /0 or more/);
  assert.match(compute({ ...base, changes: "nonsense" }).errors[0], /date, new amount/);
  assert.match(compute({ ...base, startAmount: "" }).errors[0], /already billed/);
  assert.match(compute({ ...base, taxPct: "80" }).errors[0], /Tax rate/);
  assert.match(compute({ ...base, mode: "reset", changes: "2026-01-05, 1\n2026-01-09, 2" }).errors[0], /one change/);
  assert.match(compute({ ...base, changes: "" }).errors[0], /at least one change/);
});

test("sweep covers the period and net rises monotonically for an upgrade in prorate mode", () => {
  const r = compute(base);
  assert.equal(r.sweep.length, 9);
  assert.equal(r.sweep[0].net, 5000); // full-period upgrade on day one
  for (let i = 1; i < r.sweep.length; i++) assert.ok(r.sweep[i].net <= r.sweep[i - 1].net);
});

test("summary and csv render", () => {
  const r = compute(base);
  assert.match(summaryText(r), /Balance now: charge \$24\.19/);
  assert.match(sweepCsv(r), /^change_date,credit_for_unused_old,charge_for_new,net_balance\n2026-01-01,/);
  assert.equal(dollars(-1234), "-$12.34");
});

test("parse accepts tab and semicolon separators and dollar signs", () => {
  const p = parse({ ...base, changes: "2026-01-10;$1,200.50" });
  assert.deepEqual(p.errors, []);
  assert.equal(p.changes[0].amount, 120050);
});

test("impossible calendar dates are rejected, not rolled over", () => {
  assert.match(compute({ ...base, periodEnd: "2026-02-30" }).errors[0], /billing period end/);
  assert.match(compute({ ...base, periodStart: "2026-13-01" }).errors[0], /billing period start/);
  assert.match(compute({ ...base, periodStart: "2026-01-32" }).errors[0], /billing period start/);
});

test("a period that ends the day it starts is rejected", () => {
  const r = compute({ ...base, periodStart: "2026-01-01", periodEnd: "2026-01-01", changes: "2026-01-01, 150" });
  assert.match(r.errors.join(" "), /must end after it starts/);
});

test("sweep runs from the first day to the last day of the period", () => {
  const r = compute(base);
  const day = 86400000;
  assert.equal(r.sweep[0].date, r.start);
  assert.equal(r.sweep[r.sweep.length - 1].date, r.end - day);
});
