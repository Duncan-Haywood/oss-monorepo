import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, parse, summaryText, sweepCsv, dollars, SAMPLE } from "./calc.mjs";

const raw = (o = {}) => ({ ...SAMPLE, ...o });

test("price follows the stated rule on the sample", () => {
  const r = compute(raw());
  const completed = 90 * 0.8;
  const variable = 6 * 14 * 4.25 + 150 + 60;
  const price = (variable + (21000 + 40000) / completed) / 0.97;
  assert.ok(Math.abs(r.price - price) < 0.01);
  assert.equal(r.completed, completed);
  assert.ok(Math.abs(r.perAngler - price / 4) < 0.01);
});

test("break-even is below the target price and equals zero profit", () => {
  const r = compute(raw({ currentPrice: "" }));
  assert.ok(r.breakEven < r.price);
  const be = compute(raw({ currentPrice: String(r.breakEven) }));
  assert.ok(Math.abs(be.current.profitYear) < 5);
});

test("a price under break-even is a high finding with the annual loss", () => {
  const r = compute(raw({ currentPrice: "300" }));
  assert.ok(r.current.profitYear < 0);
  assert.equal(r.findings[0].severity, "high");
});

test("more weather cancellations raise the price", () => {
  assert.ok(compute(raw({ cancelPct: "40" })).price > compute(raw({ cancelPct: "0" })).price);
});

test("fuel swing is gallons per trip over the fee factor", () => {
  const r = compute(raw());
  assert.ok(Math.abs(r.fuelSwing - (6 * 14) / 0.97) < 1e-9);
});

test("trips needed at the current price can exceed what is booked", () => {
  const r = compute(raw({ currentPrice: "700" }));
  assert.ok(r.current.tripsForTarget > 90 * 0.8);
  assert.ok(r.findings.some((f) => /completed trips to hit/.test(f.title)));
  assert.equal(compute(raw({ currentPrice: "100" })).current.tripsForTarget, null);
});

test("optional fields can be blank", () => {
  const r = compute(raw({ anglers: "", currentPrice: "", deckhand: "", bait: "", cancelPct: "", feePct: "" }));
  assert.deepEqual(r.errors, []);
  assert.equal(r.perAngler, null);
  assert.equal(r.current, null);
});

test("validation names the bad field and does not compute", () => {
  assert.ok(parse(raw({ hours: "" })).errors[0].includes("trip length"));
  assert.ok(compute(raw({ booked: "0" })).errors.length > 0);
  assert.ok(compute(raw({ cancelPct: "100" })).errors.length > 0);
  assert.ok(compute(raw({ feePct: "60" })).errors.length > 0);
  assert.ok(compute(raw({ anglers: "0" })).errors.length > 0);
});

test("sweep shows price falling as volume rises", () => {
  const s = compute(raw()).sweep;
  assert.equal(s.length, 5);
  for (let i = 1; i < s.length; i++) assert.ok(s[i].price < s[i - 1].price);
});

test("dollars, summary and csv render", () => {
  const r = compute(raw());
  assert.equal(dollars(1234.5), "$1,234.50");
  assert.match(summaryText(r), /Break-even price: \$/);
  assert.equal(sweepCsv(r).split("\n").length, 6);
});
