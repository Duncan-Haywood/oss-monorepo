// Oil & gas mineral / royalty buyout evaluator. Pure functions, no dependencies, nothing leaves the
// browser. Everything is arithmetic on figures the user types from their own royalty statements and
// from the lump-sum offer they received.
//
// Model, monthly royalty cash flow m = 1..12*horizon, received at month end:
//   production follows a modified Arps curve: hyperbolic decline (annual effective rate `initialDecline`,
//   exponent b) until the decline rate falls to `terminalDecline`, then exponential at that rate;
//   royalty_m = currentMonthly x curve(m) x (1 + priceDrift)^(m/12) x priceMultiplier
//   the well is shut in (cash flow stops) once royalty_m < shutInMonthly.
// Optional upside: a new well that starts paying `newWellMonthly` at `newWellYear`, on the same curve,
// weighted by `newWellProb`. Present value discounts monthly at the user's annual effective rate.
// The buyer's implied return is the annual effective rate at which the sold cash flows equal the offer.
// After tax: the lump sum is taxed on (offer - basis); royalty is taxed at the ordinary rate after the
// typed percentage-depletion share is deducted.

export const DEFAULTS = {
  currentMonthly: 1800,
  initialDecline: 28,
  b: 1,
  terminalDecline: 7,
  priceDrift: 0,
  shutInMonthly: 150,
  horizon: 30,
  newWellMonthly: 1500,
  newWellYear: 3,
  newWellProb: 30,
  offer: 60000,
  netMineralAcres: 20,
  discountRate: 12,
  basis: 0,
  lumpTaxPct: 20,
  rentTaxPct: 30,
  depletionPct: 15,
};

export function num(v) {
  if (typeof v === "number") return v;
  const n = Number(String(v ?? "").replace(/[$,%\s]/g, ""));
  return String(v ?? "").trim() === "" ? NaN : n;
}
const nz = (x) => (Number.isFinite(x) && x > 0 ? x : 0);

