import { test } from "node:test";
import assert from "node:assert/strict";
import { normalize, margin, schedule, keepValue, offerValue, holdbackFactor, breakEvenMultiple, keepOvertakesYear, analyze, reportCsv, sampleBook } from "./calc.mjs";

const book = (o) => normalize({ revenue: 100000, retention: 90, payout: 0, servicing: 20, rate: 10, years: 10, offer: 0, upfront: 100, holdback: 12, required: 90, costs: 0, ...o }).p;
const near = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) < e, `${a} vs ${b}`);

test("margin is what is left after payout and servicing", () => {
  near(margin(book({ payout: 30, servicing: 20 })), 0.5);
});

test("keep value equals the sum of discounted yearly cash", () => {
  const p = book({});
  const sum = schedule(p).reduce((s, r) => s + r.pv, 0);
  near(keepValue(p), sum, 1e-4);
});

test("year one revenue already applies one renewal cycle", () => {
  const p = book({});
  near(schedule(p)[0].revenue, 90000);
  near(schedule(p)[1].revenue, 81000);
});

test("hand calculation: one year, no attrition cost, 10% rate", () => {
  const p = book({ years: 1, retention: 100, servicing: 0, rate: 10 });
  near(keepValue(p), 100000 / 1.1, 1e-6);
});

test("rate equal to retention growth does not divide by zero", () => {
  const p = book({ retention: 110, rate: 10, servicing: 0, years: 5 });
  near(keepValue(p), 100000 * 5, 1e-4);
});

test("all-cash offer with no costs is multiple times revenue", () => {
  near(offerValue(book({ offer: 2 })), 200000);
});

test("costs reduce the price and the holdback is discounted and scaled", () => {
  const p = book({ offer: 2, upfront: 50, holdback: 12, costs: 5, retention: 81, required: 90, rate: 10 });
  near(holdbackFactor(p), 0.9);
  near(offerValue(p), 100000 + (100000 * 0.9) / 1.1 - 10000, 1e-6);
});

test("holdback is never paid above 100%", () => {
  near(holdbackFactor(book({ retention: 99, required: 90 })), 1);
});

test("break-even multiple makes the offer equal keeping", () => {
  const p = book({ upfront: 60, costs: 4, retention: 85, required: 90 });
  const be = breakEvenMultiple(p);
  near(offerValue(p, be), keepValue(p), 1e-4);
});

test("keep overtakes the offer in the year the running value passes it", () => {
  const p = book({});
  const sell = 300000;
  const y = keepOvertakesYear(p, sell);
  assert.ok(schedule(p)[y - 1].cumPv >= sell);
  assert.ok(y === 1 || schedule(p)[y - 2].cumPv < sell);
  assert.equal(keepOvertakesYear(p, 1e12), null);
});

test("better retention is always worth more", () => {
  assert.ok(keepValue(book({ retention: 95 })) > keepValue(book({ retention: 90 })));
  const r = analyze({ revenue: 100000, retention: 90, servicing: 20, rate: 10, years: 10 });
  assert.ok(r.onePoint > 0);
});

test("validation names the field", () => {
  assert.match(analyze({ revenue: "" }).error, /revenue/);
  assert.match(analyze({ revenue: 1, payout: 60, servicing: 50 }).error, /margin/);
  assert.match(analyze({ revenue: 1, years: 2.5 }).error, /Horizon/);
  assert.match(analyze({ revenue: 1, offer: 11 }).error, /Offer multiple/);
});

test("sample book analyzes, finds a sensitivity row for the user's retention, and exports CSV", () => {
  const r = analyze(sampleBook());
  assert.ok(!r.error);
  assert.ok(r.sens.some((x) => x.isYours));
  assert.ok(r.findings.length >= 3);
  const csv = reportCsv(r);
  assert.match(csv, /^year,revenue/);
  assert.match(csv, /keep_value/);
  assert.match(csv, /offer_value_after_costs/);
});

test("no offer means no sell value and a tie price finding", () => {
  const r = analyze({ revenue: 100000, retention: 90, servicing: 20, rate: 10, years: 10 });
  assert.equal(r.sell, null);
  assert.ok(r.findings.some((f) => /Break-even price/.test(f.title)));
});
