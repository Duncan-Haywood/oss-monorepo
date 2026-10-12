// Hay baling own-vs-hire calculator: pure functions, no dependencies, nothing leaves the browser.
// Owning a baler (and the mower and rake that go with it) is a fixed yearly cost plus a variable cost per acre and per bale;
// hiring a custom operator is a price per bale plus any mowing and raking you also hire out, and hay that waits for the
// contractor loses some of its value. The comparison finds the acreage where owning starts to win, and what to charge
// neighbours so outside work pays for its share of the machine.

export function num(v) {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/[$,%\s]/g, ""));
  return Number.isFinite(n) ? n : NaN;
}
export const money = (n) => (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");
export const money2 = (n) => (n < 0 ? "-$" : "$") + Math.abs(n).toFixed(2);

export const DEFAULTS = {
  acres: 40, tonsPerAcreCut: 1.5, cuts: 2, baleWeightLb: 850,
  equipPrice: 45000, salvagePct: 30, lifeYears: 12, interestPct: 7, insHousingPct: 1.5,
  fuelPerAcre: 6, repairsPerAcre: 5, hoursPerAcre: 1.4, wage: 22, wrapPerBale: 2.25,
  hireBalePrice: 14, hireExtraPerAcre: 0, delayLossPct: 8,
  salePricePerBale: 60, outsideBales: 0, targetMarginPct: 20,
};

const safe = (x) => (Number.isFinite(x) ? Math.max(0, x) : 0);
const clampPct = (p) => Math.min(99, Math.max(0, safe(p)));

export function balesPerAcre(o) {
  return (safe(o.tonsPerAcreCut) * safe(o.cuts) * 2000) / Math.max(1, safe(o.baleWeightLb));
}

// Yearly fixed cost of owning the equipment: straight-line depreciation, interest on the average investment, insurance and housing.
export function fixedCost(o) {
  const price = safe(o.equipPrice);
  const salvage = price * clampPct(o.salvagePct) / 100;
  const dep = (price - salvage) / Math.max(1, safe(o.lifeYears));
  const interest = ((price + salvage) / 2) * safe(o.interestPct) / 100;
  const insurance = price * safe(o.insHousingPct) / 100;
  return { dep, interest, insurance, total: dep + interest + insurance };
}

// Variable cost per acre of hay made (all cuts) and per bale.
export function variablePerAcre(o) {
  const cuts = Math.max(1, safe(o.cuts));
  const bpa = balesPerAcre(o);
  const fuel = cuts * safe(o.fuelPerAcre);
  const repairs = cuts * safe(o.repairsPerAcre);
  const labour = cuts * safe(o.hoursPerAcre) * safe(o.wage);
  const wrap = bpa * safe(o.wrapPerBale);
  return { fuel, repairs, labour, wrap, total: fuel + repairs + labour + wrap };
}

// Own vs hire at a given acreage (default o.acres). Delay loss is the share of hay value lost waiting for a contractor.
export function compare(o, acres = o.acres) {
  const a = safe(acres);
  const bpa = balesPerAcre(o);
  const bales = a * bpa;
  const fixed = fixedCost(o);
  const v = variablePerAcre(o);
  const own = fixed.total + a * v.total;
  const hirePrice = bales * safe(o.hireBalePrice) + a * Math.max(1, safe(o.cuts)) * safe(o.hireExtraPerAcre);
  const delay = bales * safe(o.salePricePerBale) * clampPct(o.delayLossPct) / 100;
  const hire = hirePrice + delay;
  return {
    acres: a, bales, own, hire, hirePrice, delay, fixed: fixed.total, variable: a * v.total,
    ownPerBale: bales > 0 ? own / bales : null, hirePerBale: bales > 0 ? hire / bales : null,
    saving: hire - own, winner: own <= hire ? "own" : "hire",
  };
}

// Acres per year at which owning costs the same as hiring. null when hiring is always cheaper per acre.
export function breakEven(o) {
  const bpa = balesPerAcre(o);
  const cuts = Math.max(1, safe(o.cuts));
  const v = variablePerAcre(o);
  const hirePerAcre = bpa * (safe(o.hireBalePrice) + safe(o.salePricePerBale) * clampPct(o.delayLossPct) / 100) + cuts * safe(o.hireExtraPerAcre);
  const margin = hirePerAcre - v.total;
  if (!(margin > 0)) return { acres: null, bales: null, hirePerAcre, ownVariablePerAcre: v.total };
  const acres = fixedCost(o).total / margin;
  return { acres, bales: acres * bpa, hirePerAcre, ownVariablePerAcre: v.total };
}

// Cost per bale of your own hay and the sale price that earns the target margin on it.
export function enterprise(o) {
  const c = compare(o);
  const m = clampPct(o.targetMarginPct);
  const price = c.ownPerBale === null ? null : c.ownPerBale / (1 - m / 100);
  const revenue = c.bales * safe(o.salePricePerBale);
  return { ...c, neededPrice: price, revenue, profit: revenue - c.own, marginPct: revenue > 0 ? ((revenue - c.own) / revenue) * 100 : null };
}

// What to charge neighbours per bale. Outside bales spread the fixed cost; the rate covers its share plus variable cost,
// grossed up for the target margin.
export function outsideRate(o) {
  const bpa = balesPerAcre(o);
  const outside = safe(o.outsideBales);
  const own = safe(o.acres) * bpa;
  const total = own + outside;
  if (!(bpa > 0) || !(total > 0)) return null;
  const v = variablePerAcre(o);
  const fixedPerBale = fixedCost(o).total / total;
  const varPerBale = v.total / bpa;
  const cost = fixedPerBale + varPerBale;
  const m = clampPct(o.targetMarginPct);
  const rate = cost / (1 - m / 100);
  return {
    outside, totalBales: total, fixedPerBale, varPerBale, cost, rate,
    outsideProfit: outside * (rate - cost),
    ownCostPerBaleWithout: own > 0 ? (fixedCost(o).total + own * varPerBale) / own : null,
    ownCostPerBaleWith: cost,
    belowHire: rate < safe(o.hireBalePrice),
  };
}

export function acreageSensitivity(o) {
  return [0.25, 0.5, 1, 1.5, 2, 4].map((mult) => ({ mult, ...compare(o, safe(o.acres) * mult) }));
}

export function hirePriceSensitivity(o) {
  return [0.7, 0.85, 1, 1.15, 1.3].map((mult) => {
    const h = safe(o.hireBalePrice) * mult;
    return { mult, price: h, ...compare({ ...o, hireBalePrice: h }) };
  });
}

export function delaySensitivity(o) {
  return [0, 4, 8, 15, 25].map((pct) => ({ pct, ...compare({ ...o, delayLossPct: pct }) }));
}

export function priceSensitivity(o) {
  return [0.7, 0.85, 1, 1.15, 1.3].map((mult) => {
    const p = safe(o.salePricePerBale) * mult;
    return { mult, price: p, ...enterprise({ ...o, salePricePerBale: p }) };
  });
}
