import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, summaryText, incomeTax, SAMPLE, VERIFY } from "./calc.mjs";

const run = (o) => compute({ ...SAMPLE, ...o });

test("income tax bands and 100k taper", () => {
  assert.equal(incomeTax(12570), 0);
  assert.equal(incomeTax(50270), 7540);
  assert.equal(incomeTax(100000), 27432);
  assert.equal(incomeTax(125140), 42516);
});

test("rent within the limit is automatic and tax-free", () => {
  const r = run({ receipts: 7500 });
  assert.equal(r.automatic, true);
  assert.equal(r.bestTax, 0);
  assert.equal(r.taxableRelief, 0);
  assert.ok(r.taxNothing > 0);
});

test("shared income halves the limit", () => {
  assert.equal(run({ receipts: 5000, shared: "yes" }).automatic, false);
  assert.equal(run({ receipts: 3750, shared: "yes" }).automatic, true);
});

test("sample: relief route beats normal when expenses are below the limit", () => {
  const r = run({});
  assert.equal(r.taxRelief, 700);
  assert.equal(r.taxNormal, 2066);
  assert.equal(r.best, "relief");
  assert.equal(r.choiceSaving, 1366);
});

test("normal rules win when expenses exceed the limit", () => {
  const r = run({ expenses: 9000 });
  assert.equal(r.best, "normal");
  assert.equal(r.taxableNormal, 2000);
  assert.equal(r.taxNormal, 400);
  assert.ok(r.taxRelief > r.taxNormal);
});

test("expenses above rent is a loss, taxed at nothing", () => {
  const r = run({ expenses: 12000 });
  assert.equal(r.taxableNormal, 0);
  assert.equal(r.taxNormal, 0);
  assert.ok(r.findings.some((f) => f.title.includes("loss")));
});

test("bad input is rejected, not clamped", () => {
  assert.ok(compute({ ...SAMPLE, receipts: "" }).errors.length);
  assert.ok(compute({ ...SAMPLE, receipts: -1 }).errors.length);
  assert.ok(compute({ ...SAMPLE, year: 1999 }).errors.length);
  assert.ok(compute({ ...SAMPLE, shared: "maybe" }).errors.length);
});

test("summary names the source and disclaims", () => {
  const t = summaryText(run({}));
  assert.ok(t.includes(VERIFY));
  assert.match(t, /Not tax advice/);
});
