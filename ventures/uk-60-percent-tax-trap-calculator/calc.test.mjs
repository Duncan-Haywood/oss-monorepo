import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, position, marginalRate, allowanceFor, summaryText, SAMPLE, VERIFY, parse } from "./calc.mjs";

const run = (o) => compute({ ...SAMPLE, ...o });

test("allowance taper: full to 100k, 1 per 2 above, gone at 125,140", () => {
  assert.equal(allowanceFor(100000), 12570);
  assert.equal(allowanceFor(110000), 7570);
  assert.equal(allowanceFor(125140), 0);
  assert.equal(allowanceFor(200000), 0);
});

test("sample: GBP 110,000 employee tax, NI and take-home", () => {
  const r = run({});
  assert.equal(r.base.allowance, 7570);
  assert.equal(r.base.incomeTax, 33432);
  assert.equal(r.base.ni, 4210.6);
  assert.equal(r.base.takeHome, 72357.4);
  assert.equal(r.lostAllowance, 5000);
});

test("marginal rate is 62% in the trap for an employee, 60% below NI relevance, 47% above the trap", () => {
  assert.equal(marginalRate(110000, 0, "ras", "employee"), 0.62);
  assert.equal(marginalRate(110000, 0, "ras", "selfemployed"), 0.62);
  assert.equal(marginalRate(60000, 0, "ras", "employee"), 0.42);
  assert.equal(marginalRate(130000, 0, "ras", "employee"), 0.47);
  assert.equal(marginalRate(30000, 0, "ras", "employee"), 0.28);
  assert.equal(marginalRate(5000, 0, "ras", "employee"), 0);
});

test("restoring the allowance by relief-at-source pension costs 40p per pound", () => {
  const r = run({});
  assert.equal(r.fix.gross, 10000);
  assert.equal(r.fix.netCost, 4000);
  assert.equal(r.fix.costPerPound, 0.4);
  assert.equal(r.fix.allowance, 12570);
});

test("salary sacrifice also saves NI, so it is cheaper than relief at source", () => {
  const r = run({ method: "sacrifice" });
  assert.equal(r.fix.netCost, 3800);
  assert.equal(r.fix.costPerPound, 0.38);
});

test("user contribution lowers adjusted net income and take-home changes by the cost", () => {
  const r = run({ pension: 5000 });
  assert.equal(r.now.ani, 105000);
  assert.equal(r.now.allowance, 10070);
  assert.equal(r.pensionCost, r2(r.base.takeHome - r.now.takeHome));
  assert.ok(r.pensionCost / 5000 < 0.45);
});
function r2(n) { return Math.round(n * 100) / 100; }

test("below 100k there is no trap and no fix", () => {
  const r = run({ income: 80000 });
  assert.equal(r.fix, null);
  assert.equal(r.lostAllowance, 0);
  assert.ok(r.findings[0].title.includes("not in the 60% trap"));
});

test("above 125,140 the allowance is gone but a contribution can still restore it", () => {
  const r = run({ income: 140000 });
  assert.equal(r.base.allowance, 0);
  assert.equal(r.fix.gross, 40000);
  assert.equal(r.fix.allowance, 12570);
  assert.ok(r.fix.costPerPound < 0.5);
});

test("over the annual allowance is flagged", () => {
  const r = run({ income: 180000 });
  assert.equal(r.fix.overAllowance, true);
  assert.ok(r.findings.some((f) => f.title.includes("annual allowance")));
});

test("bad input is rejected, never clamped", () => {
  assert.ok(compute({ ...SAMPLE, income: "" }).errors.length);
  assert.ok(compute({ ...SAMPLE, income: -1 }).errors.length);
  assert.ok(compute({ ...SAMPLE, pension: 200000 }).errors[0].includes("more than your income"));
  assert.ok(compute({ ...SAMPLE, year: 1999 }).errors.length);
  assert.ok(compute({ ...SAMPLE, type: "x" }).errors.length);
  assert.ok(parse(undefined).errors.length);
});

test("summary names the source and carries the disclaimer", () => {
  const t = summaryText(run({}));
  assert.ok(t.includes(VERIFY));
  assert.ok(t.includes("Not tax advice"));
  assert.ok(t.includes("62%"));
});

test("position never lets take-home go up when income goes up", () => {
  let prev = -1;
  for (let g = 90000; g <= 140000; g += 1000) { const t = position(g, 0, "ras", "employee").takeHome; assert.ok(t > prev); prev = t; }
});
