import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, profit, ticketRevenue, breakEvenGuests, priceForProfit, fixedCost, perPerson, parseInputs, toCsv, EXAMPLE, KEYS } from "./calc.mjs";

const ex = (o = {}) => ({ ...EXAMPLE, ...o });
const v = (o = {}) => parseInputs(ex(o), []);

test("fixed cost and per-person cost add up the inputs", () => {
  assert.equal(fixedCost(v()), 9000 + 6000 + 2500 + 600 + 1200 + 800);
  assert.equal(perPerson(v()), 4 * 135);
});

test("early-bird seats are sold first at the early price", () => {
  const p = v();
  assert.equal(ticketRevenue(p, 4), 4 * 1900);
  assert.equal(ticketRevenue(p, 10), 6 * 1900 + 4 * 2400);
});

test("profit: revenue less card fees, billed people x per-person cost, and fixed costs", () => {
  const p = v({ guarantee: "0" });
  const r = profit(p, 14);
  const gross = 6 * 1900 + 8 * 2400;
  assert.equal(r.gross, gross);
  assert.ok(Math.abs(r.fees - gross * 0.03) < 1e-9);
  assert.equal(r.billed, 16); // 14 guests + 2 free spots
  assert.equal(r.variable, 16 * 540);
  assert.ok(Math.abs(r.profit - (gross * 0.97 - 16 * 540 - 20100)) < 1e-9);
});

test("a venue guarantee bills empty beds when turnout is below it", () => {
  const p = v({ guarantee: "16" });
  const thin = profit(p, 8);
  assert.equal(thin.billed, 16);
  assert.equal(thin.empty, 6);
  const none = profit(v({ guarantee: "0" }), 8);
  assert.ok(Math.abs((none.profit - thin.profit) - 6 * 540) < 1e-9);
  assert.equal(profit(p, 14).empty, 0);
});

test("break-even guests is the smallest turnout with non-negative profit", () => {
  const p = v();
  const n = breakEvenGuests(p);
  assert.ok(profit(p, n).profit >= 0);
  assert.ok(profit(p, n - 1).profit < 0);
  assert.equal(breakEvenGuests(v({ venue: "10000000" })), null);
});

test("the price that hits a target profit reproduces it when plugged back in", () => {
  const p = v();
  const price = priceForProfit(p, 14, 5000);
  assert.ok(Math.abs(profit(p, 14, price).profit - 5000) < 1e-6);
  assert.equal(priceForProfit(v({ earlySeats: "20" }), 14, 1e9), null);
});

test("analysis caps expected guests at seats for sale and says so", () => {
  const r = analyze(ex({ expected: "30" }));
  assert.equal(r.ok, true);
  assert.equal(r.n, 18);
  assert.ok(r.warnings.some((w) => /only 18 seats/.test(w)));
});

test("sensitivity rows: the 100% fill row sells every seat, the 0% price step matches the base case", () => {
  const r = analyze(ex());
  assert.equal(r.fills.at(-1).guests, 18);
  const zero = r.prices.find((p) => p.step === 0);
  assert.ok(Math.abs(zero.profit - r.base.profit) < 1e-9);
  assert.ok(r.prices.every((p, i, a) => i === 0 || p.profit >= a[i - 1].profit));
});

test("early-bird cost is what the same turnout would earn at the regular price", () => {
  const r = analyze(ex());
  assert.ok(r.earlyCost > 0);
  assert.ok(Math.abs(r.earlyCost - 6 * 500 * 0.97) < 1e-6);
});

test("guarantee cost is empty billed beds times the per-person cost", () => {
  const r = analyze(ex({ expected: "8" }));
  assert.equal(r.guaranteeCost, 6 * 540);
});

test("bad input is reported and nothing is computed", () => {
  const r = analyze(ex({ price: "abc", nights: "0" }));
  assert.equal(r.ok, false);
  assert.ok(r.warnings.some((w) => /Regular price/.test(w)));
  assert.ok(r.warnings.some((w) => /Nights/.test(w)));
});

test("csv has a header and one row per fill level", () => {
  const lines = toCsv(analyze(ex())).trim().split("\n");
  assert.equal(lines.length, 8);
  assert.match(lines[1], /^\d+,-?\d+,-?\d+,-?\d+,-?\d+,-?\d+$/);
});

test("every default is a key", () => assert.equal(KEYS.length, 17));
