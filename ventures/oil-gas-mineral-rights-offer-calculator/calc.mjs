// Mineral / oil-and-gas royalty buyout evaluator. Pure functions, no dependencies, nothing leaves the
// browser. Arithmetic on figures the user types from their own royalty statements and the lump-sum
// offer they received.
//
// Model, monthly cash flows, month m = 1..12*horizon, received at the end of the month:
//   Existing wells follow an Arps decline from the current monthly check q0:
//     hyperbolic   q(t) = q0 / (1 + b*Di*t)^(1/b)      (b = 0 is exponential: q0 * exp(-Di*t))
//     the nominal decline D(t) = Di / (1 + b*Di*t) falls as the well ages; once it reaches the
//     terminal decline Dterm the curve switches to exponential at Dterm, the standard way to stop a
//     hyperbolic curve from over-promising a very long tail.
//   t is in years, taken at the middle of each month.
//   Planned wells: an extra stream starting at a typed month with its own first-month check, the same
//     decline shape, weighted by the typed chance the well is actually drilled.
//   Prices: every flow is scaled by (1 + price change). Wells shut in below a minimum monthly check.
// The offer buys the flow for `soldYears` (>= horizon sells it all). Present value discounts monthly at
// the user's own annual rate. The buyer's return is the annual rate at which the sold flow is worth
// exactly the offer (an IRR, found by bisection). After tax: lump sum taxed on (offer - basis), royalty
// income taxed at the typed rate.

export const DEFAULTS = {
  monthlyCheck: 1800,
  declineInitial: 40,
  bFactor: 1,
  declineTerminal: 8,
  priceChange: 0,
  minCheck: 60,
  newWellCheck: 1200,
  newWellMonth: 18,
  newWellChance: 40,
  horizon: 30,
  soldYears: 30,
  offer: 60000,
  discountRate: 12,
  basis: 0,
  lumpTaxPct: 20,
  incomeTaxPct: 24,
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

// Rate multiplier at age t years (1 at t = 0): Arps hyperbolic with a switch to exponential at Dterm.
export function declineFactor(t, diPct, b, dtermPct) {
  const di = nz(diPct) / 100;
  const bb = nz(b);
  const dterm = nz(dtermPct) / 100;
  if (t <= 0 || di === 0) return 1;
  if (bb < 1e-9) return Math.exp(-di * t);
  if (dterm > 0 && dterm < di) {
    const tSwitch = (di / dterm - 1) / (bb * di);
    if (t > tSwitch) return Math.pow(1 + bb * di * tSwitch, -1 / bb) * Math.exp(-dterm * (t - tSwitch));
  }
  return Math.pow(1 + bb * di * t, -1 / bb);
}

// Expected monthly cash flow (index 0 = month 1), before tax.
export function monthlyFlows(o) {
  const years = Math.min(Math.max(Math.floor(nz(o.horizon)), 0), 60);
  const price = Math.max(1 + (Number.isFinite(o.priceChange) ? o.priceChange : 0) / 100, 0);
  const minCheck = nz(o.minCheck);
  const rows = [];
  for (let m = 1; m <= years * 12; m++) {
    const t = (m - 0.5) / 12;
    const base = nz(o.monthlyCheck) * declineFactor(t, o.declineInitial, o.bFactor, o.declineTerminal) * price;
    let wells = 0;
    const start = Math.max(Math.floor(nz(o.newWellMonth)), 1);
    if (nz(o.newWellCheck) > 0 && m >= start) {
      const age = (m - start + 0.5) / 12;
      wells = nz(o.newWellCheck) * declineFactor(age, o.declineInitial, o.bFactor, o.declineTerminal) * price;
    }
    const chance = Math.min(nz(o.newWellChance), 100) / 100;
    const baseOn = base >= minCheck ? base : 0;
    const wellsOn = wells >= minCheck ? wells : 0;
    rows.push({ month: m, base: baseOn, wells: wellsOn * chance, expected: baseOn + wellsOn * chance });
  }
  return rows;
}

export function presentValue(flows, ratePct) {
  const r = nz(ratePct) / 100;
  return flows.reduce((s, f, i) => s + f / Math.pow(1 + r, (i + 1) / 12), 0);
}

// Annual rate at which `flows` (monthly) are worth `price`; bisection, NaN when none exists.
export function impliedReturn(price, flows) {
  if (!(price > 0) || !flows.length) return NaN;
  const total = flows.reduce((s, f) => s + f, 0);
  if (total <= 0) return NaN;
  const pv = (r) => flows.reduce((s, f, i) => s + f / Math.pow(1 + r, (i + 1) / 12), 0) - price;
  let lo = -0.9, hi = 20;
  if (pv(lo) < 0) return NaN;
  if (pv(hi) > 0) return hi;
  for (let k = 0; k < 200; k++) {
    const mid = (lo + hi) / 2;
    if (pv(mid) > 0) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

const expectedOf = (o, sold) => monthlyFlows(o).map((r) => r.expected).slice(0, sold * 12);

export function analyze(raw) {
  const o = { ...DEFAULTS, ...raw };
  const rows = monthlyFlows(o);
  const horizon = rows.length / 12;
  const warnings = [];
  if (!horizon) warnings.push("Enter how many years of royalty income to look at (1 to 60).");
  if (!nz(o.monthlyCheck)) warnings.push("Enter your current average monthly royalty check.");
  const offer = nz(o.offer);
  if (!offer) warnings.push("Enter the lump-sum offer to compare.");
  const sold = Math.min(Math.max(Math.floor(nz(o.soldYears)), 0) || horizon, horizon);
  const flows = rows.map((r) => r.expected);
  const soldFlows = flows.slice(0, sold * 12);
  const rate = nz(o.discountRate);
  const pvSold = presentValue(soldFlows, rate);
  const pvKept = presentValue([...Array(sold * 12).fill(0), ...flows.slice(sold * 12)], rate);
  const undiscounted = soldFlows.reduce((s, f) => s + f, 0);
  const irr = impliedReturn(offer, soldFlows);

  // Existing wells only: how much of the price rests on wells not yet drilled.
  const bareFlows = rows.map((r) => r.base).slice(0, sold * 12);
  const pvSoldBare = presentValue(bareFlows, rate);
  const irrBare = impliedReturn(offer, bareFlows);

  const lumpTax = offer ? Math.max(offer - nz(o.basis), 0) * (nz(o.lumpTaxPct) / 100) : 0;
  const offerAfterTax = offer - lumpTax;
  const afterTaxFlows = soldFlows.map((f) => f * (1 - nz(o.incomeTaxPct) / 100));
  const pvSoldAfterTax = presentValue(afterTaxFlows, rate);
  const irrAfterTax = impliedReturn(offerAfterTax, afterTaxFlows);

  const check = nz(o.monthlyCheck);
  const multiple = check ? offer / check : NaN; // buyers quote offers as "x months of income"
  let paybackMonth = null, run = 0;
  for (let i = 0; i < soldFlows.length; i++) {
    run += soldFlows[i];
    if (run >= offer) { paybackMonth = i + 1; break; }
  }
  const year1 = soldFlows.slice(0, 12).reduce((s, f) => s + f, 0);
  const halfLifeMonth = (() => {
    const first = flows[0] || 0;
    if (!first) return null;
    const i = flows.findIndex((f) => f <= first / 2);
    return i < 0 ? null : i + 1;
  })();

  const rates = [6, 8, 10, 12, 15, 20, 25].map((r) => ({ rate: r, pv: presentValue(soldFlows, r) }));
  // PV of the sold flow by discount rate (rows) and by how steeply the wells decline (columns).
  const declines = [20, 30, 40, 50, 65, 80];
  const gridRates = [8, 10, 12, 15, 20];
  const grid = gridRates.map((r) => ({
    rate: r,
    values: declines.map((d) => presentValue(expectedOf({ ...o, declineInitial: d }, sold), r)),
  }));
  const prices = [-40, -20, 0, 20, 40];
  const priceRow = prices.map((p) => ({ change: p, pv: presentValue(expectedOf({ ...o, priceChange: p }, sold), rate) }));

  return {
    horizon, sold, soldAll: sold >= horizon, rows, offer, rate,
    multiple, year1, halfLifeMonth, paybackMonth, undiscounted,
    pvSold, pvKept, pvSoldBare, offerVsPv: pvSold ? offer / pvSold : NaN, matchOffer: pvSold,
    gap: offer - pvSold, irr, irrBare,
    lumpTax, offerAfterTax, pvSoldAfterTax, irrAfterTax, afterTaxGap: offerAfterTax - pvSoldAfterTax,
    rates, declines, grid, priceRow, warnings,
  };
}
