import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, summaryText, SAMPLE, VERIFY, parse } from "./calc.mjs";

const run = (o) => compute({ ...SAMPLE, ...o });

test("sample: 5,000 bill after PAYE, first year, no payments made", () => {
  const r = run({});
  assert.equal(r.relevant, 5000);
  assert.equal(r.required, true);
  assert.equal(r.poa, 2500);
  assert.equal(r.balancing, 5000);
  assert.equal(r.janTotal, 7500);
  assert.equal(r.julTotal, 2500);
  assert.equal(r.deadlines.jan, "2027-01-31");
  assert.equal(r.deadlines.jul, "2027-07-31");
  assert.ok(r.findings.some((f) => /first year/.test(f.title)));
});

test("bill of exactly 1,000 needs no payments on account; 1,001 does", () => {
  assert.equal(run({ liability: 1000, atSource: 0 }).required, false);
  assert.equal(run({ liability: 1001, atSource: 0 }).required, true);
});

test("80% collected at source switches payments on account off", () => {
  assert.equal(run({ liability: 10000, atSource: 8000 }).required, false);
  assert.equal(run({ liability: 10000, atSource: 7999 }).required, true);
});

test("payments already made reduce the balancing payment; overpayment is flagged", () => {
  const r = run({ paidOnAccount: 4000 });
  assert.equal(r.balancing, 1000);
  assert.equal(r.janTotal, 3500);
  const o = run({ paidOnAccount: 6000 });
  assert.equal(o.balancing, -1000);
  assert.equal(o.janTotal, 2500);
  assert.ok(o.findings.some((f) => /more on account/.test(f.title)));
});

test("expected fall in next year's bill offers a reduction claim with its saving", () => {
  const r = run({ growth: -40 });
  assert.equal(r.nextBill, 3000);
  const f = r.findings.find((x) => /reduce each payment/.test(x.title));
  assert.ok(f);
  assert.match(f.title, /GBP 1,500/);
  assert.match(f.title, /GBP 2,000/);
});

test("growth leaves a balancing payment next January", () => {
  const r = run({ growth: 20 });
  assert.equal(r.nextBill, 6000);
  assert.ok(r.findings.some((f) => /balancing payment is GBP 1,000/.test(f.title)));
});

test("bad input is rejected, never clamped", () => {
  assert.ok(parse({ ...SAMPLE, liability: "" }).errors.length);
  assert.ok(parse({ ...SAMPLE, liability: -1 }).errors.length);
  assert.ok(parse({ ...SAMPLE, atSource: 7000 }).errors.length);
  assert.ok(parse({ ...SAMPLE, year: 2019 }).errors.length);
  assert.ok(parse({ ...SAMPLE, growth: -150 }).errors.length);
  assert.deepEqual(compute({}).errors.length > 0, true);
});

test("summary names the source to verify and the disclaimer", () => {
  const t = summaryText(run({}));
  assert.ok(t.includes(VERIFY));
  assert.match(t, /Not tax advice/);
});
