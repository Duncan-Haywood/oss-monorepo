import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, summaryText, SAMPLE, VERIFY, parse } from "./calc.mjs";

const run = (o) => compute({ ...SAMPLE, ...o });

test("sample: first year with payments on account is a 150% January bill", () => {
  const r = run({});
  assert.equal(r.required, true);
  assert.equal(r.each, 3200);
  assert.equal(r.balancing, 6400);
  assert.equal(r.janTotal, 9600);
  assert.equal(r.julTotal, 3200);
  assert.equal(r.firstTime, true);
  assert.equal(r.perMonth, 533.33);
});

test("under 1,000 after tax at source means no payments on account; exactly 1,000 does", () => {
  assert.equal(run({ totalTax: 999 }).required, false);
  assert.equal(run({ totalTax: 999 }).janTotal, 999);
  const r = run({ totalTax: 1000 });
  assert.equal(r.required, true);
  assert.equal(r.each, 500);
});

test("more than 80% collected at source exempts; exactly 80% does not", () => {
  const over = run({ totalTax: 10000, atSource: 8001 });
  assert.equal(over.required, false);
  assert.equal(over.reason, "source");
  const at = run({ totalTax: 10000, atSource: 8000 });
  assert.equal(at.required, true);
  assert.equal(at.each, 1000);
});

test("established taxpayer: balancing is the bill less payments already made", () => {
  const r = run({ totalTax: 8000, paid: 6000, estimate: "" });
  assert.equal(r.balancing, 2000);
  assert.equal(r.each, 4000);
  assert.equal(r.janTotal, 6000);
  assert.equal(r.firstTime, false);
  assert.equal(r.reduction, null);
});

test("overpayment nets off against the next instalment", () => {
  const r = run({ totalTax: 4000, paid: 5000, estimate: "" });
  assert.equal(r.balancing, -1000);
  assert.equal(r.janTotal, 1000);
});

test("other amounts due are added to January but never to the relevant amount", () => {
  const r = run({ other: 2500, estimate: "" });
  assert.equal(r.relevant, 6400);
  assert.equal(r.janTotal, 12100);
});

test("reduction claim: lower expected bill halves into smaller instalments, a timing change only", () => {
  const r = run({ totalTax: 8000, estimate: 5000 });
  assert.equal(r.reduction.reducedEach, 2500);
  assert.equal(r.reduction.savingNow, 3000);
  assert.equal(r.reduction.balancingNextStandard, -3000);
  assert.equal(r.reduction.balancingNextReduced, 0);
});

test("no reduction offered when the expected bill is not lower", () => {
  assert.equal(run({ estimate: 9000 }).reduction, null);
  assert.equal(run({ estimate: "" }).reduction, null);
});

test("dates follow the tax year", () => {
  const r = run({});
  assert.equal(r.janDate, "2027-01-31");
  assert.equal(r.julDate, "2027-07-31");
  assert.equal(run({ year: 2026 }).janDate, "2028-01-31");
});

test("negative, non-numeric and missing input is rejected, not clamped", () => {
  assert.ok(run({ totalTax: -1 }).errors.length);
  assert.ok(run({ totalTax: "abc" }).errors.length);
  assert.ok(run({ totalTax: "" }).errors.length);
  assert.ok(run({ year: 2020 }).errors.length);
  assert.ok(parse({ ...SAMPLE, atSource: -5 }).errors.length);
  assert.ok(run({ estimate: -3 }).errors.length);
});

test("summary names the source to verify and is not advice", () => {
  const t = summaryText(run({}));
  assert.ok(t.includes(VERIFY));
  assert.match(t, /Not tax advice/);
  assert.match(t, /2027-01-31/);
});
