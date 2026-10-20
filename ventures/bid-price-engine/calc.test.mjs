import { test } from "node:test";
import assert from "node:assert/strict";
import { priceJob, parseLabor, parseCosts, overheadPctFrom, marginToMarkup, markupToMargin, priceLadder } from "./calc.mjs";

const base = {
  labor: [{ hours: 10, rate: 20 }], burdenPct: 25, materials: [{ cost: 400 }], wastePct: 10, subs: 100, equipment: 50,
  travelMiles: 20, mileRate: 0.5, contingencyPct: 10, overheadPct: 20, marginPct: 25,
};

test("prices a job as full cost over one minus margin", () => {
  const r = priceJob(base);
  assert.equal(r.laborCost, 250);
  assert.equal(r.materialCost, 440);
  assert.equal(r.travel, 10);
  assert.equal(r.direct, 850);
  assert.equal(r.contingency, 85);
  assert.equal(r.overhead, 170);
  assert.equal(r.fullCost, 1105);
  assert.equal(r.price, 1473.33);
  assert.equal(r.profit, 368.33);
  assert.equal(r.walkAway, 1105);
  assert.equal(r.cashFloor, 850);
  assert.ok(Math.abs(r.profit / r.price - 0.25) < 1e-4);
});

test("a markup typed as a margin leaves the job short", () => {
  const r = priceJob(base);
  assert.equal(r.naive.price, 1381.25);
  assert.equal(r.naive.actualMarginPct, 20);
  assert.equal(r.naive.shortBy, round(r.price - r.naive.price));
  assert.equal(r.markupPct, 33.33);
});

test("labor overrun headroom is contingency, then contingency plus profit", () => {
  const r = priceJob(base);
  assert.equal(r.overrunBeforeContingencyGonePct, 34);
  assert.equal(r.overrunBeforeProfitLossPct, round(((85 + r.profit) / 250) * 100));
  const none = priceJob({ ...base, labor: [], subs: 100 });
  assert.equal(none.overrunBeforeProfitLossPct, null);
  assert.equal(none.profitPerLaborHour, null);
});

test("a rival bid is judged against cash cost, walk-away and target", () => {
  assert.equal(priceJob({ ...base, rivalPrice: 800 }).rival.verdict, "below-cash");
  assert.equal(priceJob({ ...base, rivalPrice: 1000 }).rival.verdict, "below-walk-away");
  const thin = priceJob({ ...base, rivalPrice: 1300 }).rival;
  assert.equal(thin.verdict, "thin");
  assert.equal(thin.profit, 195);
  assert.equal(priceJob({ ...base, rivalPrice: 2000 }).rival.verdict, "above-target");
  assert.equal(priceJob({ ...base, rivalPrice: "" }).rival, undefined);
});

test("rejects negative and impossible inputs", () => {
  assert.throws(() => priceJob({ ...base, marginPct: 95 }), /Target margin/);
  assert.throws(() => priceJob({ ...base, burdenPct: -1 }), /burden/);
  assert.throws(() => priceJob({ ...base, labor: [{ hours: -2, rate: 20 }] }), /Labor hours/);
  assert.throws(() => priceJob({ ...base, subs: "abc" }), /Subcontractors/);
});

test("zero-cost job prices at zero without dividing by zero", () => {
  const r = priceJob({ marginPct: 30 });
  assert.equal(r.price, 0);
  assert.equal(r.naive.actualMarginPct, 0);
});

test("parses labor and cost lines", () => {
  assert.deepEqual(parseLabor("16 @ 28 crew lead\n8h x $22/hr helper"), [{ hours: 16, rate: 28, label: "crew lead" }, { hours: 8, rate: 22, label: "helper" }]);
  assert.throws(() => parseLabor("sixteen hours"), /hours @ hourly wage/);
  assert.deepEqual(parseCosts("$1,420.50 lumber\n85 hinges"), [{ cost: 1420.5, label: "lumber" }, { cost: 85, label: "hinges" }]);
  assert.throws(() => parseCosts("lumber 40"), /dollar amount/);
});

test("margin and markup convert both ways", () => {
  assert.equal(marginToMarkup(20), 25);
  assert.equal(marginToMarkup(25), 33.33);
  assert.equal(markupToMargin(25), 20);
  assert.equal(markupToMargin(100), 50);
});

test("overhead percent comes from last year's books", () => {
  assert.equal(overheadPctFrom(60000, 400000), 15);
  assert.throws(() => overheadPctFrom(1, 0), /above zero/);
});

test("price ladder moves profit one-for-one with price", () => {
  const r = priceJob(base);
  const l = priceLadder(r);
  assert.equal(l.length, 5);
  assert.equal(l[2].profit, r.profit);
  assert.ok(l[0].profit < 0 === false || l[0].profit < r.profit);
  assert.ok(l[4].marginPct > l[2].marginPct);
});

function round(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }
