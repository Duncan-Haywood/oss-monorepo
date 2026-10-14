import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, summaryText, SAMPLE, VERIFY, parse, annual, taxOn, BANDS } from "./calc.mjs";

const run = (extra = {}) => compute({ ...SAMPLE, ...extra });

test("salary sacrifice matches hand-worked arithmetic on a GBP 55,000 salary at 8%", () => {
  // contribution 4,400. No pension: tax 9,432, NI 3,110.60, Plan 2 loan 2,387.70.
  const r = run();
  assert.equal(r.none.takeHome, 40069.7);
  const [sac, net, ras] = r.compare;
  // sacrifice: pay 50,600 -> tax 7,540 + 330 @40% = 7,672; NI 3,016 + 6.60; loan (50,600-28,470)*9%
  assert.equal(sac.tax, 7672);
  assert.equal(sac.ni, 3022.6);
  assert.equal(sac.sl, 1991.7);
  assert.equal(sac.costToYou, 2156);
  assert.equal(sac.intoPension, 4400);
  // net pay saves income tax only: 40% of 4,400 = 1,760 -> cost 2,640
  assert.equal(net.costToYou, 2640);
  assert.equal(net.ni, 3110.6);
  // relief at source costs the same here once the basic band is extended
  assert.equal(ras.tax, 8552);
  assert.equal(ras.costToYou, 2640);
  assert.equal(r.sacVsNet, 484);
  assert.equal(r.bestEmployee, "sacrifice");
});

test("employer NI saving is 15 percent of the sacrificed pay and the shared part is added to the pension", () => {
  const r = run({ employerShare: 50 });
  const sac = r.compare[0];
  assert.equal(sac.employerSaving, 660);
  assert.equal(sac.employerAdds, 330);
  assert.equal(sac.intoPension, 4730);
  assert.equal(r.compare[1].employerAdds, 0);
});

test("the 2029 cap treats sacrifice above GBP 2,000 as pay for National Insurance", () => {
  const off = run();
  const on = run({ cap2029: "yes" });
  // 2,400 above the cap is NI-able at 2% (the pay is above the upper limit)
  assert.equal(on.compare[0].ni - off.compare[0].ni, 48);
  assert.equal(on.compare[0].tax, off.compare[0].tax);
  assert.equal(on.compare[0].employerSaving, 300);
  assert.equal(off.capCost, 48);
  assert.ok(off.findings.some((f) => f.title.includes("April 2029")));
  assert.equal(on.capCost, 0);
});

test("a contribution under the cap is untouched by the 2029 rule", () => {
  const a = run({ pensionPct: 3 }); // 1,650
  const b = run({ pensionPct: 3, cap2029: "yes" });
  assert.equal(a.compare[0].ni, b.compare[0].ni);
});

test("pension contributions win back the personal allowance on GBP 110,000", () => {
  const r = compute({ salary: 110000, pensionPct: 15, region: "england" });
  assert.equal(r.none.allowance, 7570);
  assert.equal(r.compare[0].allowance, 12570);
  assert.equal(r.compare[0].costToYou, 7570);
  assert.ok(r.findings.some((f) => f.title.includes("win back allowance")));
});

test("Scottish taxpayers use the Scottish bands", () => {
  const e = compute({ salary: 50000, pensionPct: 5, region: "england" });
  const s = compute({ salary: 50000, pensionPct: 5, region: "scotland" });
  assert.ok(s.compare[0].tax > e.compare[0].tax);
  assert.equal(taxOn(37430, BANDS.scotland).tax, 8982.05);
});

test("below the personal allowance a sacrifice saves no income tax", () => {
  const r = compute({ salary: 14000, pensionPct: 20, region: "england" });
  assert.ok(r.findings.some((f) => f.title.includes("below the personal allowance")));
});

test("student loan falls with salary sacrifice but not with net pay", () => {
  const r = run();
  assert.ok(r.compare[0].sl < r.none.sl);
  assert.equal(r.compare[1].sl, r.none.sl);
});

test("bad input is rejected with a message, never clamped", () => {
  assert.ok(compute({ ...SAMPLE, salary: "" }).errors.length);
  assert.ok(compute({ ...SAMPLE, salary: -5 }).errors.length);
  assert.ok(compute({ ...SAMPLE, salary: 2e7 }).errors.length);
  assert.ok(compute({ ...SAMPLE, pensionPct: 0 }).errors.length);
  assert.ok(compute({ ...SAMPLE, pensionPct: 101 }).errors.length);
  assert.ok(compute({ ...SAMPLE, region: "mars" }).errors.length);
  assert.ok(compute({ ...SAMPLE, plan: "9" }).errors.length);
  assert.ok(compute({ ...SAMPLE, employerShare: 150 }).errors.length);
  assert.ok(compute(undefined).errors.length);
  assert.equal(parse(SAMPLE).errors.length, 0);
});

test("annual is deterministic and take-home is gross minus deductions", () => {
  const a = annual({ salary: 40000, contrib: 2000, method: "sacrifice", region: "england", plan: "none", pgl: false, cap2029: false, share: 0 });
  assert.equal(a.takeHome, 40000 - a.tax - a.ni - a.sl - a.pg - a.fromPay);
});

test("summary names the source, the disclaimer and every method", () => {
  const s = summaryText(run());
  assert.match(s, /Salary sacrifice/);
  assert.match(s, /Net pay arrangement/);
  assert.match(s, /Relief at source/);
  assert.ok(s.includes(VERIFY));
  assert.match(s, /Not tax advice/);
});
