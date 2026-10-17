// Apiary profit planner: pure functions, no dependencies, nothing leaves the browser.
// Colony model per year: winter losses, then splits (new colonies made per surviving colony), capped by yard size;
// colonies made beyond the cap are sold as nucs. Honey comes from surviving (productive) colonies only.

export function num(v) {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/[$,%\s]/g, ""));
  return Number.isFinite(n) ? n : NaN;
}
export const money = (n) => (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");
export const money2 = (n) => (n < 0 ? "-$" : "$") + Math.abs(n).toFixed(2);

export const DEFAULTS = {
  startHives: 10, cap: 30, years: 5,
  lossPct: 30, splitRate: 0.6, splitFailPct: 15,
  honeyLb: 50, retailSharePct: 40, retailPrice: 12, bulkPrice: 4.5, jarCostPerLb: 1.2,
  nucPrice: 190, nucsSoldShare: 100,
  pollHives: 0, pollFee: 140,
  mitePerHive: 25, feedPerHive: 30, queenCost: 35, suppliesPerHive: 20,
  hiveEquip: 350, startupEquip: 1800, equipLifeYears: 10, fixedYear: 300,
  hoursPerHive: 8, sellHoursPerLb: 0.01, valueOfHour: 20,
};

const clampPct = (p) => Math.min(100, Math.max(0, p));

export function yearModel(start, o) {
  const survivors = start * (1 - clampPct(o.lossPct) / 100);
  const madeGross = survivors * Math.max(0, o.splitRate);
  const made = madeGross * (1 - clampPct(o.splitFailPct) / 100);
  const room = Math.max(0, o.cap - survivors);
  const kept = Math.min(made, room);
  const surplus = made - kept;
  const nucsSold = surplus * clampPct(o.nucsSoldShare) / 100;
  const honeyLb = survivors * Math.max(0, o.honeyLb);
  const retailLb = honeyLb * clampPct(o.retailSharePct) / 100;
  const bulkLb = honeyLb - retailLb;
  const honeyRev = retailLb * o.retailPrice + bulkLb * o.bulkPrice;
  const jarCost = retailLb * o.jarCostPerLb;
  const nucRev = nucsSold * o.nucPrice;
  const pollRev = Math.min(survivors, Math.max(0, o.pollHives)) * o.pollFee;
  const revenue = honeyRev + nucRev + pollRev;
  const husbandry = start * (o.mitePerHive + o.feedPerHive + o.suppliesPerHive);
  const queens = madeGross * o.queenCost + survivors * 0.3 * o.queenCost;
  const newEquip = kept * o.hiveEquip;
  const depreciation = (o.hiveEquip * start + o.startupEquip) / Math.max(1, o.equipLifeYears);
  const cash = husbandry + queens + jarCost + o.fixedYear;
  const hours = start * o.hoursPerHive + honeyLb * o.sellHoursPerLb + madeGross * 2;
  const cashProfit = revenue - cash - newEquip;
  const profit = revenue - cash - depreciation;
  return {
    start, survivors, made, kept, surplus, nucsSold, honeyLb, honeyRev, nucRev, pollRev, revenue,
    cash, newEquip, depreciation, hours, cashProfit, profit,
    profitAfterLabour: profit - hours * o.valueOfHour,
    perHiveProfit: start ? profit / start : 0,
    profitPerHour: hours ? profit / hours : 0,
    end: survivors + kept,
  };
}

export function project(o) {
  const years = Math.min(15, Math.max(1, Math.round(o.years)));
  const rows = [];
  let hives = Math.max(1, Math.round(o.startHives));
  let cumulative = -(hives * o.hiveEquip + o.startupEquip);
  let paybackYear = null;
  const invest = -cumulative;
  for (let y = 1; y <= years; y++) {
    const r = yearModel(hives, o);
    cumulative += r.cashProfit;
    if (paybackYear === null && cumulative >= 0) paybackYear = y;
    rows.push({ year: y, ...r, cumulative });
    hives = Math.max(1, r.end);
  }
  return { rows, invest, paybackYear, totalProfit: rows.reduce((a, r) => a + r.profit, 0), finalHives: hives };
}

// Winter loss is the number that decides this business; show the whole range.
export function lossSensitivity(o, losses = [10, 20, 30, 40, 50, 60]) {
  return losses.map((lossPct) => {
    const p = project({ ...o, lossPct });
    return { lossPct, finalHives: p.finalHives, totalProfit: p.totalProfit, paybackYear: p.paybackYear };
  });
}

// What each revenue line adds over honey alone.
export function scenarios(o) {
  const honeyOnly = { ...o, nucsSoldShare: 0, pollHives: 0 };
  const withNucs = { ...o, pollHives: 0 };
  const withPoll = { ...o, nucsSoldShare: 0 };
  const defs = [["Honey only", honeyOnly], ["Honey + nucs", withNucs], ["Honey + pollination", withPoll], ["All three", o]];
  return defs.map(([label, s]) => {
    const p = project(s);
    return { label, totalProfit: p.totalProfit, paybackYear: p.paybackYear, finalHives: p.finalHives };
  });
}

// Steady-state yard size where annual profit covers fixed cost; null if each hive loses money.
export function breakEvenHives(o) {
  const per = yearModel(1, { ...o, cap: Infinity, fixedYear: 0, startupEquip: 0 });
  const fixed = o.fixedYear + o.startupEquip / Math.max(1, o.equipLifeYears);
  if (per.profit <= 0) return null;
  return Math.ceil(fixed / per.profit);
}

// Loss at which the yard just stops growing (survivors + kept == start) under unlimited room.
export function holdSteadyLossPct(o) {
  const growth = Math.max(0, o.splitRate) * (1 - clampPct(o.splitFailPct) / 100);
  return Math.round(100 * growth / (1 + growth) * 10) / 10;
}
