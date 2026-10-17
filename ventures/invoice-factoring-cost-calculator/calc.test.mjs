import { test } from "node:test";
import assert from "node:assert/strict";
import { parseOffers, costOf, plan, sampleInput, toCsv } from "./calc.mjs";

test("stepped fee charges a whole period: 38 days at 3% per 30 is two periods", () => {
  const o = parseOffers("A, 90, 3, 30, 0, stepped").offers[0];
  const c = costOf(o, 8000, 38);
  assert.equal(c.periods, 2);
  assert.equal(c.factorFee, 480);
  assert.equal(c.advanced, 7200);
  assert.equal(c.rebate, 800 - 480);
  assert.equal(c.net, 7520);
});

test("daily fee is prorated and flat fee is added", () => {
  const o = parseOffers("B, 90, 0.1, 1, 10, daily").offers[0];
  const c = costOf(o, 8000, 38);
  assert.equal(c.factorFee, 304);
  assert.equal(c.cost, 314);
  assert.equal(c.pctOfInvoice, 3.93);
});

test("APR is cost over cash advanced, annualised", () => {
  const o = parseOffers("C, 100, 2, 30, 0, stepped").offers[0];
  const c = costOf(o, 1000, 30);
  assert.equal(c.cost, 20);
  assert.equal(c.apr, 24.33);
});

test("bad offers are reported", () => {
  assert.match(parseOffers("X, 0, 3, 30").errors[0], /advance/);
  assert.match(parseOffers("X, 90, 3, 0").errors[0], /period/);
  assert.match(parseOffers("X, 90, 3, 30, 0, weekly").errors[0], /mode/);
  assert.match(parseOffers("X, 90").errors[0], /need/);
  assert.match(parseOffers("X, 90, -1, 30").errors[0], /negative/);
});

test("plan ranks offers, flags negative rebate, compares to a credit line", () => {
  const r = plan(sampleInput());
  assert.equal(r.rows.length, 3);
  assert.ok(r.best.cost <= Math.min(...r.rows.map((x) => x.cost)));
  assert.ok(r.advice.some((a) => /borrowing the same/.test(a)));
  const hi = plan({ invoice: 1000, days: 90, offers: "Z, 95, 3, 30, 0, stepped" });
  assert.ok(hi.advice.some((a) => /exceed the reserve/.test(a)));
});

test("input validation", () => {
  assert.match(plan({ invoice: 0, days: 30, offers: "A, 90, 3, 30" }).error, /invoice/);
  assert.match(plan({ invoice: 100, days: 0, offers: "A, 90, 3, 30" }).error, /days/);
  assert.match(plan({ invoice: 100, days: 30, offers: "" }).error, /at least one/);
});

test("csv has a header and one row per offer", () => {
  const lines = toCsv(plan(sampleInput())).trim().split("\n");
  assert.equal(lines.length, 4);
});
