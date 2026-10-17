import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, summaryText, SAMPLE, VERIFY, position, parse } from "./calc.mjs";

const run = (extra = {}) => compute({ ...SAMPLE, ...extra });

test("a GBP 10,000 bonus on GBP 55,000 with a Plan 2 loan and no Child Benefit: 40% tax, 2% NI, 9% loan", () => {
  const r = run({ salary: 55000, bonus: 10000, pensionPct: 0, childBenefit: 0 });
  assert.equal(r.cashV.tax, 4000);
  assert.equal(r.cashV.ni, 200);
  assert.equal(r.cashV.loans, 900);
  assert.equal(r.cashV.kept, 4900);
  assert.equal(r.marginalCash, 51);
});

test("a bonus across GBP 100,000 loses personal allowance and is hit at an effective 71% on the last slice", () => {
  const r = run();
  // 85,000 -> 105,000: allowance 12,570 -> 10,070; tax rises 20,000*40% + 2,500*40%
  assert.equal(r.before.allowance, 12570);
  assert.equal(r.cash.allowance, 10070);
  assert.equal(r.cashV.tax, 9000);
  assert.equal(r.cashV.kept, 8800);
  assert.equal(r.marginalCash, 71);
  assert.ok(r.findings.some((f) => f.title.includes("withdrawn")));
});

test("sacrificing the slice over GBP 100,000 restores the full allowance and costs less take-home per pound in the pension", () => {
  const r = run({ pensionPct: 25 }); // 5,000 of 20,000
  assert.equal(r.sacAmount, 5000);
  assert.equal(r.salary + r.bonus - r.sacAmount, 100000);
  assert.equal(r.mixedV.allowance, 12570);
  // keeps 7,350: gives up 1,450 of take-home for 5,000 in the pension = 29p per pound
  assert.equal(r.mixedV.kept, 7350);
  assert.equal(r.toTaper, 5000);
});

test("High Income Child Benefit Charge is 1% per GBP 200 over GBP 60,000 and full at GBP 80,000", () => {
  const base = { pay: 0, region: "england", plan: "none", pgl: false, childBenefit: 2000 };
  assert.equal(position({ ...base, pay: 60000 }).hicbc, 0);
  assert.equal(position({ ...base, pay: 65000 }).hicbcPct, 25);
  assert.equal(position({ ...base, pay: 65000 }).hicbc, 500);
  assert.equal(position({ ...base, pay: 80000 }).hicbc, 2000);
  assert.equal(position({ ...base, pay: 90000 }).hicbc, 2000);
  assert.equal(position({ ...base, pay: 70000, childBenefit: 0 }).hicbc, 0);
});

test("Child Benefit charge appears in the bonus cost and sacrifice can cut it", () => {
  const r = run({ salary: 55000, bonus: 10000, pensionPct: 0, childBenefit: 1355, plan: "none" });
  assert.equal(r.cashV.hicbc, 338.75);
  const s = run({ salary: 55000, bonus: 10000, pensionPct: 50, childBenefit: 1355, plan: "none" });
  assert.equal(s.mixedV.hicbc, 0);
  assert.ok(r.findings.some((f) => f.title.includes("Child Benefit") && f.title.includes("cut the charge")));
});

test("when sacrifice cannot cut the Child Benefit charge the page does not promise it", () => {
  const r = run();
  const f = r.findings.find((x) => x.title.startsWith("Child Benefit"));
  assert.ok(f);
  assert.doesNotMatch(f.title, /cut the charge/);
});

test("Scottish taxpayers use the Scottish bands", () => {
  const e = run({ salary: 60000, bonus: 5000, plan: "none", childBenefit: 0, pensionPct: 0 });
  const s = run({ salary: 60000, bonus: 5000, plan: "none", childBenefit: 0, pensionPct: 0, region: "scotland" });
  assert.equal(e.cashV.tax, 2000);
  assert.equal(s.cashV.tax, 2100); // 42% above 75,000 - 12,570 taxable... bonus sits in Higher at 42%
  assert.equal(s.regionLabel, "Scotland");
});

test("the sweep runs 0 to 100 percent and in-hand falls as more goes to the pension", () => {
  const r = run();
  assert.deepEqual(r.sweep.map((s) => s.pct), [0, 25, 50, 75, 100]);
  assert.equal(r.sweep[0].kept, r.cashV.kept);
  assert.equal(r.sweep[4].sac, r.bonus);
  for (let i = 1; i < r.sweep.length; i++) assert.ok(r.sweep[i].kept <= r.sweep[i - 1].kept);
});

test("bad input is rejected with a message, never clamped", () => {
  for (const bad of [{ salary: "" }, { salary: -1 }, { bonus: 0 }, { bonus: "abc" }, { pensionPct: 101 }, { pensionPct: -5 }, { region: "wales" }, { plan: "9" }, { childBenefit: -1 }, { salary: 99999999 }]) {
    const r = run(bad);
    assert.ok(r.errors && r.errors.length, JSON.stringify(bad));
  }
  assert.equal(parse(undefined).errors.length, 2);
});

test("summary names the source, the disclaimer and the sacrifice split", () => {
  const t = summaryText(run());
  assert.ok(t.includes(VERIFY));
  assert.match(t, /Not tax advice\. No warranty\./);
  assert.match(t, /Share to pension/);
});

test("findings always say what is not modelled and obligations tell the reader to verify", () => {
  const r = run();
  assert.ok(r.findings.some((f) => f.title.startsWith("Not modelled")));
  assert.ok(r.obligations.some((o) => o.ref === "Verify"));
});
