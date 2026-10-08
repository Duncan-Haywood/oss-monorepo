// Oil and gas mineral / royalty interest offer evaluator. Pure functions, no dependencies, nothing
// leaves the browser. Everything is arithmetic on figures the user types from their own royalty
// statements and from the lump-sum offer they received.
//
// Model, annual cash flows, received at the end of each year t = 1..horizon:
//   existing_t = monthly royalty x 12 x (1 - decline)^(t-1) x (1 + priceChange)^(t-1)
//   newWell_t  = chance x newWell monthly x 12 x (1 - decline)^(t - newYear) x (1 + priceChange)^(t-1)
//                once t >= newYear (a well not yet drilled, weighted by the chance it is)
// The offer buys years 1..offerYears of that stream (offerYears >= horizon sells everything);
// the owner keeps the rest. Present value discounts at the user's own rate. The implied return is
// the discount rate at which the sold cash flows are worth exactly the offer (an IRR).
// After tax: the lump sum is taxed at the typed rate on (offer - basis); royalties at the typed rate.

export const DEFAULTS = {
  monthlyRoyalty: 3200,
  decline: 18,
  priceChange: 0,
  newWellRoyalty: 1800,
  newWellYear: 3,
  newWellChance: 40,
  horizon: 30,
  offerYears: 30,
  offer: 150000,
  discountRate: 12,
  basis: 0,
  lumpTaxPct: 20,
  royaltyTaxPct: 30,
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

// Expected royalty per year (index 0 = year 1), before tax.
export function cashFlows(o) {
  const horizon = Math.min(Math.max(Math.floor(nz(o.horizon)), 0), 99);
  const d = Math.min(nz(o.decline) / 100, 1);
  const p = Math.max(Number.isFinite(o.priceChange) ? o.priceChange : 0, -100) / 100;
  const chance = Math.min(nz(o.newWellChance) / 100, 1);
  const newYear = Math.max(Math.floor(nz(o.newWellYear)), 1);
  const rows = [];
  for (let t = 1; t <= horizon; t++) {
    const price = Math.pow(1 + p, t - 1);
    const existing = nz(o.monthlyRoyalty) * 12 * Math.pow(1 - d, t - 1) * price;
    const fresh = nz(o.newWellRoyalty) > 0 && t >= newYear
      ? chance * nz(o.newWellRoyalty) * 12 * Math.pow(1 - d, t - newYear) * price
      : 0;
    rows.push({ year: t, existing, fresh, expected: existing + fresh });
  }
  return rows;
}

export function presentValue(flows, ratePct) {
  const r = nz(ratePct) / 100;
  return flows.reduce((s, f, i) => s + f / Math.pow(1 + r, i + 1), 0);
}

// Discount rate at which `flows` are worth `price`; bisection, NaN when no rate exists.
export function impliedReturn(price, flows) {
  if (!(price > 0) || !flows.length) return NaN;
  const total = flows.reduce((s, f) => s + f, 0);
  if (total <= 0) return NaN;
  const pv = (r) => flows.reduce((s, f, i) => s + f / Math.pow(1 + r, i + 1), 0) - price;
  let lo = -0.9, hi = 5;
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
  const rows = cashFlows(o);
  const horizon = rows.length;
  const warnings = [];
  if (!horizon) warnings.push("Enter how many years of royalties to look at (1 to 99).");
  if (!nz(o.monthlyRoyalty) && !nz(o.newWellRoyalty)) warnings.push("Enter your current monthly royalty.");
  const offer = nz(o.offer);
  if (!offer) warnings.push("Enter the lump-sum offer to compare.");
  const sold = Math.min(Math.max(Math.floor(nz(o.offerYears)), 0) || horizon, horizon);
  const flows = rows.map((r) => r.expected);
  const soldFlows = flows.slice(0, sold);
  const keptFlows = flows.slice(sold);

  const rate = nz(o.discountRate);
  const pvSold = presentValue(soldFlows, rate);
  const pvKept = presentValue([...Array(sold).fill(0), ...keptFlows], rate);
  const undiscounted = soldFlows.reduce((s, f) => s + f, 0);
  const irr = impliedReturn(offer, soldFlows);

  // Without the undrilled well, to show how much of the value rests on a well that does not exist yet.
  const bare = rows.map((r) => r.existing).slice(0, sold);
  const pvSoldBare = presentValue(bare, rate);
  const irrBare = impliedReturn(offer, bare);

  // After tax.
  const lumpTax = offer ? Math.max(offer - nz(o.basis), 0) * (nz(o.lumpTaxPct) / 100) : 0;
  const offerAfterTax = offer - lumpTax;
  const afterTaxFlows = soldFlows.map((f) => f * (1 - nz(o.royaltyTaxPct) / 100));
  const pvSoldAfterTax = presentValue(afterTaxFlows, rate);
  const irrAfterTax = impliedReturn(offerAfterTax, afterTaxFlows);

  const yr1 = rows[0] ? rows[0].expected : 0;
  const multiple = yr1 ? offer / yr1 : NaN;
  let paybackYear = null, run = 0;
  for (let i = 0; i < soldFlows.length; i++) {
    run += soldFlows[i];
    if (run >= offer) { paybackYear = i + 1; break; }
  }

  const matchOffer = pvSold;
  const rates = [8, 10, 12, 15, 18, 20, 25].map((r) => ({ rate: r, pv: presentValue(soldFlows, r) }));

  // PV of the sold stream by discount rate (rows) and yearly production decline (columns).
  const declines = [8, 12, 18, 25, 35, 50];
  const grid = [rate - 4, rate - 2, rate, rate + 3, rate + 6].filter((r) => r > 0).map((r) => ({
    rate: r,
    values: declines.map((dc) => presentValue(cashFlows({ ...o, decline: dc }).map((x) => x.expected).slice(0, sold), r)),
  }));

  return {
    horizon, sold, soldAll: sold >= horizon, rows, offer, rate,
    firstYearIncome: yr1, multiple, paybackYear, undiscounted,
    pvSold, pvKept, pvSoldBare, matchOffer, offerVsPv: pvSold ? offer / pvSold : NaN,
    gap: offer - pvSold, irr, irrBare,
    lumpTax, offerAfterTax, pvSoldAfterTax, irrAfterTax, afterTaxGap: offerAfterTax - pvSoldAfterTax,
    rates, declines, grid, warnings,
  };
}
