import test from "node:test";
import assert from "node:assert/strict";
import { adPlan } from "./adspend.mjs";

const base = { profit: 20, orderValue: 50, cpc: 0.8, conversionPct: 2 };

test("cac and roas by hand: 0.80 / 2% = 40 per customer, 50 / 40 = 1.25", () => {
  const r = adPlan(base);
  assert.equal(r.cac, 40); assert.equal(r.roas, 1.25);
  assert.equal(r.verdict, "loses money");
  assert.equal(r.firstOrderResultPerCustomer, -20);
});

test("break-even roas is order value over profit: 50 / 20 = 2.5, and it equals the roas at the break-even cac", () => {
  const r = adPlan(base);
  assert.equal(r.breakEvenRoasFirstOrder, 2.5);
  assert.equal(r.maxCacFirstOrder, 20);
  assert.equal(r.maxCpcFirstOrder, 0.4);          // 20 * 2%
  assert.equal(r.minConversionPctFirstOrder, 4);  // 0.80 / 20
  assert.equal(adPlan({ ...base, cpc: 0.4 }).verdict, "pays on the first order");
});

test("repeat orders move the ceiling: 1 repeat doubles it, so a 40 customer breaks even", () => {
  const r = adPlan({ ...base, repeat: 1 });
  assert.equal(r.maxCacWithRepeat, 40);
  assert.equal(r.verdict, "pays only with repeat orders");
  assert.equal(r.yearResultPerCustomer, 0);
  assert.ok(r.notes.some(n => n.includes("20")));
});

test("budget: 1000 at 40 per customer buys 25 customers; year result 25 * (life - cac)", () => {
  const r = adPlan({ ...base, repeat: 1.5, budget: 1000 });
  assert.equal(r.budget.customers, 25);
  assert.equal(r.budget.revenue, 1250);
  assert.equal(r.budget.firstOrderResult, -500);   // 25 * (20 - 40)
  assert.equal(r.budget.yearResult, 250);          // 25 * (50 - 40)
});

test("no profit before ads: no ad spend can pay back", () => {
  const r = adPlan({ ...base, profit: -3, repeat: 5 });
  assert.equal(r.verdict, "no"); assert.equal(r.breakEvenRoasFirstOrder, null);
  assert.equal(r.maxCacWithRepeat, 0); assert.ok(r.notes.length);
});

test("sensitivity: better conversion lowers cac", () => {
  const s = adPlan({ ...base, repeat: 1 }).sensitivity;
  assert.ok(s[0].cac > s[1].cac && s[1].cac > s[2].cac);
});

test("bad input gives an error, not a number", () => {
  assert.ok(adPlan({ ...base, conversionPct: 0 }).error);
  assert.ok(adPlan({ ...base, cpc: NaN }).error);
  assert.ok(adPlan(null).error);
});
