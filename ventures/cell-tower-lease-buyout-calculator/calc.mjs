// Cell tower / rooftop / ground lease buyout evaluator. Pure functions, no dependencies, nothing
// leaves the browser. Everything is arithmetic on figures the user types from their own lease and
// from the lump-sum offer they received.
//
// Model, annual cash flows, received at the end of each year t = 1..horizon:
//   rent_t        = monthly rent x 12 x (1 + escalator)^(t-1)
//   colocation_t  = colocation monthly rent x 12 x (1 + escalator)^(t - colocYear) once t >= colocYear
//   expected_t    = (rent_t + colocation_t) x (1 - churn)^t      (chance the tenant is still paying)
// The offer buys years 1..offerYears of that stream (offerYears >= horizon sells the lot); the
// landowner keeps the rest. Present value discounts at the user's own rate. The implied return is
// the discount rate at which the sold cash flows are worth exactly the offer (an IRR).
// After tax: the lump sum is taxed at the typed rate on (offer - basis); rent at the typed ordinary rate.

export const DEFAULTS = {
  monthlyRent: 2400,
  escalator: 3,
  colocRent: 1200,
  colocYear: 4,
  churn: 1,
  horizon: 40,
  offerYears: 25,
  offer: 330000,
  discountRate: 7,
  basis: 0,
  lumpTaxPct: 20,
  rentTaxPct: 30,
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

// Expected cash flow per year (index 0 = year 1), before tax.
export function cashFlows(o) {
  const horizon = Math.min(Math.max(Math.floor(nz(o.horizon)), 0), 99);
  const g = nz(o.escalator) / 100;
  const churn = Math.min(nz(o.churn) / 100, 1);
  const colocYear = Math.max(Math.floor(nz(o.colocYear)), 1);
  const rows = [];
  for (let t = 1; t <= horizon; t++) {
    const rent = nz(o.monthlyRent) * 12 * Math.pow(1 + g, t - 1);
    const coloc = nz(o.colocRent) > 0 && t >= colocYear ? nz(o.colocRent) * 12 * Math.pow(1 + g, t - colocYear) : 0;
    const survive = Math.pow(1 - churn, t);
    rows.push({ year: t, rent, coloc, survive, expected: (rent + coloc) * survive });
  }
  return rows;
}

export function presentValue(flows, ratePct) {
  const r = nz(ratePct) / 100;
  return flows.reduce((s, f, i) => s + f / Math.pow(1 + r, i + 1), 0);
}

// Discount rate at which `flows` are worth `price`; bisection, null when no rate exists.
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
  if (!horizon) warnings.push("Enter how many years of rent to look at (1 to 99).");
  if (!nz(o.monthlyRent)) warnings.push("Enter your current monthly rent.");
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

  // Without the colocation stream, to show how much of the value rests on carriers not yet signed.
  const bare = cashFlows({ ...o, colocRent: 0 }).map((r) => r.expected).slice(0, sold);
  const pvSoldBare = presentValue(bare, rate);
  const irrBare = impliedReturn(offer, bare);

  // After tax.
  const lumpTax = offer ? Math.max(offer - nz(o.basis), 0) * (nz(o.lumpTaxPct) / 100) : 0;
  const offerAfterTax = offer - lumpTax;
  const afterTaxFlows = soldFlows.map((f) => f * (1 - nz(o.rentTaxPct) / 100));
  const pvSoldAfterTax = presentValue(afterTaxFlows, rate);
  const irrAfterTax = impliedReturn(offerAfterTax, afterTaxFlows);

  const yr1 = rows[0] ? rows[0].rent + rows[0].coloc : 0;
  const multiple = yr1 ? offer / yr1 : NaN;
  let paybackYear = null, run = 0;
  for (let i = 0; i < soldFlows.length; i++) {
    run += soldFlows[i];
    if (run >= offer) { paybackYear = i + 1; break; }
  }

  // The offer that would match your own discount rate, and a range around it.
  const matchOffer = pvSold;
  const rates = [4, 5, 6, 7, 8, 9, 10, 12].map((r) => ({ rate: r, pv: presentValue(soldFlows, r) }));

  // PV of the sold stream by discount rate (rows) and yearly chance the tenant leaves (columns).
  const churns = [0, 1, 2, 3, 5, 8];
  const grid = [rate - 2, rate - 1, rate, rate + 1, rate + 2].filter((r) => r > 0).map((r) => ({
    rate: r,
    values: churns.map((c) => presentValue(cashFlows({ ...o, churn: c }).map((x) => x.expected).slice(0, sold), r)),
  }));

  return {
    horizon, sold, soldAll: sold >= horizon, rows, offer, rate,
    firstYearIncome: yr1, multiple, paybackYear, undiscounted,
    pvSold, pvKept, pvSoldBare, matchOffer, offerVsPv: pvSold ? offer / pvSold : NaN,
    gap: offer - pvSold, irr, irrBare,
    lumpTax, offerAfterTax, pvSoldAfterTax, irrAfterTax, afterTaxGap: offerAfterTax - pvSoldAfterTax,
    rates, churns, grid, warnings,
  };
}
