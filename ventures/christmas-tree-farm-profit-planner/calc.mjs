// Christmas tree farm profit planner: pure functions, no dependencies, nothing leaves the browser.
// Each year you plant `acresPerYear` acres for `plantYears` years. A block planted in year p is harvested in year
// p + harvestAge and then comes out of the model (one rotation, no replant). Cash flows are per calendar year, so the
// long wait (cost for years, revenue at the end) shows up as a cumulative-cash curve, NPV and break-even price.

export function num(v) {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/[$,%\s]/g, ""));
  return Number.isFinite(n) ? n : NaN;
}
export const money = (n) => (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");
export const money2 = (n) => (n < 0 ? "-$" : "$") + Math.abs(n).toFixed(2);

export const DEFAULTS = {
  acresPerYear: 2, plantYears: 8, years: 20, harvestAge: 8,
  treesPerAcre: 1400, survivalPct: 75, cullPct: 10,
  seedlingCost: 1.1, plantCostPerTree: 0.9, prepPerAcre: 400,
  retailSharePct: 40, retailPrice: 65, wholesalePrice: 28,
  sellCostPerTree: 4,
  earlyCostPerAcre: 300, matureCostPerAcre: 700, earlyYears: 2,
  landCostPerAcre: 150, fixedYear: 1500, startupEquip: 9000, equipLifeYears: 12,
  discountPct: 6,
};

const clampPct = (p) => Math.min(100, Math.max(0, p));

export function sellableTreesPerAcre(o) {
  return Math.max(0, o.treesPerAcre) * clampPct(o.survivalPct) / 100 * (1 - clampPct(o.cullPct) / 100);
}
export function blendedPrice(o) {
  const s = clampPct(o.retailSharePct) / 100;
  return s * o.retailPrice + (1 - s) * o.wholesalePrice;
}

export function project(o) {
  const years = Math.min(30, Math.max(1, Math.round(o.years)));
  const age = Math.max(1, Math.round(o.harvestAge));
  const plantYears = Math.max(1, Math.round(o.plantYears));
  const perAcre = sellableTreesPerAcre(o);
  const price = blendedPrice(o);
  const equipPerYear = o.startupEquip / Math.max(1, o.equipLifeYears);
  const rows = [];
  let cumulative = 0, paybackYear = null, trough = 0, troughYear = 1;
  for (let y = 1; y <= years; y++) {
    const planted = y <= plantYears ? Math.max(0, o.acresPerYear) : 0;
    let harvested = 0, growing = 0, early = 0;
    for (let p = 1; p <= Math.min(plantYears, y); p++) {
      const a = y - p; // age of the block this year
      if (a === age) harvested += Math.max(0, o.acresPerYear);
      else if (a < age) { growing += Math.max(0, o.acresPerYear); if (a < o.earlyYears) early += Math.max(0, o.acresPerYear); }
    }
    const trees = harvested * perAcre;
    const revenue = trees * price;
    const plantCost = planted * (o.treesPerAcre * (o.seedlingCost + o.plantCostPerTree) + o.prepPerAcre);
    const upkeep = early * o.earlyCostPerAcre + (growing - early) * o.matureCostPerAcre;
    const land = growing * o.landCostPerAcre;
    const sell = trees * o.sellCostPerTree;
    const fixed = o.fixedYear + (y === 1 ? o.startupEquip : 0);
    const cash = revenue - plantCost - upkeep - land - sell - fixed;
    cumulative += cash;
    if (cumulative < trough) { trough = cumulative; troughYear = y; }
    if (paybackYear === null && y > 1 && cumulative >= 0 && trough < 0) paybackYear = y;
    rows.push({ year: y, planted, harvested, growing, trees, revenue, plantCost, upkeep, land, sell, fixed, cash, cumulative });
  }
  const r = Math.max(0, o.discountPct) / 100;
  const npv = rows.reduce((a, row) => a + row.cash / Math.pow(1 + r, row.year), 0);
  return {
    rows, paybackYear, npv, totalCash: cumulative, peakOutlay: -trough, peakOutlayYear: troughYear,
    treesSold: rows.reduce((a, row) => a + row.trees, 0), price, perAcre,
    firstHarvestYear: age + 1,
  };
}

// Annual-average profit per acre once the farm is in rotation (one acre planted, tended and harvested on repeat).
export function steadyAcre(o) {
  const age = Math.max(1, Math.round(o.harvestAge));
  const revenue = sellableTreesPerAcre(o) * (blendedPrice(o) - o.sellCostPerTree);
  const plant = o.treesPerAcre * (o.seedlingCost + o.plantCostPerTree) + o.prepPerAcre;
  const early = Math.min(age, Math.max(0, Math.round(o.earlyYears)));
  const upkeep = early * o.earlyCostPerAcre + (age - early) * o.matureCostPerAcre;
  const land = age * o.landCostPerAcre;
  const perCycle = revenue - plant - upkeep - land;
  return { perCycle, perAcreYear: perCycle / age, cycleYears: age };
}

// Multiply both prices until NPV is zero. Returns the blended price per sellable tree you need, or null if
// the plan cannot be made to pay by any price in range.
export function breakEvenPrice(o) {
  const base = blendedPrice(o);
  if (!(base > 0)) return null;
  const f = (m) => project({ ...o, retailPrice: o.retailPrice * m, wholesalePrice: o.wholesalePrice * m }).npv;
  let lo = 0, hi = 20;
  if (f(hi) < 0) return null;
  for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (f(mid) >= 0) hi = mid; else lo = mid; }
  return hi * base;
}

export function priceSensitivity(o, mults = [0.6, 0.8, 1, 1.2, 1.4]) {
  return mults.map((m) => {
    const p = project({ ...o, retailPrice: o.retailPrice * m, wholesalePrice: o.wholesalePrice * m });
    return { mult: m, price: p.price, npv: p.npv, totalCash: p.totalCash, paybackYear: p.paybackYear };
  });
}

// Survival is the quiet killer: drought year one and deer browse change how many trees reach the lot.
export function survivalSensitivity(o, levels = [50, 60, 70, 80, 90]) {
  return levels.map((survivalPct) => {
    const p = project({ ...o, survivalPct });
    return { survivalPct, npv: p.npv, totalCash: p.totalCash, paybackYear: p.paybackYear };
  });
}

// What changing the sales mix does: all wholesale, as entered, all choose-and-cut.
export function channelScenarios(o) {
  return [["All wholesale", 0], ["As entered", o.retailSharePct], ["All retail / choose-and-cut", 100]].map(([label, retailSharePct]) => {
    const p = project({ ...o, retailSharePct });
    return { label, price: p.price, npv: p.npv, totalCash: p.totalCash, paybackYear: p.paybackYear };
  });
}
