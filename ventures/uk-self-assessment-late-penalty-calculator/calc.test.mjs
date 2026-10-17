import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, summaryText, SAMPLE, VERIFY, addMonths, iso, toDate } from "./calc.mjs";

const run = (o) => compute({ ...SAMPLE, ...o });

test("sample: 104 days late on both is 100 + 15 days x 10 + 5% + interest", () => {
  const r = run({});
  assert.equal(r.due, "2026-01-31");
  assert.equal(r.filingTotal, 250);
  assert.equal(r.paymentTotal, 320);
  assert.equal(r.interest, 145.88);
  assert.equal(r.total, 715.88);
});

test("on time on both is nothing", () => {
  const r = run({ filed: "2026-01-31", paid: "2026-01-31" });
  assert.equal(r.total, 0);
  assert.equal(r.filing.length, 0);
});

test("one day late: 100 filing penalty, no payment penalty yet, one day of interest", () => {
  const r = run({ filed: "2026-02-01", paid: "2026-02-01" });
  assert.equal(r.filingTotal, 100);
  assert.equal(r.paymentTotal, 0);
  assert.equal(r.interest, 1.40);
});

test("payment penalty starts after 30 days, not on day 30", () => {
  assert.equal(run({ paid: "2026-03-02" }).paymentTotal, 0);
  assert.equal(run({ paid: "2026-03-03" }).paymentTotal, 320);
});

test("daily filing penalties start after three months and cap at 90 days", () => {
  assert.equal(run({ filed: "2026-04-30" }).filingTotal, 100);
  assert.equal(run({ filed: "2026-05-01" }).filingTotal, 110);
  assert.equal(run({ filed: "2026-07-29" }).filingTotal, 100 + 900);
  assert.equal(run({ filed: "2026-07-31" }).filingTotal, 100 + 900);
});

test("six and twelve month filing tiers use the greater of 300 or 5%", () => {
  assert.equal(run({ filed: "2026-08-01", taxDue: 1000 }).filingTotal, 100 + 900 + 300);
  assert.equal(run({ filed: "2026-08-01", taxDue: 10000 }).filingTotal, 100 + 900 + 500);
  assert.equal(run({ filed: "2027-02-01", taxDue: 10000 }).filingTotal, 100 + 900 + 500 + 500);
});

test("payment tiers at six and twelve months", () => {
  assert.equal(run({ paid: "2026-08-01" }).paymentTotal, 640);
  assert.equal(run({ paid: "2027-02-01" }).paymentTotal, 960);
});

test("no tax owed still costs the 100 filing penalty, and no payment penalty or interest", () => {
  const r = run({ taxDue: 0 });
  assert.equal(r.paymentTotal, 0);
  assert.equal(r.interest, 0);
  assert.equal(r.filingTotal, 250);
  assert.ok(r.findings.some((f) => /owed no tax/.test(f.title)));
});

test("filing late but paying on time leaves only filing penalties", () => {
  const r = run({ paid: "2026-01-31" });
  assert.equal(r.paymentTotal, 0);
  assert.equal(r.interest, 0);
  assert.ok(r.filingTotal > 0);
});

test("addMonths clamps to month end", () => {
  assert.equal(iso(addMonths(toDate("2026-01-31"), 3)), "2026-04-30");
  assert.equal(iso(addMonths(toDate("2026-01-31"), 6)), "2026-07-31");
});

test("delay table is non-decreasing and starts at the base total", () => {
  const r = run({});
  assert.equal(r.delays[0].total, r.total);
  for (let i = 1; i < r.delays.length; i++) assert.ok(r.delays[i].total >= r.delays[i - 1].total);
});

test("bad input is rejected with a message, never clamped", () => {
  assert.ok(run({ year: 1999 }).errors.length);
  assert.ok(run({ taxDue: -1 }).errors.length);
  assert.ok(run({ taxDue: "" }).errors.length);
  assert.ok(run({ filed: "2026-02-30" }).errors.length);
  assert.ok(run({ paid: "not a date" }).errors.length);
  assert.ok(run({ rate: 80 }).errors.length);
  assert.ok(run({ rate: "" }).errors.length);
});

test("summary names the source and the disclaimer", () => {
  const t = summaryText(run({}));
  assert.ok(t.includes(VERIFY));
  assert.match(t, /Not tax advice/);
});
