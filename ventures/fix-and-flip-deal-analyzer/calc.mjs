// Fix-and-flip deal analysis: profit, cash needed, return on cash, maximum
// allowable offer and break-even sale price for a single renovation flip
// financed with a hard-money loan. Pure functions, no I/O. Not financial advice.
//
// Model (all figures are the visitor's own inputs):
//   loan on purchase = LTV% of purchase price
//   loan on rehab    = financed% of the rehab budget, drawn evenly across the
//                      rehab period (average balance = half during rehab)
//   interest         = rate/12 x balance x months, interest paid monthly
//   points           = points% x (purchase loan + rehab loan)
//   sale costs       = agent/closing % of sale price
//   profit           = sale price - every cost (before income tax)
//   cash needed      = all costs before sale minus loan principal
//
// Not modelled: income tax (short-term gains are taxed as ordinary income),
// transfer taxes that differ by state, draw fees, appraisal or inspection
// costs beyond the closing figure entered, lender minimum-interest clauses,
// extension fees, and any change in market price while the property is held.

export const FIELDS = [
  "arv", "purchase", "rehab", "contingency", "rehabMonths", "saleMonths",
  "buyClosing", "ltv", "rehabFinanced", "rate", "points",
  "monthlyHolding", "sellPct", "otherCosts", "targetProfitPct", "targetProfitMin",
];
export const fieldNames = () => FIELDS.slice();

