import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCrops, solvePlan, greedyPlan, planProfit, analyze, simplex, reportCsv, sampleText, rng, percentile } from "./calc.mjs";

const crop = (name, o = {}) => ({ name, yieldPerBf: 1, price: 1, days: 10, cost: 0, laborPerBf: 0, maxUnits: null, minBf: 0, ...o });
const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

// A: margin 9, 50 days (0.18 per bed-foot-day). B: margin 8, 20 days (0.40), capped at 120 bed-feet.
// 100 bed-feet over 100 days = 10,000 bed-foot-days: B takes 2,400, A fills the other 152 bed-feet.
const A = crop("A", { yieldPerBf: 2, price: 5, cost: 1, days: 50 });
const B = crop("B", { yieldPerBf: 1, price: 8, cost: 0, days: 20, maxUnits: 120 });

test("hand-solved two-crop plan: the short, capped crop first, the long one fills the rest", () => {
  const r = analyze([A, B], { totalBedFeet: 100, seasonDays: 100, laborHours: null });
  near(r.rows[1].bedFeet, 120);
  near(r.rows[0].bedFeet, 152);
  near(r.profit, 120 * 8 + 152 * 9);
  near(r.duals.landPerBfd, 0.18);
  near(r.duals.landPerBedFoot, 18);
  near(r.rows[1].capValuePer100Units, 440);
  assert.equal(r.binding, "land");
});

test("sorting by profit per bed-foot loses here, and the gap is exactly what the arithmetic says", () => {
  const r = analyze([A, B], { totalBedFeet: 100, seasonDays: 100 });
  // A (margin 9) beats B (margin 8) per bed-foot, so the spreadsheet plants 200 bed-feet of A and no B.
  near(r.rows[0].naiveBedFeet, 200);
  near(r.rows[1].naiveBedFeet, 0);
  near(r.naiveProfit, 1800);
  near(r.gain, 2328 - 1800);
});

test("strong duality: dual prices times the limits equal the optimum", () => {
  const crops = [A, B, crop("C", { yieldPerBf: 3, price: 2, cost: 0.5, days: 30, laborPerBf: 0.1, maxUnits: 200 })];
  const landBfd = 9000;
  const labor = 25;
  const res = solvePlan(crops, landBfd, labor);
  const objective = planProfit(crops, res.bf);
  let dualObj = res.duals.land * landBfd + res.duals.labor * labor;
  crops.forEach((c, i) => { if (Number.isFinite(res.caps[i])) dualObj += res.duals.cap[i] * res.caps[i]; });
  near(objective, dualObj, 1e-6);
});

// Independent check: for three crops, every vertex of the feasible region is the
// intersection of three active constraints. The best feasible vertex must equal the simplex.
function solve3(M, v) {
  const a = M.map((r, i) => [...r, v[i]]);
  for (let c = 0; c < 3; c++) {
    let p = c;
    for (let r = c + 1; r < 3; r++) if (Math.abs(a[r][c]) > Math.abs(a[p][c])) p = r;
    if (Math.abs(a[p][c]) < 1e-12) return null;
    [a[c], a[p]] = [a[p], a[c]];
    for (let r = 0; r < 3; r++) {
      if (r === c) continue;
      const f = a[r][c] / a[c][c];
      for (let k = c; k < 4; k++) a[r][k] -= f * a[c][k];
    }
  }
  return [a[0][3] / a[0][0], a[1][3] / a[1][1], a[2][3] / a[2][2]];
}