export function money(x) {
  if (!Number.isFinite(x)) return "n/a";
  const n = Math.round(x);
  return (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString("en-US");
}
export function pct(x, d = 1) {
  return Number.isFinite(x) ? (x * 100).toFixed(d) + "%" : "n/a";
}

// Fraction of the starting rate still flowing `months` after the curve starts (modified Arps).
export function declineFactor(months, initialDeclinePct, b, terminalDeclinePct) {
  const t = Math.max(months, 0) / 12;
  const de = Math.min(Math.max(nz(initialDeclinePct) / 100, 0), 0.99);
  const dt = Math.min(Math.max(nz(terminalDeclinePct) / 100, 0), 0.99);
  const bb = Math.min(Math.max(nz(b), 0), 2);
  const dTermNom = dt > 0 ? -Math.log(1 - dt) : 0;
  if (de === 0) return 1;
  if (bb < 0.01) return Math.exp(-(-Math.log(1 - de)) * t); // plain exponential
  const dNom = (Math.pow(1 - de, -bb) - 1) / bb;
  const hyper = (x) => Math.pow(1 + bb * dNom * x, -1 / bb);
  // Time at which the instantaneous decline dNom/(1+b*dNom*t) has fallen to the terminal rate.
  if (dTermNom > 0 && dNom > dTermNom) {
    const tSwitch = (dNom / dTermNom - 1) / (bb * dNom);
    if (t > tSwitch) return hyper(tSwitch) * Math.exp(-dTermNom * (t - tSwitch));
  } else if (dTermNom > 0 && dNom <= dTermNom) {
    return Math.exp(-dTermNom * t);
  }
  return hyper(t);
}

// Monthly expected cash flow (index 0 = month 1), before tax.
export function monthlyFlows(o) {
  const horizon = Math.min(Math.max(Math.floor(nz(o.horizon)), 0), 60);
  const drift = Math.max(Number.isFinite(o.priceDrift) ? o.priceDrift : 0, -50) / 100;
  const mult = o.priceMultiplier > 0 ? o.priceMultiplier : 1;
  const shut = nz(o.shutInMonthly);
  const wellYear = Math.max(Math.floor(nz(o.newWellYear)), 1);
  const prob = Math.min(nz(o.newWellProb), 100) / 100;
  const rows = [];
  let alive = true;
  for (let m = 1; m <= horizon * 12; m++) {
    const px = Math.pow(1 + drift, m / 12) * mult;
    const base = nz(o.currentMonthly) * declineFactor(m, o.initialDecline, o.b, o.terminalDecline) * px;
    if (base < shut) alive = false;
    const startM = (wellYear - 1) * 12;
    const nw = nz(o.newWellMonthly) > 0 && m > startM
      ? nz(o.newWellMonthly) * declineFactor(m - startM, o.initialDecline, o.b, o.terminalDecline) * px * prob
      : 0;
    const existing = alive ? base : 0;
    rows.push({ month: m, existing, upside: nw, total: existing + nw });
  }
  return rows;
}

export function presentValue(flows, ratePct) {
  const r = nz(ratePct) / 100;
  return flows.reduce((s, f, i) => s + f / Math.pow(1 + r, (i + 1) / 12), 0);
}

// Annual effective rate at which `flows` (monthly) are worth `price`; null-ish NaN when none exists.
export function impliedReturn(price, flows) {
  if (!(price > 0) || !flows.length) return NaN;
  if (flows.reduce((s, f) => s + f, 0) <= 0) return NaN;
  const pv = (r) => flows.reduce((s, f, i) => s + f / Math.pow(1 + r, (i + 1) / 12), 0) - price;
  let lo = -0.9, hi = 10;
  if (pv(lo) < 0) return NaN;
  if (pv(hi) > 0) return hi;
  for (let k = 0; k < 200; k++) {
    const mid = (lo + hi) / 2;
    if (pv(mid) > 0) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

export function analyze(raw) {
  const o = { ...DEFAULTS, ...raw };
  const rows = monthlyFlows(o);
  const warnings = [];
  if (!rows.length) warnings.push("Enter how many years of royalty to look at (1 to 60).");
  if (!nz(o.currentMonthly)) warnings.push("Enter your current average monthly royalty check.");
  const offer = nz(o.offer);
  if (!offer) warnings.push("Enter the lump-sum offer to compare.");
  const rate = nz(o.discountRate);
  const flows = rows.map((r) => r.total);
  const flowsNoUpside = rows.map((r) => r.existing);

  const pv = presentValue(flows, rate);
  const pvNoUpside = presentValue(flowsNoUpside, rate);
  const undiscounted = flows.reduce((s, f) => s + f, 0);
  const irr = impliedReturn(offer, flows);
  const irrNoUpside = impliedReturn(offer, flowsNoUpside);

  const lastLive = rows.reduce((last, r) => (r.existing > 0 ? r.month : last), 0);
  let paybackMonth = null, run = 0;
  for (let i = 0; i < flows.length; i++) {
    run += flows[i];
    if (run >= offer && offer > 0) { paybackMonth = i + 1; break; }
  }

  const lumpTax = offer ? Math.max(offer - nz(o.basis), 0) * (nz(o.lumpTaxPct) / 100) : 0;
  const offerAfterTax = offer - lumpTax;
  const taxOnRoyalty = (nz(o.rentTaxPct) / 100) * (1 - Math.min(nz(o.depletionPct), 100) / 100);
  const afterTaxFlows = flows.map((f) => f * (1 - taxOnRoyalty));
  const pvAfterTax = presentValue(afterTaxFlows, rate);
  const irrAfterTax = impliedReturn(offerAfterTax, afterTaxFlows);

  const annual = nz(o.currentMonthly) * 12;
  const monthsOfIncome = nz(o.currentMonthly) ? offer / nz(o.currentMonthly) : NaN;
  const perAcre = nz(o.netMineralAcres) ? offer / nz(o.netMineralAcres) : NaN;
  const pvPerAcre = nz(o.netMineralAcres) ? pv / nz(o.netMineralAcres) : NaN;

  const rates = [8, 10, 12, 15, 20, 25].map((r) => ({ rate: r, pv: presentValue(flows, r) }));
  const multipliers = [0.6, 0.8, 1, 1.2, 1.5];
  const grid = [rate - 4, rate - 2, rate, rate + 2, rate + 4].filter((r) => r > 0).map((r) => ({
    rate: r,
    values: multipliers.map((mu) => presentValue(monthlyFlows({ ...o, priceMultiplier: mu }).map((x) => x.total), r)),
  }));

  return {
    months: rows.length, rows, offer, rate, annual, monthsOfIncome, perAcre, pvPerAcre,
    undiscounted, pv, pvNoUpside, offerVsPv: pv ? offer / pv : NaN, gap: offer - pv,
    irr, irrNoUpside, lastLiveYears: lastLive / 12, paybackMonth,
    lumpTax, offerAfterTax, pvAfterTax, irrAfterTax, afterTaxGap: offerAfterTax - pvAfterTax,
    rates, multipliers, grid, warnings,
  };
}
