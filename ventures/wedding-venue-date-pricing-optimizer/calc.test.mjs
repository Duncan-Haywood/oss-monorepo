import test from "node:test";
import assert from "node:assert/strict";
import { EXAMPLE_TYPES, cleanTypes, demand, contribution, bestPrice, analyze, toCsv, num } from "./calc.mjs";

const one = (o) => cleanTypes([{ name: "x", dates: 50, price: 1000, booked: 30, turnedAway: 0, cost: 300, elasticity: 2, ...o }])[0];

test("num parses money text and falls back", () => {
  assert.equal(num("$1,250"), 1250);
  assert.equal(num("abc", 7), 7);
});

test("rows without dates or price are dropped; bookings capped at dates", () => {
  assert.equal(cleanTypes([{ dates: 0, price: 5 }, { dates: 5, price: 0 }]).length, 0);
  assert.equal(one({ booked: 999 }).booked, 50);
});

test("demand follows the curve and is capped by the calendar", () => {
  const t = one({});
  assert.ok(Math.abs(demand(t, 1000) - 30) < 1e-9);
  assert.ok(Math.abs(demand(t, 2000) - 7.5) < 1e-9); // 30 * 2^-2
  assert.equal(demand(t, 10), 50);
});

test("optimum matches a brute-force price scan", () => {
  for (const o of [{}, { turnedAway: 40 }, { elasticity: 1.2 }, { elasticity: 4, cost: 800 }, { booked: 50, turnedAway: 25 }, { maxPrice: 1500 }, { minPrice: 900 }]) {
    const t = one(o);
    const got = bestPrice(t);
    let bruteBest = -Infinity;
    for (let p = t.lo; p <= t.hi; p += (t.hi - t.lo) / 20000) bruteBest = Math.max(bruteBest, contribution(t, p));
    assert.ok(got.value >= bruteBest - 1e-6, JSON.stringify(o) + " " + got.value + " < " + bruteBest);
    assert.ok(got.value <= bruteBest + Math.abs(bruteBest) * 1e-3 + 1);
  }
});

test("unconstrained optimum is cost*e/(e-1)", () => {
  const t = one({ booked: 5, dates: 500, elasticity: 2, cost: 300 });
  assert.ok(Math.abs(bestPrice(t).price - 600) < 1e-6);
});

test("a sold-out date with turned-away enquiries is priced above today's price", () => {
  const t = one({ booked: 50, turnedAway: 30, elasticity: 1.6 });
  const b = bestPrice(t);
  assert.ok(b.price > t.price);
  assert.ok(b.value > contribution(t, t.price));
});

test("never worse than the current price", () => {
  const a = analyze(EXAMPLE_TYPES);
  assert.ok(a.ok);
  assert.ok(a.best >= a.now - 1e-6);
  a.rows.forEach((r) => assert.ok(r.profit >= r.nowProfit - 1e-6));
  assert.equal(a.stress.length, 2);
});

test("empty input is reported, not thrown", () => {
  const a = analyze([]);
  assert.equal(a.ok, false);
  assert.ok(a.warnings.length);
});

test("no demand is warned about", () => {
  const a = analyze([{ dates: 10, price: 500, booked: 0, turnedAway: 0, cost: 100 }]);
  assert.ok(a.warnings.some((w) => /no demand/.test(w)));
});

test("csv has a header, a row per type and totals", () => {
  const lines = toCsv(analyze(EXAMPLE_TYPES)).trim().split("\n");
  assert.equal(lines.length, 1 + EXAMPLE_TYPES.length + 2);
  assert.match(lines[0], /^date_type,/);
});