function bruteForce(crops, landBfd, labor) {
  const cons = [];
  crops.forEach((_, i) => { const e = [0, 0, 0]; e[i] = 1; cons.push([e, 0]); });
  crops.forEach((c, i) => { if (c.maxUnits !== null) { const e = [0, 0, 0]; e[i] = 1; cons.push([e, c.maxUnits / c.yieldPerBf]); } });
  cons.push([crops.map((c) => c.days), landBfd]);
  cons.push([crops.map((c) => c.laborPerBf), labor]);
  let best = -Infinity;
  const idx = cons.length;
  for (let a = 0; a < idx; a++) for (let b = a + 1; b < idx; b++) for (let c = b + 1; c < idx; c++) {
    const x = solve3([cons[a][0], cons[b][0], cons[c][0]], [cons[a][1], cons[b][1], cons[c][1]]);
    if (!x) continue;
    if (x.some((v) => v < -1e-7)) continue;
    if (crops.some((cr, i) => cr.maxUnits !== null && x[i] > cr.maxUnits / cr.yieldPerBf + 1e-7)) continue;
    if (x.reduce((s, v, i) => s + v * crops[i].days, 0) > landBfd + 1e-6) continue;
    if (x.reduce((s, v, i) => s + v * crops[i].laborPerBf, 0) > labor + 1e-6) continue;
    best = Math.max(best, x.reduce((s, v, i) => s + v * (crops[i].yieldPerBf * crops[i].price - crops[i].cost), 0));
  }
  return best;
}

test("simplex matches vertex enumeration on 200 random three-crop instances with land, labor and demand limits", () => {
  const rand = rng(7);
  for (let t = 0; t < 200; t++) {
    const crops = [0, 1, 2].map((i) => crop("c" + i, {
      yieldPerBf: 0.5 + rand() * 3,
      price: 0.5 + rand() * 10,
      cost: rand() * 2,
      days: 20 + Math.floor(rand() * 200),
      laborPerBf: rand() * 0.15,
      maxUnits: rand() < 0.6 ? 100 + rand() * 3000 : null,
    }));
    const landBfd = 20000 + rand() * 300000;
    const labor = 100 + rand() * 600;
    const res = solvePlan(crops, landBfd, labor);
    const got = planProfit(crops, res.bf);
    const want = bruteForce(crops, landBfd, labor);
    assert.ok(Math.abs(got - want) <= 1e-5 * Math.max(1, Math.abs(want)), `trial ${t}: simplex ${got} vs enumeration ${want}`);
    // The plan must be feasible.
    assert.ok(res.bf.reduce((s, v, i) => s + v * crops[i].days, 0) <= landBfd + 1e-5);
    assert.ok(res.bf.reduce((s, v, i) => s + v * crops[i].laborPerBf, 0) <= labor + 1e-6);
  }
});

test("the optimizer never does worse than the sorted plan, on random inputs", () => {
  const rand = rng(11);
  for (let t = 0; t < 100; t++) {
    const crops = Array.from({ length: 6 }, (_, i) => crop("c" + i, {
      yieldPerBf: 0.5 + rand() * 3, price: 0.5 + rand() * 10, cost: rand() * 2,
      days: 20 + Math.floor(rand() * 200), laborPerBf: rand() * 0.15, maxUnits: rand() < 0.7 ? 100 + rand() * 3000 : null,
    }));
    const landBfd = 50000 + rand() * 400000;
    const labor = 100 + rand() * 900;
    const lp = planProfit(crops, solvePlan(crops, landBfd, labor).bf);
    const naive = planProfit(crops, greedyPlan(crops, landBfd, labor));
    assert.ok(lp >= naive - 1e-6, `trial ${t}: ${lp} < ${naive}`);
  }
});

test("labor can be the binding limit, with its own price", () => {
  const crops = [crop("Fussy", { yieldPerBf: 4, price: 5, days: 20, laborPerBf: 0.2 }), crop("Easy", { yieldPerBf: 2, price: 5, days: 20, laborPerBf: 0.01 })];
  const r = analyze(crops, { totalBedFeet: 1000, seasonDays: 100, laborHours: 100 });
  assert.equal(r.binding, "land and labor");
  assert.ok(r.duals.laborPerHour > 0);
  assert.ok(r.laborUsedHrs <= 100 + 1e-6);
});

test("with no labor hours given, labor does not limit the plan", () => {
  const crops = [crop("Fussy", { yieldPerBf: 4, price: 5, days: 20, laborPerBf: 5 }), crop("Easy", { yieldPerBf: 2, price: 5, days: 20 })];
  const r = analyze(crops, { totalBedFeet: 100, seasonDays: 100, laborHours: null });
  assert.equal(r.duals.laborPerHour, 0);
  assert.equal(r.laborUsedHrs, null);
});

