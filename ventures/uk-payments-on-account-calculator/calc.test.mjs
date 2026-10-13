import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, summaryText, SAMPLE, VERIFY, parse } from "./calc.mjs";

const run = (o) => compute({ ...SAMPLE, ...o });

test("sample: first-year bill of 6,400 asks for 9,600 in January and 3,200 in July", () => {
  const r = run({});
  assert.equal(r.required, true);
  assert.equal(r.each, 3200);
  assert.equal(r.balancing, 6400);
  assert.equal(r.janTotal, 9600);
  assert.equal(r.dates.jan, "2027-01-31");
  assert.equal(r.dates.jul, "2027-07-31");
  assert.equal(r.dates.nextJan, "2028-01-31");
});

test("exactly 1,000 net bill triggers payments; 999.99 does not", () => {
  assert.equal(run({ bill: 1000 }).required, true);
  assert.equal(run({ bill: 999.99 }).required, false);
});

test("80% collected at source switches payments on account off; 79% does not", () => {
  assert.equal(run({ bill: 10000, atSource: 8000 }).required, false);
  assert.equal(run({ bill: 10000, atSource: 7900 }).required, true);
});

test("payments on account are half of the net bill after source deductions", () => {
  const r = run({ bill: 10000, atSource: 5000 });
  assert.equal(r.net, 5000);
  assert.equal(r.each, 2500);
});

test("already-made payments reduce the balancing payment", () => {
  const r = run({ bill: 6400, paid: 5000 });
  assert.equal(r.balancing, 1400);
  assert.equal(r.janTotal, 1400 + 3200);
});

test("overpayment shows a refund, not a negative January bill", () => {
  const r = run({ bill: 2000, paid: 3000 });
  assert.equal(r.balancing, -1000);
  assert.equal(r.janTotal, 1000);
  assert.ok(r.findings.some((f) => /more on account/.test(f.title)));
});

test("a lower expected bill offers a reduction and names the interest risk", () => {
  const r = run({ next: 4000 });
  assert.equal(r.reduction.reducedEach, 2000);
  assert.equal(r.reduction.saving, 2400);
  assert.ok(r.reduction.interestIfWrong > 0);
  assert.ok(r.findings.some((f) => /penalty/.test(f.title)));
});

test("a higher expected bill offers nothing to reduce", () => {
  const r = run({ next: 9000 });
  assert.equal(r.reduction, null);
});

test("blank next-year figure skips the reduction section", () => {
  const r = run({ next: "" });
  assert.equal(r.reduction, null);
});

test("deadlines follow the tax year", () => {
  assert.equal(run({ year: 2026 }).dates.jan, "2028-01-31");
});

test("bad input is rejected, not clamped", () => {
  assert.ok(run({ bill: -1 }).errors.length);
  assert.ok(run({ bill: "" }).errors.length);
  assert.ok(run({ year: 2020 }).errors.length);
  assert.ok(run({ rate: 99 }).errors.length);
  assert.ok(run({ bill: 100, atSource: 200 }).errors.length);
  assert.ok(parse({ ...SAMPLE, paid: "x" }).errors.length);
});

test("summary names the source and says it is not tax advice", () => {
  const t = summaryText(run({}));
  assert.ok(t.includes(VERIFY));
  assert.match(t, /Not tax advice/);
});
