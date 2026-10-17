import { test } from "node:test";
import assert from "node:assert/strict";
import { parseProcessors, costOf, plan, sampleInput, toCsv } from "./calc.mjs";

const flat = { name: "F", inPct: 2.9, inFix: 0.3, onPct: 2.9, onFix: 0.3, monthly: 0, dispute: 15, keepsRefundFee: true };

test("2.9% + 30c on a $5 sale is 8.9% and on a $100 sale 3.2%", () => {
  const base = { volume: 10000, onlineShare: 0, refundRate: 0, disputes: 0 };
  assert.equal(costOf(flat, { ...base, ticket: 5 }).effective, 8.9);
  assert.equal(costOf(flat, { ...base, ticket: 100 }).effective, 3.2);
});

test("monthly and dispute fees are added once", () => {
  const p = { ...flat, monthly: 25 };
  const c = costOf(p, { volume: 1000, ticket: 100, onlineShare: 0, refundRate: 0, disputes: 2 });
  assert.equal(c.percentFees, 29);
  assert.equal(c.fixedFees, 3);
  assert.equal(c.disputeFees, 30);
  assert.equal(c.total, 87);
});

test("returning the fee on refunds lowers the bill, keeping it does not", () => {
  const s = { volume: 1000, ticket: 100, onlineShare: 0, refundRate: 0.1, disputes: 0 };
  assert.equal(costOf(flat, s).total, 32);
  assert.equal(costOf({ ...flat, keepsRefundFee: false }, s).total, 28.8);
});

test("online share moves volume to the online rate", () => {
  const p = { name: "x", inPct: 1, inFix: 0, onPct: 3, onFix: 0, monthly: 0, dispute: 0, keepsRefundFee: true };
  const c = costOf(p, { volume: 1000, ticket: 10, onlineShare: 0.5, refundRate: 0, disputes: 0 });
  assert.equal(c.total, 20);
});

test("parser rejects bad lines and accepts comments", () => {
  assert.match(parseProcessors("only a name").errors[0], /need/);
  assert.match(parseProcessors("a,35,0.3,29,0.3").errors[0], /typo/);
  assert.match(parseProcessors("a,2.9,0.3,2.9,0.3,0,0,maybe").errors[0], /keeps or returns/);
  assert.match(parseProcessors("a,-1,0.3,2.9,0.3").errors[0], /negative/);
  assert.equal(parseProcessors("# note\na,2.9,0.3,2.9,0.3").processors.length, 1);
});

test("plan validates inputs and ranks cheapest first", () => {
  assert.match(plan({ ...sampleInput(), volume: 0 }).error, /sales/);
  assert.match(plan({ ...sampleInput(), onlinePct: 120 }).error, /Online/);
  assert.match(plan({ ...sampleInput(), processors: "" }).error, /Add at least one/);
  const r = plan(sampleInput());
  assert.equal(r.rows.length, 3);
  assert.ok(r.rows.every((x) => x.total >= r.best.total));
  assert.equal(r.sensitivity.length, 6);
});

test("small tickets favour no-fixed-fee quotes, large tickets favour low percentage", () => {
  const r = plan({ ...sampleInput(), processors: "Fixed, 2.9, 0.30, 2.9, 0.30, 0, 0, keeps\nLow, 3.4, 0, 3.4, 0, 0, 0, keeps" });
  const at = (t) => r.sensitivity.find((s) => s.ticket === t).rates;
  assert.ok(at(5)[1].effective < at(5)[0].effective);
  assert.ok(at(1000)[0].effective < at(1000)[1].effective);
});

test("csv has a header and one row per processor", () => {
  const lines = toCsv(plan(sampleInput())).trim().split("\n");
  assert.equal(lines.length, 4);
});
