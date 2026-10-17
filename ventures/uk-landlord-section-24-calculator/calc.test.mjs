import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, summaryText, SAMPLE, VERIFY, parse } from "./calc.mjs";

const run = (o) => compute({ ...SAMPLE, ...o });

test("sample: higher-rate landlord pays 3,000 more than under the old rules", () => {
  const r = run({});
  assert.equal(r.profitBefore, 18000);
  assert.equal(r.trueProfit, 3000);
  assert.equal(r.taxBefore, 18632);
  assert.equal(r.credit, 3000);
  assert.equal(r.newTax, 15632);
  assert.equal(r.oldTax, 12632);
  assert.equal(r.extra, 3000);
  assert.equal(r.salaryTax, 11432);
  assert.equal(r.taxOnProperty, 4200);
  assert.equal(r.effective, 140);
  assert.ok(r.findings.some((f) => f.title.includes("more than your real profit")));
});

test("basic-rate landlord stays whole: the 20% credit equals the old relief", () => {
  const r = run({ other: 20000, rent: 12000, expenses: 1000, finance: 4000 });
  assert.equal(r.extra, 0);
  assert.ok(r.findings[0].title.includes("nothing extra"));
});

test("no finance costs: Section 24 changes nothing", () => {
  const r = run({ finance: 0 });
  assert.equal(r.extra, 0);
  assert.equal(r.credit, 0);
  assert.ok(r.findings[0].title.includes("changes nothing"));
});

test("credit is capped by property profit, and the excess is reported", () => {
  const r = run({ other: 60000, rent: 10000, expenses: 1000, finance: 15000 });
  assert.equal(r.creditBase, 9000);
  assert.equal(r.unrelieved, 6000);
  assert.ok(r.findings.some((f) => f.title.includes("did not get the 20% credit")));
});

test("rent profit before finance costs can cross 100k and trigger the allowance taper", () => {
  const r = run({ other: 95000, rent: 30000, expenses: 0, finance: 25000 });
  assert.equal(r.income, 125000);
  assert.equal(r.allowance, 70);
  assert.ok(r.findings.some((f) => f.title.includes("personal allowance taper")));
});

test("a property loss is flagged and taxes nothing extra", () => {
  const r = run({ rent: 1000, expenses: 3000, finance: 0 });
  assert.equal(r.profitBefore, 0);
  assert.ok(r.findings.some((f) => f.title.includes("property loss")));
});

test("bad input is rejected, never clamped", () => {
  assert.ok(compute({ ...SAMPLE, rent: "" }).errors.length);
  assert.ok(compute({ ...SAMPLE, other: -1 }).errors.length);
  assert.ok(compute({ ...SAMPLE, finance: "x" }).errors.length);
  assert.ok(compute({ ...SAMPLE, year: 1999 }).errors.length);
  assert.ok(parse(undefined).errors.length);
});

test("summary names the source and carries the disclaimer", () => {
  const t = summaryText(run({}));
  assert.ok(t.includes(VERIFY));
  assert.ok(t.includes("Not tax advice"));
  assert.ok(t.includes("Extra tax from Section 24: GBP 3,000"));
});

test("both tax years are accepted and labelled; others are rejected", () => {
  assert.equal(run({ year: 2025 }).label, "2025/26");
  assert.equal(run({ year: 2026 }).label, "2026/27");
  assert.equal(run({ year: "2026" }).label, "2026/27");
  assert.deepEqual(run({ year: 2027 }).errors, ["Pick the tax year."]);
});
