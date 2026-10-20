import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, summaryText, SAMPLE, VERIFY, parse, chargePercent } from "./calc.mjs";

const run = (o) => compute({ ...SAMPLE, ...o });

test("charge percentage: nil at 60,000, 1% per 200, whole percents, 100% at 80,000", () => {
  assert.equal(chargePercent(60000), 0);
  assert.equal(chargePercent(60199), 0);
  assert.equal(chargePercent(60200), 1);
  assert.equal(chargePercent(68000), 40);
  assert.equal(chargePercent(79999), 99);
  assert.equal(chargePercent(80000), 100);
  assert.equal(chargePercent(200000), 100);
});

test("sample: two children, 52 weeks, 40% of 2,251.60 benefit", () => {
  const r = run({});
  assert.equal(r.weekly, 43.3);
  assert.equal(r.benefit, 2251.6);
  assert.equal(r.pct, 40);
  assert.equal(r.charge, 900.64);
  assert.equal(r.net, 1350.96);
  assert.equal(r.deadlines.returnAndPay, "2027-01-31");
});

test("pension and Gift Aid are grossed up by 1.25 and cut adjusted net income", () => {
  const r = run({ pension: 4000, giftAid: 800 });
  assert.equal(r.grossPension, 5000);
  assert.equal(r.grossGift, 1000);
  assert.equal(r.ani, 62000);
  assert.equal(r.pct, 10);
});

test("a pension contribution that lands exactly on 60,000 removes the charge", () => {
  const r = run({ pension: 6400 }); // 8,000 gross
  assert.equal(r.ani, 60000);
  assert.equal(r.outcome, "none");
  assert.equal(r.charge, 0);
});

test("full charge cancels the benefit and says keep claiming", () => {
  const r = run({ income: 90000 });
  assert.equal(r.outcome, "full");
  assert.equal(r.net, 0);
  assert.ok(r.obligations.some((o) => /Keep claiming/.test(o.title)));
});

test("avoid-the-charge advice quotes the net pension payment needed", () => {
  const r = run({});
  const f = r.findings.find((x) => /To avoid the charge/.test(x.title));
  assert.match(f.title, /GBP 8,000/); // 8,000 off ANI
  assert.match(f.title, /GBP 6,400/); // paid net
});

test("bad input is rejected, never clamped", () => {
  assert.ok(parse({ ...SAMPLE, income: "" }).errors.length);
  assert.ok(parse({ ...SAMPLE, children: 0 }).errors.length);
  assert.ok(parse({ ...SAMPLE, children: 1.5 }).errors.length);
  assert.ok(parse({ ...SAMPLE, income: -1 }).errors.length);
  assert.ok(parse({ ...SAMPLE, year: 2019 }).errors.length);
  assert.ok(parse({ ...SAMPLE, weeks: 60 }).errors.length);
  assert.ok(compute({}).errors.length > 0);
});

test("summary names the source and the disclaimer", () => {
  const t = summaryText(run({}));
  assert.ok(t.includes(VERIFY));
  assert.match(t, /Not tax advice/);
});

test("income just under the line warns how close it is; far under does not", () => {
  const near = run({ income: 59500 });
  assert.ok(near.findings.some((f) => f.severity === "medium" && /within GBP 500 of the GBP 60,000 line/.test(f.title)));
  const far = run({ income: 50000 });
  assert.ok(!far.findings.some((f) => f.severity === "medium"));
});

test("ANI between 60,000 and the first 1% step is not described as 'at or under' 60,000", () => {
  const r = run({ income: 60100 });
  assert.equal(r.pct, 0);
  assert.equal(r.charge, 0);
  assert.doesNotMatch(r.findings[0].title, /at or under/);
  assert.match(r.findings[0].title, /first 1% step/);
  assert.match(run({ income: 60000 }).findings[0].title, /at or under/);
});
