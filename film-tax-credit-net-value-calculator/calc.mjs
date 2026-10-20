// Film and TV production tax-credit net-value evaluator. Pure functions, no dependencies, nothing leaves
// the browser. Every rate, cap and threshold is typed by the user from their own incentive programme's
// guidelines; this file embeds no state, country or programme data.
//
// Model:
//   qualified    = budget x qualified-spend share (spend that counts under the programme)
//   upliftBase   = qualified x uplift share (e.g. resident crew or a regional zone) earns the extra uplift rate
//   gross        = qualified x base rate + upliftBase x uplift rate        (0 if qualified < programme minimum)
//   granted      = min(gross, per-project cap)       (cap 0 means no cap)
//   cash         = granted x sale price (100% if the credit is refunded, less if sold or transferred)
//   fees         = granted x broker/legal/audit fee share + fixed audit cost
//   bridge cost  = advance x granted x bridge rate x years to cash   (interest on borrowing against the credit)
//   net now      = (cash - fees - bridge cost) discounted at the producer's cost of capital for the wait

export const DEFAULTS = {
  budget: 4000000,
  qualifiedPct: 62,
  baseRatePct: 25,
  upliftSharePct: 20,
  upliftRatePct: 10,
  minSpend: 250000,
  capAmount: 0,
  salePricePct: 90,
  feePct: 3,
  fixedCost: 15000,
  monthsToCash: 9,
  bridgeAdvancePct: 70,
  bridgeRatePct: 12,
  costOfCapitalPct: 10,
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

export function credit(o) {
  const budget = nz(o.budget);
  const qualified = budget * Math.min(nz(o.qualifiedPct), 100) / 100;
  const upliftBase = qualified * Math.min(nz(o.upliftSharePct), 100) / 100;
  const belowMin = nz(o.minSpend) > 0 && qualified < nz(o.minSpend);
  const gross = belowMin ? 0 : qualified * nz(o.baseRatePct) / 100 + upliftBase * nz(o.upliftRatePct) / 100;
  const cap = nz(o.capAmount);
  const capped = cap > 0 && gross > cap;
  const granted = capped ? cap : gross;
  const salePrice = Math.min(nz(o.salePricePct), 100) / 100;
  const cash = granted * salePrice;
  const discountLost = granted - cash;
  const fees = granted > 0 ? granted * nz(o.feePct) / 100 + nz(o.fixedCost) : 0;
  const years = nz(o.monthsToCash) / 12;
  const advance = granted * Math.min(nz(o.bridgeAdvancePct), 100) / 100;
  const bridgeCost = advance * nz(o.bridgeRatePct) / 100 * years;
  const received = cash - fees - bridgeCost;
  const netPv = received / Math.pow(1 + nz(o.costOfCapitalPct) / 100, years);
  const headline = qualified * nz(o.baseRatePct) / 100;
  return { budget, qualified, belowMin, gross, granted, capped, cash, discountLost, fees, bridgeCost, received, netPv, years, headline,
    grantedPctBudget: budget ? granted / budget : NaN,
    netPctBudget: budget ? received / budget : NaN,
    netPvPctBudget: budget ? netPv / budget : NaN,
    centsPerCredit: granted > 0 ? received / granted : NaN,
    leak: granted > 0 ? 1 - received / granted : NaN };
}

// What one more qualified dollar is worth to the budget, found by perturbing the real model.
export function marginalDollar(o) {
  const base = credit(o);
  if (!base.budget) return NaN;
  const bump = 10000;
  const qp = nz(o.qualifiedPct);
  const more = credit({ ...o, qualifiedPct: Math.min(100, qp + bump / base.budget * 100) });
  const spent = more.qualified - base.qualified;
  return spent > 0 ? (more.received - base.received) / spent : NaN;
}

// Qualified share at which the programme starts to pay (minimum threshold met and net received above zero).
export function breakEvenQualifiedPct(o) {
  const at = (p) => credit({ ...o, qualifiedPct: p }).received;
  if (at(100) <= 0) return null;
  let lo = 0, hi = 100;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (at(mid) > 0) hi = mid; else lo = mid;
  }
  return hi;
}

export function analyze(o) {
  const warnings = [];
  const w = (c, m) => { if (c) warnings.push(m); };
  w(!(nz(o.budget) > 0), "Enter the total production budget.");
  w(nz(o.qualifiedPct) > 100, "Qualified spend share is over 100%; it was treated as 100%.");
  w(nz(o.salePricePct) > 100, "A credit cannot sell above face value here; it was treated as 100%.");
  w(nz(o.salePricePct) === 0, "Sale price is 0%: the credit is worth nothing in cash. Enter 100 if your programme refunds it directly.");
  w(nz(o.baseRatePct) === 0, "Base credit rate is 0%, so there is no credit to value.");
  w(nz(o.upliftSharePct) > 0 && nz(o.upliftRatePct) === 0, "You gave an uplift share but a 0% uplift rate; the uplift adds nothing.");
  const r = credit(o);
  if (!(r.budget > 0)) return { warnings, r, rows: [] };
  w(r.belowMin, "Qualified spend is under the programme minimum you typed, so the model pays no credit at all.");
  w(r.capped, "The per-project cap binds: extra qualified spend adds nothing past this point.");
  w(r.granted > 0 && r.received < 0, "Fees and financing cost more than the credit is worth at these inputs.");
  const marginal = marginalDollar(o);
  const be = breakEvenQualifiedPct(o);
  const shares = [30, 45, 60, 75, 90].map((p) => ({ p }));
  const prices = [80, 85, 90, 95, 100];
  const grid = shares.map((s) => ({
    share: s.p,
    values: prices.map((sp) => credit({ ...o, qualifiedPct: s.p, salePricePct: sp }).received),
  }));
  const waits = [3, 6, 9, 12, 18, 24].map((m) => ({ months: m, ...credit({ ...o, monthsToCash: m }) }));
  const rows = [
    ["Qualified spend", r.qualified],
    ["Credit before cap", r.gross],
    ["Credit granted", r.granted],
    ["Cash if sold or transferred", r.cash],
    ["Fees and audit", -r.fees],
    ["Bridge-loan interest", -r.bridgeCost],
    ["Net cash into the budget", r.received],
  ];
  return { warnings, r, rows, marginal, breakEvenPct: be, prices, grid, waits };
}