export function num(v) {
  const s = String(v ?? "").replace(/[$,%\s,]/g, "");
  if (s === "") return NaN;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

export function money(v) {
  if (!Number.isFinite(v)) return "n/a";
  const r = Math.round(v);
  return (r < 0 ? "-$" : "$") + Math.abs(r).toLocaleString("en-US");
}

export const pct = (v) => (Number.isFinite(v) ? (v * 100).toFixed(1) + "%" : "n/a");

export function samplePlan() {
  return {
    arv: "340000", purchase: "185000", rehab: "55000", contingency: "10",
    rehabMonths: "4", saleMonths: "2", buyClosing: "3500",
    ltv: "85", rehabFinanced: "100", rate: "11", points: "2",
    monthlyHolding: "650", sellPct: "7", otherCosts: "2000",
    targetProfitPct: "15", targetProfitMin: "30000",
  };
}

const RANGES = {
  arv: [1, 1e8], purchase: [0, 1e8], rehab: [0, 1e8], contingency: [0, 100],
  rehabMonths: [0, 60], saleMonths: [0, 60], buyClosing: [0, 1e7],
  ltv: [0, 100], rehabFinanced: [0, 100], rate: [0, 40], points: [0, 15],
  monthlyHolding: [0, 1e6], sellPct: [0, 30], otherCosts: [0, 1e7],
  targetProfitPct: [0, 100], targetProfitMin: [0, 1e8],
};
const LABELS = {
  arv: "After-repair value", purchase: "Purchase price", rehab: "Rehab budget",
  contingency: "Contingency", rehabMonths: "Rehab months", saleMonths: "Months to sell",
  buyClosing: "Buying closing costs", ltv: "Loan-to-purchase", rehabFinanced: "Rehab financed",
  rate: "Interest rate", points: "Points", monthlyHolding: "Monthly holding costs",
  sellPct: "Selling costs", otherCosts: "Other costs", targetProfitPct: "Target profit %",
  targetProfitMin: "Minimum target profit",
};

export function parsePlan(input) {
  const p = {};
  for (const f of FIELDS) {
    const v = num(input[f]);
    if (Number.isNaN(v)) return { error: `${LABELS[f]} needs a number.` };
    const [lo, hi] = RANGES[f];
    if (v < lo || v > hi) return { error: `${LABELS[f]} must be between ${lo.toLocaleString("en-US")} and ${hi.toLocaleString("en-US")}.` };
    p[f] = v;
  }
  return { p };
}

// Full cost stack for one set of assumptions. `sale` defaults to the ARV.
export function dealCosts(p, over = {}) {
  const q = { ...p, ...over };
  const sale = over.sale ?? q.arv;
  const months = q.rehabMonths + q.saleMonths;
  const rehabTotal = q.rehab * (1 + q.contingency / 100);
  const purchaseLoan = q.purchase * q.ltv / 100;
  const rehabLoan = q.rehab * q.rehabFinanced / 100; // contingency is paid in cash
  const interest = (q.rate / 100 / 12) * (purchaseLoan * months + rehabLoan * (q.rehabMonths / 2 + q.saleMonths));
  const points = (q.points / 100) * (purchaseLoan + rehabLoan);
  const holding = q.monthlyHolding * months;
  const selling = sale * q.sellPct / 100;
  const beforeSale = q.purchase + q.buyClosing + rehabTotal + interest + points + holding + q.otherCosts;
  const total = beforeSale + selling;
  const loan = purchaseLoan + rehabLoan;
  const profit = sale - total;
  const cash = Math.max(beforeSale - loan, 0);
  return {
    sale, months, rehabTotal, purchaseLoan, rehabLoan, loan, interest, points, holding,
    selling, beforeSale, total, profit, cash,
    roi: cash > 0 ? profit / cash : NaN,
    annualizedRoi: cash > 0 && months > 0 && profit > -cash ? Math.pow(1 + profit / cash, 12 / months) - 1 : NaN,
  };
}

function bisect(fn, lo, hi) {
  // fn is increasing; find x with fn(x) = 0. Returns null when no root in range.
  if (fn(lo) > 0) return null;
  if (fn(hi) < 0) return hi;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (fn(mid) < 0) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

export const targetProfit = (p) => Math.max(p.arv * p.targetProfitPct / 100, p.targetProfitMin);

// Highest purchase price that still leaves the target profit.
export function maxOffer(p) {
  return solveDown(p, targetProfit(p));
}

// profit falls as purchase rises, so bisect on the purchase price directly.
function solveDown(p, t) {
  let lo = 0, hi = p.arv;
  if (dealCosts(p, { purchase: lo }).profit < t) return null;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (dealCosts(p, { purchase: mid }).profit >= t) lo = mid; else hi = mid;
  }
  return lo;
}

// Lowest sale price at which the deal makes no profit.
export function breakEvenSale(p) {
  return bisect((x) => dealCosts(p, { sale: x }).profit, 0, p.arv * 3);
}

export const ARV_STEPS = [-0.15, -0.10, -0.05, 0, 0.05];
export const MONTH_STEPS = [0, 1, 2, 3, 4, 6];

export function analyze(input) {
  const parsed = parsePlan(input);
  if (parsed.error) return { error: parsed.error };
  const p = parsed.p;
  const base = dealCosts(p);
  const target = targetProfit(p);
  const mao = maxOffer(p);
  const be = breakEvenSale(p);
  const rule70 = 0.7 * p.arv - p.rehab;
  const arvRows = ARV_STEPS.map((s) => {
    const c = dealCosts(p, { sale: p.arv * (1 + s) });
    return { step: s, sale: c.sale, profit: c.profit, roi: c.roi };
  });
  const monthRows = MONTH_STEPS.map((m) => {
    const c = dealCosts(p, { saleMonths: p.saleMonths + m });
    return { extra: m, months: c.months, profit: c.profit, roi: c.roi, annualizedRoi: c.annualizedRoi };
  });
  const monthsToZero = base.profit > 0 ? monthsUntilZero(p) : 0;
  return {
    p, base, target, mao, breakEven: be, rule70,
    meetsTarget: base.profit >= target,
    overpayBy: mao == null ? null : p.purchase - mao,
    marginOfSafety: be != null && p.arv > 0 ? (p.arv - be) / p.arv : NaN,
    arvRows, monthRows, monthsToZero,
  };
}

function monthsUntilZero(p) {
  // Extra months on the market that eat the whole profit.
  const f = (m) => dealCosts(p, { saleMonths: p.saleMonths + m }).profit;
  if (f(120) > 0) return null;
  let lo = 0, hi = 120;
  for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (f(mid) > 0) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}

const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
export function reportCsv(r) {
  const lines = ["section,label,value"];
  const b = r.base;
  const add = (l, v) => lines.push(`summary,${q(l)},${Math.round(v * 100) / 100}`);
  add("After-repair value", r.p.arv); add("Purchase price", r.p.purchase);
  add("Total cost including selling", b.total); add("Profit before income tax", b.profit);
  add("Cash needed", b.cash); add("Interest", b.interest); add("Points", b.points);
  if (r.mao != null) add("Maximum offer for target profit", r.mao);
  if (r.breakEven != null) add("Break-even sale price", r.breakEven);
  for (const x of r.arvRows) lines.push(`sale price,${q(Math.round(x.step * 100) + "%")},${Math.round(x.profit)}`);
  for (const x of r.monthRows) lines.push(`extra months on market,${x.extra},${Math.round(x.profit)}`);
  return lines.join("\n") + "\n";
}
