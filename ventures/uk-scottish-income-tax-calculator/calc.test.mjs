import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, summaryText, SAMPLE, VERIFY, parse, annual, taxOn, SCOT_BANDS, PLANS } from "./calc.mjs";

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
  // Finance Act 2004 s.192(4A): the basic rate limit and those above it widen, the 19% starter band does not.
  // No extension: 753.73 + 2,597.80 + 2,968.56 + 6,861.96 = 13,182.05. Relief above 20%: 6,000 x (42% - 20%) = 1,320.
  assert.equal(noExt, 13182.05);
  assert.equal(r.tax, 11862.05);
  // GBP 30,000 at 5%: GBP 474 sits at 21%, so the extension is worth 1% of 474, not 1% of the 1,500 contribution as well.
  assert.equal(annual(30000, 5, "ras", "none", false).tax, 3446.33);
  assert.equal(r.parts[0].amount, 3967);
});

test("relief at source reduces adjusted net income for the allowance taper", () => {
  // 110,000 with 10% RAS: adjusted net income 99,000, so the full allowance is kept.
  assert.equal(annual(110000, 10, "ras", "none", false).allowance, 12570);
  assert.equal(annual(110000, 0, "none", "none", false).allowance, 7570);
});

test("student loan is charged on pay after salary sacrifice, not on gross", () => {
  // 40,000 with 10% sacrifice on Plan 4: (36,000 - 33,795) x 9% = 198.45; net pay leaves NI pay, so (40,000 - 33,795) x 9% = 558.45.
  assert.equal(annual(40000, 10, "sacrifice", "4", false).sl, 198.45);
  assert.equal(annual(40000, 10, "netpay", "4", false).sl, 558.45);
});

test("the marginal rate keeps the user's pension, so a sacrifice below the taper is not shown 69.5%", () => {
  // 110,000 with 10% sacrifice: adjusted net 99,000; the next 1,000 reaches 100,000 at 45% tax + 2% NI.
  const r = compute({ salary: 110000, pensionPct: 10, method: "sacrifice", plan: "none", pgl: "no" });
  assert.equal(r.marginal, 47);
  assert.ok(!r.findings.some((f) => f.severity === "high" && f.title.includes("1,000 more")));
  assert.equal(plain(110000).marginal, 69.5);
});

test("the top-rate finding follows taxable income in the top band, not gross salary", () => {
  // 130,000 with 10% sacrifice: adjusted net 117,000, allowance 4,070, taxable 112,930: no income at 48%.
  const r = compute({ salary: 130000, pensionPct: 10, method: "sacrifice", plan: "none", pgl: "no" });
  assert.ok(!r.findings.some((f) => f.title.includes("48% top rate")));
  // 150,000 with no pension: taxable 150,000, of which 24,860 is above 125,140.
  assert.ok(plain(150000).findings.some((f) => f.title.includes("GBP 24,860") && f.title.includes("no personal allowance")));
});

test("the same pension three ways: net pay and relief at source cost the same, sacrifice also saves NI", () => {
  const c = compute(SAMPLE).compare;
  assert.deepEqual(c.map((x) => x.method), ["sacrifice", "netpay", "ras"]);
  assert.ok(c.every((x) => x.intoPension === 2250));
  // 45,000, 2,250 into the pension: 1,338 relieved at 42% and 912 at 21% = 753.48 of tax relief.
  assert.equal(c[1].costToYou, 1496.52);
  assert.equal(c[2].costToYou, 1496.52);
  // Sacrifice also saves 8% NI on 2,250 = 180, plus the Plan 4 loan at 9% on 2,250 = 202.50.
  assert.equal(c[0].costToYou, 1114.02);
  assert.deepEqual(plain(45000).compare, []);
});

test("the Scotland-cheaper crossover is about 33,500, as the page says", () => {
  assert.ok(plain(33493).taxDiff <= 0);
  assert.ok(plain(33495).taxDiff > 0);
});

test("a pension percentage with no method changes nothing", () => {
  assert.equal(plain(40000, { pensionPct: 10, method: "none" }).takeHome, plain(40000).takeHome);
});

test("student loan Plan 4 and postgraduate loan", () => {
  assert.equal(plain(40000, { plan: "4" }).sl, 558.45); // (40,000 - 33,795) x 9%, 2026/27
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

test("student loan thresholds are the 2026/27 figures (GOV.UK, Rates and thresholds for employers 2026 to 2027)", () => {
  assert.equal(PLANS[1].threshold, 26900);
  assert.equal(PLANS[2].threshold, 29385);
  assert.equal(PLANS[4].threshold, 33795);
  assert.equal(PLANS[5].threshold, 25000);
  // GBP 45,000 with 5% salary sacrifice on Plan 4: (42,750 - 33,795) x 9% = 805.95
  const r = compute({ salary: 45000, pensionPct: 5, method: "sacrifice", plan: "4", pgl: "no" });
  assert.equal(Math.round(r.sl * 100) / 100, 805.95);
});