test("when every worthwhile crop is at its sales cap, demand is the limit and more beds add nothing", () => {
  const crops = [crop("A", { maxUnits: 100, price: 5 }), crop("B", { maxUnits: 50, price: 4 })];
  const r = analyze(crops, { totalBedFeet: 10000, seasonDays: 100 });
  assert.equal(r.binding, "demand");
  near(r.more.land10, 0);
});

test("committed minimum bed-feet are honoured even for a crop that loses money", () => {
  const crops = [crop("Loss", { yieldPerBf: 1, price: 1, cost: 2, days: 10, minBf: 50 }), crop("Win", { yieldPerBf: 1, price: 10, days: 10 })];
  const r = analyze(crops, { totalBedFeet: 100, seasonDays: 10 });
  near(r.rows[0].bedFeet, 50);
  near(r.rows[1].bedFeet, 50);
  near(r.profit, -50 + 500);
});

test("impossible commitments are refused with a reason", () => {
  const tooMuchLand = analyze([crop("A", { minBf: 500 }), crop("B")], { totalBedFeet: 100, seasonDays: 10 });
  assert.match(tooMuchLand.error, /bed-foot-days/);
  const aboveCap = analyze([crop("A", { minBf: 500, maxUnits: 100 }), crop("B")], { totalBedFeet: 1000, seasonDays: 100 });
  assert.match(aboveCap.error, /sell/);
  const noLabor = analyze([crop("A", { minBf: 100, laborPerBf: 1 }), crop("B")], { totalBedFeet: 1000, seasonDays: 100, laborHours: 10 });
  assert.match(noLabor.error, /labor hours/);
});

test("a crop left out reports the price rise that would bring it in", () => {
  const crops = [crop("Good", { yieldPerBf: 2, price: 10, days: 10 }), crop("Poor", { yieldPerBf: 1, price: 3, days: 20 })];
  const r = analyze(crops, { totalBedFeet: 100, seasonDays: 10 });
  const poor = r.rows[1];
  assert.equal(poor.bedFeet, 0);
  // Good earns 2 per bed-foot-day; Poor earns 0.15. Poor needs margin 40 a bed-foot: price 40, a rise of $37.
  near(poor.entryPriceRise, 37, 1e-6);
  const raised = analyze([crops[0], { ...crops[1], price: 40.01 }], { totalBedFeet: 100, seasonDays: 10 });
  assert.ok(raised.rows[1].bedFeet > 0);
});

test("planProfit stops sales at the demand cap and charges cost on every bed-foot", () => {
  const c = [crop("A", { yieldPerBf: 2, price: 5, cost: 1, maxUnits: 100 })];
  near(planProfit(c, [50]), 100 * 5 - 50);
  near(planProfit(c, [50], [2], null), 100 * 5 - 50); // double yield, still capped at 100 units
  near(planProfit(c, [50], [0.5], null), 50 * 5 - 50);
});

test("the simulated range is seeded, ordered, and the plan's own cost is inside the draws", () => {
  const crops = parseCrops(sampleText()).crops;
  const a = analyze(crops, { totalBedFeet: 4000, seasonDays: 240, laborHours: 800 });
  const b = analyze(crops, { totalBedFeet: 4000, seasonDays: 240, laborHours: 800 });
  assert.deepEqual(a.range, b.range);
  assert.ok(a.range.p10 < a.range.p50 && a.range.p50 < a.range.p90);
  assert.ok(a.beatsNaive >= 0 && a.beatsNaive <= 1);
  const c = analyze(crops, { totalBedFeet: 4000, seasonDays: 240, laborHours: 800, seed: 5 });
  assert.notDeepEqual(a.range, c.range);
  // With no uncertainty the range collapses onto the planned profit.
  const d = analyze(crops, { totalBedFeet: 4000, seasonDays: 240, laborHours: 800, yieldSd: 0, priceSd: 0 });
  near(d.range.p10, d.profit, 1e-6);
  near(d.range.p90, d.profit, 1e-6);
});

