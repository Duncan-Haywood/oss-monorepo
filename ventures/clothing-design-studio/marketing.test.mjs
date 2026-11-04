import test from "node:test";
import assert from "node:assert/strict";
import { apportion, adEconomics, marketingPlan, calendarCsv } from "./marketing.mjs";
import { sellingSide } from "./costing.mjs";
import { newDesign, applyOp } from "./design.mjs";

test("apportion sums exactly and follows the weights", () => {
  assert.deepEqual(apportion(10, [1, 1, 1]), [4, 3, 3]);
  assert.deepEqual(apportion(7, [0, 1, 1]), [0, 4, 3]);
  assert.deepEqual(apportion(0, [1, 2]), [0, 0]);
  for (const t of [1, 13, 100, 257]) assert.equal(apportion(t, [0, 0.35, 0.245, 0.17, 0.12]).reduce((a, b) => a + b), t);
});

test("ad economics by hand", () => {
  // CAC = 0.8 / 0.02 = 40; left per sale 25; price 60.
  const a = adEconomics({ profitPerSale: 25, price: 60, adBudget: 400, cpc: 0.8, conversionPct: 2 });
  assert.equal(a.cac, 40);
  assert.equal(a.breakEvenRoas, 2.4);
  assert.equal(a.clicks, 500);
  assert.equal(a.paidSales, 10);
  assert.equal(a.roas, 1.5);              // 10 x 60 / 400
  assert.equal(a.netFromAds, -150);       // 10 x 25 - 400
  assert.equal(a.maxCpcAtBreakEven, 0.5); // 25 x 0.02
  assert.equal(a.minConversionPct, 3.2);  // 0.8 / 25
  assert.match(a.verdict, /lose money/);
});

test("ads that can pay for themselves say to test small first", () => {
  const a = adEconomics({ profitPerSale: 25, price: 60, adBudget: 300, cpc: 0.4, conversionPct: 2 });
  assert.equal(a.cac, 20);
  assert.equal(a.netFromAds, 75);
  assert.match(a.verdict, /small test/);
});

test("no profit per sale: no ad can pay", () => {
  const a = adEconomics({ profitPerSale: -2, price: 20, adBudget: 100, cpc: 0.5, conversionPct: 2 });
  assert.match(a.verdict, /no advertising/);
  assert.equal(a.breakEvenRoas, null);
});

const design = () => {
  let d = newDesign({ quantity: 100, price: 50, name: "Halo Tee" });
  return applyOp(d, { op: "add", kind: "motif", motif: "halo", method: "screen", colours: 1 });
};
const econ = sellingSide({ landed: 20, price: 50, quantity: 100 }, { marketingBudget: 400, paymentFeePct: 3, paymentFixed: 0.3, unsoldPct: 10 });

test("calendar sales targets add up to the break-even and spend to the budget", () => {
  const p = marketingPlan({ design: design(), econ, adBudget: 400, assumptions: { weeks: 6 } });
  assert.equal(p.calendar.length, 6);
  const sales = p.calendar.reduce((s, w) => s + w.salesTarget, 0);
  assert.equal(sales, econ.breakEvenUnits);
  assert.equal(p.calendar.at(-1).cumulativeSalesTarget, econ.breakEvenUnits);
  assert.equal(Math.round(p.calendar.reduce((s, w) => s + w.adSpend, 0) * 100), 40000);
  assert.equal(p.calendar[0].salesTarget, 0);
  assert.equal(p.calendar[0].phase, "Teaser");
  assert.equal(p.calendar[1].phase, "Launch");
  assert.equal(p.calendar.at(-1).phase, "Last call");
  assert.ok(p.calendar[1].salesTarget >= p.calendar[2].salesTarget);
});

test("drafts only: no task claims anything was posted, and last call is conditional on truth", () => {
  const p = marketingPlan({ design: design(), econ, adBudget: 400 });
  const all = p.calendar.flatMap(w => w.tasks).join("\n");
  assert.match(all, /only if it is true/);
  assert.doesNotMatch(all, /guarantee|viral|sell out/i);
});

test("notes explain the gap ads leave and a break-even beyond the run", () => {
  const p = marketingPlan({ design: design(), econ, adBudget: 400, assumptions: { cpc: 0.8, conversionPct: 2 } });
  assert.ok(p.notes.some(n => /must come from your own audience/.test(n)));
  const tight = sellingSide({ landed: 40, price: 50, quantity: 100 }, { marketingBudget: 400 });
  const q = marketingPlan({ design: design(), econ: tight, adBudget: 400 });
  assert.ok(q.notes.some(n => /no calendar fixes that/.test(n)));
});

test("unprofitable product gives a plan with a note, not a crash", () => {
  const bad = sellingSide({ landed: 60, price: 0.2, quantity: 100 }, {});
  const p = marketingPlan({ design: design(), econ: bad, adBudget: 100 });
  assert.ok(p.notes.some(n => /no break-even/.test(n)));
  assert.equal(p.calendar.reduce((s, w) => s + w.salesTarget, 0), 0);
});

test("calendar CSV has a header and a row per week", () => {
  const p = marketingPlan({ design: design(), econ, adBudget: 400 });
  const lines = calendarCsv(p).trim().split("\n");
  assert.equal(lines.length, 1 + p.calendar.length);
  assert.match(lines[0], /^Week,Phase/);
});
