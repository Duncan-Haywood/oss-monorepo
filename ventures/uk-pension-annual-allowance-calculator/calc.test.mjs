import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, summaryText, SAMPLE, VERIFY, parse, annualAllowance, dbInputAmount, excessCharge, taperTable } from "./calc.mjs";

const run = (o) => compute({ ...SAMPLE, ...o });
const near = (a, b, d = 0.01) => assert.ok(Math.abs(a - b) <= d, `${a} vs ${b}`);

test("allowance is 60,000 unless BOTH income tests are failed", () => {
  assert.equal(annualAllowance(150000, 500000), 60000); // threshold income under 200k: no taper at any adjusted income
  assert.equal(annualAllowance(250000, 260000), 60000);
  assert.equal(annualAllowance(250000, 300000), 40000);
  assert.equal(annualAllowance(250000, 359999), 10001);
  assert.equal(annualAllowance(250000, 360000), 10000);
  assert.equal(annualAllowance(250000, 900000), 10000);
});

test("defined benefit input is 16 times the rise over a revalued opening figure", () => {
  near(dbInputAmount(20000, 22000, 3.8), 16 * (22000 - 20000 * 1.038));
  assert.equal(dbInputAmount(20000, 20000, 3.8), 0);
});

test("excess charge is taxed on top at the marginal rate", () => {
  near(excessCharge(275000, 32500), 14625); // all additional rate
  near(excessCharge(50270, 10000), 4000); // starts at the top of the basic band
  // base 40,000 -> taxable 27,430; 10,270 left in the basic band at 20%, then 9,730 at 40%
  near(excessCharge(40000, 20000), 10270 * 0.2 + 9730 * 0.4);
  assert.equal(excessCharge(100000, 0), 0);
});

test("sample: tapered to 12,500, carry forward 35,000, charge on the rest", () => {
  const r = run({});
  assert.equal(r.threshold, 275000);
  assert.equal(r.adjusted, 355000);
  assert.equal(r.aa, 12500);
  assert.equal(r.tapered, true);
  assert.equal(r.used, 80000);
  assert.equal(r.carryAvailable, 35000);
  assert.equal(r.excess, 67500);
  assert.equal(r.chargeable, 32500);
  near(r.charge, 14625);
  assert.deepEqual(r.applied.map((a) => a.used), [10000, 15000, 10000]);
});

test("carry forward uses the oldest year first and only years you were a member", () => {
  const r = run({ dbInput: 0, dbOwn: 0, income: 100000, employer: 70000, used1: "", used2: 40000, used3: 55000 });
  assert.equal(r.aa, 60000);
  assert.equal(r.excess, 10000);
  assert.equal(r.carryAvailable, 25000); // 2022/23 blank -> none
  assert.equal(r.chargeable, 0);
  assert.equal(r.applied[1].used, 10000);
  assert.match(r.findings.map((f) => f.title).join(" "), /2022\/23 blank/);
});

test("own contributions lower threshold income but not adjusted income; salary sacrifice does not lower threshold income", () => {
  const a = run({ dbInput: 0, dbOwn: 0, income: 210000, own: 20000, used1: 0, used2: 0, used3: 0 });
  assert.equal(a.threshold, 190000);
  assert.equal(a.aa, 60000); // under 200k threshold income: no taper
  const b = run({ dbInput: 0, dbOwn: 0, income: 270000, sacrificed: 20000, used1: 0, used2: 0, used3: 0 });
  assert.equal(b.threshold, 270000);
  assert.equal(b.adjusted, 290000);
  assert.equal(b.aa, 45000);
});

test("employer money shrinks the allowance: safe extra employer amount is below plain headroom", () => {
  const r = run({ dbInput: 0, dbOwn: 0, income: 300000, employer: 10000, used1: "", used2: "", used3: "" });
  assert.equal(r.aa, annualAllowance(300000, 310000));
  assert.ok(r.headroom > r.moreEmployer);
  const again = compute({ ...SAMPLE, dbInput: 0, dbOwn: 0, income: 300000, employer: 10000 + r.moreEmployer, used1: "", used2: "", used3: "" });
  assert.equal(again.excess <= 1, true);
});

test("money purchase allowance: 10,000 and no carry forward", () => {
  const r = run({ mpaa: "yes", dbInput: 0, dbOwn: 0, own: 15000, income: 90000 });
  assert.equal(r.aa, 10000);
  assert.equal(r.carryAvailable, 0);
  assert.equal(r.chargeable, 5000);
  assert.ok(r.charge > 0);
  assert.ok(parse({ ...SAMPLE, mpaa: "yes" }).errors.length); // MPAA with DB input is refused
});

test("within allowance: no charge and headroom reported", () => {
  const r = run({ dbInput: 0, dbOwn: 0, income: 90000, own: 20000 });
  assert.equal(r.charge, 0);
  assert.equal(r.excess, 0);
  assert.equal(r.headroom, 40000 + r.carryAvailable);
});

test("bad input is rejected, never clamped", () => {
  assert.ok(parse({ ...SAMPLE, income: "" }).errors.length);
  assert.ok(parse({ ...SAMPLE, income: -1 }).errors.length);
  assert.ok(parse({ ...SAMPLE, year: 1999 }).errors.length);
  assert.ok(parse({ ...SAMPLE, dbOwn: 90000 }).errors.length);
  assert.ok(parse({ ...SAMPLE, income: 5000, own: 6000, dbInput: 0, dbOwn: 0 }).errors.length);
  assert.ok(compute({}).errors.length > 0);
});

test("taper table falls from 60,000 to 10,000", () => {
  const t = taperTable();
  assert.equal(t[0].aa, 60000);
  assert.equal(t[t.length - 1].aa, 10000);
});

test("summary names the source and the disclaimer", () => {
  const t = summaryText(run({}));
  assert.ok(t.includes(VERIFY));
  assert.match(t, /Not tax advice/);
});
