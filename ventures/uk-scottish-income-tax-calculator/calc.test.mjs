import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, summaryText, SAMPLE, VERIFY, parse, annual, taxOn, SCOT_BANDS } from "./calc.mjs";

const plain = (salary, extra = {}) => compute({ salary, pensionPct: 0, method: "none", plan: "none", pgl: "no", ...extra });

test("Scottish tax matches hand-worked band arithmetic", () => {
  // 30,000: taxable 17,430 = 3,967 @19% + 12,989 @20% + 474 @21%
  assert.equal(plain(30000).tax, 3451.07);
  // 50,000: taxable 37,430 adds 14,136 @21% and 6,338 @42%
  assert.equal(plain(50000).tax, 8982.05);
  // 150,000: no allowance, every band used including 48% top
  assert.equal(plain(150000).tax, 59634.35);
});

test("below the personal allowance nothing is taxed", () => {
  const a = plain(12000);
  assert.equal(a.tax, 0);
  assert.equal(a.takeHome, 12000);
});

test("Scotland pays less than the rest of the UK on a middle income and more on a high one", () => {
  const mid = plain(30000);
  assert.equal(mid.rukTax, 3486);
  assert.equal(mid.taxDiff, -34.93);
  const high = plain(50000);
  assert.equal(high.rukTax, 7486);
  assert.equal(high.taxDiff, 1496.05);
  assert.ok(high.findings.some((f) => f.title.includes("less income tax")));
  assert.ok(mid.findings.some((f) => f.title.includes("a year more income tax")));
});

test("allowance taper gives a 67.5% income tax slice plus NI", () => {
  const r = plain(110000);
  assert.equal(r.allowance, 7570);
  assert.equal(r.marginal, 69.5);
  assert.ok(r.findings.some((f) => f.severity === "high" && f.title.includes("67.5%")));
});

test("top rate finding appears above 125,140", () => {
  assert.ok(plain(130000).findings.some((f) => f.title.includes("48% top rate")));
  assert.ok(!plain(100000).findings.some((f) => f.title.includes("48% top rate")));
});

test("National Insurance is the same as elsewhere in the UK", () => {
  assert.equal(plain(30000).ni, 1394.4);
  assert.equal(plain(60000).ni, 3210.6);
});

test("salary sacrifice lowers tax and NI; net pay lowers tax only", () => {
  const none = plain(45000);
  const sac = plain(45000, { pensionPct: 5, method: "sacrifice" });
  const net = plain(45000, { pensionPct: 5, method: "netpay" });
  assert.ok(sac.tax < none.tax && sac.ni < none.ni);
  assert.ok(net.tax < none.tax && net.ni === none.ni);
  assert.ok(sac.takeHome > net.takeHome);
});

test("relief at source extends the Scottish bands by the gross contribution", () => {
  const r = annual(60000, 10, "ras", "none", false);
  assert.equal(r.contrib, 6000);
  assert.equal(r.pensionFromPay, 4800);
  const noExt = taxOn(r.taxable, SCOT_BANDS).tax;
  assert.ok(r.tax < noExt);
});

test("a pension percentage with no method changes nothing", () => {
  assert.equal(plain(40000, { pensionPct: 10, method: "none" }).takeHome, plain(40000).takeHome);
});

test("student loan Plan 4 and postgraduate loan", () => {
  assert.equal(plain(40000, { plan: "4" }).sl, 652.95);
  assert.equal(plain(40000, { pgl: "yes" }).pg, 1140);
  assert.equal(plain(20000, { plan: "4" }).sl, 0);
});

test("bad input is rejected, not clamped", () => {
  assert.ok(parse({}).errors.length);
  assert.ok(parse({ salary: -1 }).errors.length);
  assert.ok(parse({ salary: 1e9 }).errors.length);
  assert.ok(parse({ salary: 3e4, pensionPct: 120 }).errors.length);
  assert.ok(parse({ salary: 3e4, method: "x" }).errors.length);
  assert.ok(parse({ salary: 3e4, plan: "9" }).errors.length);
  assert.deepEqual(compute({ salary: "abc" }).errors.length, 1);
});

test("band table is continuous and increasing", () => {
  let prev = 0;
  for (const b of SCOT_BANDS) { assert.ok(b.upTo > prev); prev = b.upTo; }
  assert.equal(SCOT_BANDS[0].upTo, 3967);
});

test("summary names the source, the comparison and the disclaimer", () => {
  const s = summaryText(compute(SAMPLE));
  assert.ok(s.includes(VERIFY));
  assert.match(s, /rest of the UK/);
  assert.match(s, /Not tax advice\. No warranty\./);
  assert.match(s, /Starter rate 19%/);
});
