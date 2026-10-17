import { test } from "node:test";
import assert from "node:assert/strict";
import { parseComps, analyze, defaultSqftRate, reportCsv, summaryText, sampleData, DEFAULTS } from "./calc.mjs";

const near = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) <= eps, `${a} !~ ${b}`);

test("parseComps reads labelled lines, skips comments, headers and blank fields", () => {
  const { comps, skipped } = parseComps("# note\nlabel,price\n10 Oak, 300000, 1500, 3, 2, , 1990, 4\n\n 12 Oak;310000;1600");
  assert.equal(comps.length, 2);
  assert.equal(comps[0].label, "10 Oak");
  assert.equal(comps[0].price, 300000);
  assert.ok(Number.isNaN(comps[0].lot));
  assert.equal(comps[0].months, 4);
  assert.equal(comps[1].sqft, 1600);
  assert.equal(skipped.length, 0);
});

test("parseComps accepts $ and quoted thousands, and rejects rows without a price", () => {
  const { comps, skipped } = parseComps('"1 A St","$301,000",1500\nNoPrice,,1500\nB St,250000,0');
  assert.equal(comps[0].price, 301000);
  assert.equal(comps.length, 1);
  assert.equal(skipped.length, 2);
});

test("an identical comp needs no adjustment and prices the subject at its sale", () => {
  const a = analyze({ assessed: 300000, sqft: 1500, beds: 3, baths: 2, lot: 6000, year: 2000 }, [{ label: "x", price: 300000, sqft: 1500, beds: 3, baths: 2, lot: 6000, year: 2000, months: 0 }], {});
  near(a.market.weighted, 300000);
  assert.equal(a.rows[0].grossPct, 0);
  assert.match(a.verdict, /No case/);
});

test("adjustments run from comp toward subject: a smaller comp is adjusted up", () => {
  const a = analyze({ assessed: 500000, sqft: 2000, beds: 4, baths: 2, lot: 8000, year: 2000 }, [{ label: "s", price: 400000, sqft: 1800, beds: 3, baths: 2, lot: 7000, year: 1990, months: 0 }], { sqftRate: 100 });
  const r = a.rows[0];
  near(r.adj.sqft, 20000);
  near(r.adj.beds, DEFAULTS.bedAdj);
  near(r.adj.lot, DEFAULTS.lotPer1000);
  near(r.adj.age, 10 * DEFAULTS.yearAdj);
  near(r.adjusted, 400000 + 20000 + 4000 + 1500 + 4000);
});

test("time adjustment is a monthly percentage of price", () => {
  const a = analyze({ assessed: 300000 }, [{ label: "t", price: 200000, months: 6 }], { monthlyTimePct: 0.5 });
  near(a.rows[0].adj.time, 6000);
});

test("assessment ratio converts assessed value to implied market value and back", () => {
  const a = analyze({ assessed: 100000 }, [{ label: "r", price: 250000 }], { ratioPct: 40, taxRatePct: 3 });
  near(a.impliedMarket, 250000);
  const b = analyze({ assessed: 100000 }, [{ label: "r", price: 200000 }], { ratioPct: 40, taxRatePct: 3 });
  near(b.scenarios.likely.overMarket, 50000);
  near(b.scenarios.likely.assessedCut, 20000);
  near(b.scenarios.likely.taxSaved, 600);
});

test("weights favour the comp that needed less adjustment", () => {
  const a = analyze({ assessed: 400000, sqft: 2000 }, [
    { label: "close", price: 300000, sqft: 2000 },
    { label: "far", price: 400000, sqft: 1000 },
  ], { sqftRate: 100 });
  assert.ok(a.rows[0].weight > a.rows[1].weight);
  assert.ok(a.market.weighted < (a.rows[0].adjusted + a.rows[1].adjusted) / 2);
});

test("heavy adjustment flags a comp as weak", () => {
  const a = analyze({ assessed: 400000, sqft: 2000 }, [{ label: "w", price: 300000, sqft: 1000 }], { sqftRate: 100 });
  assert.equal(a.rows[0].weak, true);
  assert.ok(a.findings.some((f) => /heavy adjustment/.test(f.title)));
});

test("sample data reaches a verdict, an equity case and a money figure", () => {
  const s = sampleData();
  const a = analyze(s.subject, parseComps(s.comps).comps, s.opts);
  assert.ok(a.scenarios.likely.overMarket > 0);
  assert.ok(a.equity && a.equity.comps === 5);
  assert.ok(a.scenarios.likely.taxSaved > 0);
  assert.ok(a.market.conservative <= a.market.median);
});

test("equity needs three comps with assessments and square feet", () => {
  const a = analyze({ assessed: 400000, sqft: 2000 }, [
    { label: "a", price: 350000, sqft: 2000, assessed: 340000 },
    { label: "b", price: 350000, sqft: 2000, assessed: 340000 },
  ], {});
  assert.equal(a.equity, null);
});

test("filing fee and break-even odds", () => {
  const s = sampleData();
  const a = analyze(s.subject, parseComps(s.comps).comps, { ...s.opts, fee: 300, yearsHeld: 3 });
  near(a.money.likelyNet, a.scenarios.likely.taxSaved * 3 - 300);
  near(a.money.breakEvenOdds, 300 / (a.scenarios.likely.taxSaved * 3), 1e-9);
  near(a.money.contingencyKeeps, a.scenarios.likely.taxSaved * (DEFAULTS.contingencyPct / 100));
});

test("no tax rate means no dollar claims, not a zero", () => {
  const a = analyze({ assessed: 400000 }, [{ label: "a", price: 300000 }], {});
  assert.ok(Number.isNaN(a.scenarios.likely.taxSaved));
  assert.deepEqual(a.money, {});
  assert.ok(a.findings.some((f) => /No tax rate/.test(f.title)));
});

test("invalid inputs return a message, never throw", () => {
  assert.ok(analyze({ assessed: "" }, [{ label: "a", price: 1 }], {}).invalid);
  assert.ok(analyze({ assessed: 1000 }, [], {}).invalid);
  assert.ok(analyze({ assessed: 1000 }, [{ label: "a", price: 1 }], { ratioPct: 250 }).invalid);
});

test("no over-assessment is reported as no case, not a negative saving", () => {
  const a = analyze({ assessed: 200000 }, [{ label: "a", price: 300000 }], { taxRatePct: 2 });
  assert.equal(a.scenarios.likely.assessedCut, 0);
  assert.equal(a.scenarios.likely.taxSaved, 0);
  assert.match(a.verdict, /No case/);
});

test("defaultSqftRate is a share of the median price per sqft", () => {
  near(defaultSqftRate([{ price: 200000, sqft: 1000 }, { price: 300000, sqft: 1000 }], 0.4), 100);
});

test("csv and summary output name every comp and the verdict", () => {
  const s = sampleData();
  const a = analyze(s.subject, parseComps(s.comps).comps, s.opts);
  const csv = reportCsv(a);
  assert.equal(csv.trim().split("\n").length, 6);
  assert.match(csv, /14 Maple Ct/);
  assert.match(summaryText(a), /not an appraisal/);
});
