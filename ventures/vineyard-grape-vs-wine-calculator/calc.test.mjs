import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, grapeSale, ownWine, readInputs, breakEvenDtcShare, sensitivity, money, sampleInput, toCsv, GALLONS_PER_CASE } from "./calc.mjs";

// Round numbers: 10 acres x 4 t = 40 t. Grapes 40 x 2000 = 80000; cost 10 x 3000 + 40 x 100 = 34000.
const base = readInputs({ acres: 10, tonsPerAcre: 4, growCostPerAcre: 3000, harvestCostPerTon: 100, grapePricePerTon: 2000, gallonsPerTon: 150, wineLossPct: 0,
  cellarCostPerCase: 30, packageCostPerBottle: 3, fixedCostPerYear: 5000, exciseTaxPerGallon: 1, dtcShare: 50, dtcPricePerBottle: 40, dtcCostPct: 10, marketingPct: 0, wholesalePricePerBottle: 16, unsoldPct: 0 });

test("grape sale by hand", () => {
  const g = grapeSale(base);
  assert.equal(g.tons, 40);
  assert.equal(g.revenue, 80000);
  assert.equal(g.cost, 34000);
  assert.equal(g.net, 46000);
  assert.equal(g.netPerAcre, 4600);
});

test("own wine by hand", () => {
  const w = ownWine(base);
  // 40 t x 150 gal = 6000 gal; / 2.3775 gal per case = 2523.65 cases; 30283 bottles
  assert.equal(w.gallons, 6000);
  assert.equal(w.cases, Math.round((6000 / GALLONS_PER_CASE) * 100) / 100);
  assert.equal(w.bottles, 30284);
  // blended net per bottle = 0.5 x 36 + 0.5 x 16 = 26
  assert.equal(w.blendedPerBottle, 26);
  const bottles = (6000 / GALLONS_PER_CASE) * 12;
  const cases = 6000 / GALLONS_PER_CASE;
  const revenue = bottles * 26;
  const cost = 34000 + cases * 30 + bottles * 3 + 6000 * 1 + 5000;
  assert.ok(Math.abs(w.revenue - revenue) < 0.01);
  assert.ok(Math.abs(w.totalCost - cost) < 0.01);
  assert.ok(Math.abs(w.net - (revenue - cost)) < 0.02);
});

test("unsold bottles cut revenue and excise but not cellar cost", () => {
  const a = ownWine(base), b = ownWine({ ...base, unsoldPct: 20 });
  assert.ok(b.revenue < a.revenue);
  assert.ok(b.excise < a.excise);
  assert.equal(b.cellarCost, a.cellarCost);
  assert.equal(b.soldBottles, Math.round(a.bottles * 0.8));
});

test("marketing is a share of revenue", () => {
  const a = ownWine(base), b = ownWine({ ...base, marketingPct: 10 });
  assert.ok(Math.abs(b.marketing - b.revenue * 0.1) < 0.01);
  assert.ok(Math.abs(a.net - b.net - b.marketing) < 0.02);
});

test("break-even direct share sets wine net equal to grape net", () => {
  const v = { ...base, grapePricePerTon: 6000, fixedCostPerYear: 150000 };
  const s = breakEvenDtcShare(v);
  assert.ok(s > 0 && s < 100);
  const net = ownWine({ ...v, dtcShare: s }).net;
  assert.ok(Math.abs(net - grapeSale(v).net) < 40, `${net} vs ${grapeSale(v).net}`);
});

test("break-even share is null when out of reach", () => {
  assert.equal(breakEvenDtcShare({ ...base, grapePricePerTon: 40000 }), null);
  assert.equal(breakEvenDtcShare({ ...base, fixedCostPerYear: 900000 }), null);
});

test("grape price to match wine closes the gap", () => {
  const r = analyze(sampleInput());
  const g = grapeSale({ ...r.inputs, grapePricePerTon: r.grapePriceToMatchWine });
  assert.ok(Math.abs(g.net - r.wine.net) <= 0.02 * r.grapes.tons);
});

test("winner follows the numbers", () => {
  assert.equal(analyze({ ...sampleInput(), grapePricePerTon: 30000 }).winner, "grapes");
  assert.equal(analyze({ ...sampleInput(), grapePricePerTon: 500, dtcShare: 100, dtcPricePerBottle: 60, fixedCostPerYear: 10000, unsoldPct: 5 }).winner, "wine");
  assert.match(analyze({ ...sampleInput(), grapePricePerTon: 30000 }).advice.join(" "), /selling the grapes wins/);
});

test("validation", () => {
  assert.match(analyze({ acres: 0 }).error, /acres/);
  assert.match(analyze({ gallonsPerTon: 0 }).error, /gallons/);
  assert.match(analyze({ cellarCostPerCase: -1 }).error, /negative/);
  assert.match(analyze({ unsoldPct: 100 }).error, /Percentages/);
  assert.match(analyze({ dtcShare: 101 }).error, /Direct share/);
});

test("sensitivity: more direct share and fewer unsold help", () => {
  const g = sensitivity(sampleInput());
  assert.equal(g.length, 3);
  assert.ok(g[2].cells[0].net > g[0].cells[2].net);
  const r = analyze({ ...sampleInput(), dtcShare: 50, unsoldPct: 15 });
  assert.equal(g[1].cells[1].net, r.wine.net);
});

test("csv and money", () => {
  assert.equal(money(-1234.4), "-$1,234");
  const csv = toCsv(analyze(sampleInput()));
  assert.equal(csv.trim().split("\n").length, 3);
  assert.match(csv, /Sell grapes/);
});