test("more beds or labor are priced by re-solving, not by extrapolating", () => {
  const crops = parseCrops(sampleText()).crops;
  const r = analyze(crops, { totalBedFeet: 4000, seasonDays: 240, laborHours: 800 });
  const bigger = solvePlan(crops, 4400 * 240, 800);
  near(r.more.land10, planProfit(crops, bigger.bf) - r.profit, 1e-6);
  assert.ok(r.more.land10 >= 0);
});

test("parseCrops reads a header or none, tabs or commas, quotes and currency", () => {
  const withHeader = parseCrops("crop,yield,price,days\nKale,1.3,$3.00,70\nBeets,1.2,3,75");
  assert.equal(withHeader.crops.length, 2);
  const tabs = parseCrops("Kale\t1.3\t3\t70\t0.2\t5\t2000\t\nBeets\t1.2\t3\t75");
  assert.equal(tabs.crops[0].maxUnits, 2000);
  assert.equal(tabs.crops[0].laborPerBf, 0.05);
  const quoted = parseCrops('"Tomato, slicing",3.5,3.5,120,0.9,9,"6,000"\nKale,1.3,3,70');
  assert.equal(quoted.crops[0].name, "Tomato, slicing");
  assert.equal(quoted.crops[0].maxUnits, 6000);
});

test("parseCrops refuses bad rows by naming the row and the field", () => {
  assert.match(parseCrops("").error, /Paste/);
  assert.match(parseCrops("Kale,1.3,3,70").error, /at least two/);
  assert.match(parseCrops("Kale,1.3,3,70\nBeets,x,3,75").error, /Row 2.*Beets.*yield/);
  assert.match(parseCrops("Kale,1.3,3,70\nBeets,1,3,0").error, /days/);
  assert.match(parseCrops("Kale,1.3,3,70\nkale,1,3,10").error, /twice/);
  assert.match(parseCrops("Kale,1.3,3,70\nBeets,1,3").error, /at least crop/);
  assert.match(parseCrops("Kale,1.3,3,70\nBeets,1,3,10,-1").error, /cost/);
});

test("parseCrops warns when costs or labor were left out", () => {
  const p = parseCrops("Kale,1.3,3,70\nBeets,1,3,75");
  assert.equal(p.warnings.length, 2);
});

test("analyze rejects nonsense farm settings", () => {
  const c = parseCrops(sampleText()).crops;
  assert.match(analyze(c, { totalBedFeet: 0 }).error, /bed-feet/);
  assert.match(analyze(c, { seasonDays: 0 }).error, /Season/);
  assert.match(analyze(c, { laborHours: -1 }).error, /Labor/);
});

test("simplex alone: a textbook problem", () => {
  // max 3x + 5y, x <= 4, 2y <= 12, 3x + 2y <= 18  ->  x = 2, y = 6, value 36
  const r = simplex([3, 5], [[1, 0], [0, 2], [3, 2]], [4, 12, 18]);
  near(r.x[0], 2);
  near(r.x[1], 6);
  near(r.objective, 36);
  near(r.duals[1], 1.5);
  near(r.duals[2], 1);
});

test("the CSV has one row per crop and quotes names with commas", () => {
  const crops = [crop("Tomato, slicing", { yieldPerBf: 3, price: 3, days: 100 }), crop("Kale", { yieldPerBf: 1, price: 3, days: 50 })];
  const csv = reportCsv(analyze(crops, { totalBedFeet: 100, seasonDays: 100 }));
  const lines = csv.trim().split("\n");
  assert.equal(lines.length, 3);
  assert.match(lines[1], /^"Tomato, slicing",/);
});

test("percentile and rng behave", () => {
  assert.equal(percentile([1, 2, 3, 4, 5], 0.5), 3);
  assert.equal(percentile([], 0.5), null);
  const r1 = rng(1); const r2 = rng(1);
  assert.equal(r1(), r2());
});
