// US freelancer tax set-aside, tax year 2026: self-employment tax, federal
// income tax (standard deduction, brackets, 20% QBI deduction below its
// threshold), a user-entered flat state rate, and the quarterly 1040-ES
// safe harbor. Bracket and deduction tables match the other 2026 tools in this
// repo (Rev. Proc. 2025-32); the IRS decides. Pure functions, no I/O.

export const TAX_YEAR = 2026;
export const BRACKETS = {
  single: [[12400, 0.10], [50400, 0.12], [105700, 0.22], [201775, 0.24], [256225, 0.32], [640600, 0.35], [Infinity, 0.37]],
  mfj: [[24800, 0.10], [100800, 0.12], [211400, 0.22], [403550, 0.24], [512450, 0.32], [768700, 0.35], [Infinity, 0.37]],
  hoh: [[17700, 0.10], [67450, 0.12], [105700, 0.22], [201775, 0.24], [256200, 0.32], [640600, 0.35], [Infinity, 0.37]],
};
export const STANDARD_DEDUCTION = { single: 16100, mfj: 32200, hoh: 24150 };
// Above this taxable income (before QBI) the 20% deduction is limited by wages
// and property for service businesses. Not modelled: no deduction is taken
// above it, which errs toward setting aside more.
export const QBI_LIMIT = { single: 201750, mfj: 403500, hoh: 201750 };
export const QBI_RATE = 0.2;
export const SS_WAGE_BASE = 184500;
export const SS_RATE = 0.124;
export const MEDICARE_RATE = 0.029;
export const ADDITIONAL_MEDICARE_RATE = 0.009;
export const ADDITIONAL_MEDICARE_THRESHOLD = { single: 200000, mfj: 250000, hoh: 200000 };
export const SE_FACTOR = 0.9235;
export const SE_MINIMUM = 400;
export const PENALTY_FLOOR = 1000;
export const DUE_DATES = ["April 15, 2026", "June 15, 2026", "September 15, 2026", "January 15, 2027"];

export const SAMPLE = {
  filingStatus: "single",
  revenue: "120000",
  expenses: "20000",
  w2Wages: "",
  otherIncome: "",
  stateRate: "5",
  qbi: "yes",
  priorYearTax: "",
};

const num = (v) => {
  const s = String(v ?? "").trim().replace(/[$,\s]/g, "");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
};
const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

export function incomeTax(taxable, status) {
  let tax = 0, lo = 0;
  for (const [hi, rate] of BRACKETS[status]) {
    if (taxable <= lo) break;
    tax += (Math.min(taxable, hi) - lo) * rate;
    lo = hi;
  }
  return r2(tax);
}

export function marginalRate(taxable, status) {
  for (const [hi, rate] of BRACKETS[status]) if (taxable < hi) return rate;
  return 0.37;
}

export function seTax(net, w2, status) {
  const earnings = net * SE_FACTOR;
  if (earnings < SE_MINIMUM) return { earnings, ss: 0, medicare: 0, additional: 0, total: 0, half: 0 };
  const ss = Math.min(earnings, Math.max(0, SS_WAGE_BASE - w2)) * SS_RATE;
  const medicare = earnings * MEDICARE_RATE;
  const t = ADDITIONAL_MEDICARE_THRESHOLD[status];
  const additional = Math.max(0, earnings - Math.max(0, t - w2)) * ADDITIONAL_MEDICARE_RATE;
  const total = r2(ss + medicare);
  return { earnings: r2(earnings), ss: r2(ss), medicare: r2(medicare), additional: r2(additional), total, half: r2(total / 2) };
}

// Everything that depends on profit, so the marginal set-aside on the next
// $1,000 invoiced is two calls of this and a subtraction.
function liability(net, p) {
  const se = seTax(net, p.w2, p.status);
  const agi = net - se.half + p.w2 + p.other;
  const std = STANDARD_DEDUCTION[p.status];
  const beforeQbi = Math.max(0, agi - std);
  let qbi = 0;
  if (p.qbi && beforeQbi <= QBI_LIMIT[p.status]) {
    const base = Math.max(0, net - se.half);
    qbi = r2(Math.min(base * QBI_RATE, beforeQbi * QBI_RATE));
  }
  const taxable = r2(beforeQbi - qbi);
  const federal = incomeTax(taxable, p.status);
  const state = r2(Math.max(0, net - se.half) * (p.stateRate / 100));
  const total = r2(se.total + se.additional + federal + state);
  return { se, agi: r2(agi), std, qbi, taxable, federal, state, total, bracket: marginalRate(taxable, p.status) };
}

export function compute(input) {
  const errors = [];
  const status = Object.hasOwn(BRACKETS, input.filingStatus) ? input.filingStatus : "single";
  const revenue = num(input.revenue);
  const expenses = num(input.expenses) ?? 0;
  const w2 = num(input.w2Wages) ?? 0;
  const other = num(input.otherIncome) ?? 0;
  const stateRate = num(input.stateRate) ?? 0;
  const prior = num(input.priorYearTax);
  if (revenue === null || Number.isNaN(revenue) || revenue < 0) errors.push("Enter your gross business revenue for the year (0 or more).");
  if (Number.isNaN(expenses) || expenses < 0) errors.push("Expenses must be 0 or more.");
  if (Number.isNaN(w2) || w2 < 0) errors.push("W-2 wages must be 0 or more.");
  if (Number.isNaN(other) || other < 0) errors.push("Other income must be 0 or more.");
  if (Number.isNaN(stateRate) || stateRate < 0 || stateRate > 20) errors.push("State tax rate must be between 0 and 20 percent.");
  if (Number.isNaN(prior) || (prior !== null && prior < 0)) errors.push("Last year's total tax must be 0 or more.");
  if (errors.length) return { errors };

  const p = { status, w2, other, stateRate, qbi: input.qbi !== "no" };
  const net = r2(Math.max(0, revenue - expenses));
  const L = liability(net, p);
  const next = liability(net + 1000, p);
  const marginalPer1000 = r2(next.total - L.total);
  const total = L.total;
  const setAsidePct = revenue > 0 ? r2((total / revenue) * 100) : 0;
  const setAsideOfNet = net > 0 ? r2((total / net) * 100) : 0;
  const quarter = r2(total / 4);
  const findings = [];
  const out = {
    errors: [], status, revenue, expenses, net, ...L, setAsidePct, setAsideOfNet, quarter,
    afterTax: r2(net - total), monthly: r2(total / 12), perThousand: r2((total / Math.max(revenue, 1)) * 1000),
    marginalPer1000, findings,
  };

  findings.push({ severity: "high", title: `Set aside about $${total.toFixed(2)} (${setAsidePct}% of revenue, ${setAsideOfNet}% of profit): $${r2(L.se.total + L.se.additional).toFixed(2)} self-employment tax, $${L.federal.toFixed(2)} federal income tax and $${L.state.toFixed(2)} state. That is roughly $${out.perThousand.toFixed(0)} from every $1,000 you invoice, and $${marginalPer1000.toFixed(0)} from your next $1,000 of profit.` });
  if (total >= PENALTY_FLOOR) {
    const safe = prior !== null && prior > 0 ? prior * (L.agi > 150000 ? 1.1 : 1) : null;
    const ninety = r2(total * 0.9);
    const needed = safe !== null ? Math.min(ninety, r2(safe)) : ninety;
    findings.push({ severity: "medium", title: `You probably owe $${PENALTY_FLOOR.toLocaleString("en-US")} or more after withholding, so the IRS expects estimated payments (Form 1040-ES) on ${DUE_DATES.join(", ")}. Paying at least $${needed.toFixed(2)} in total (${safe !== null && safe < ninety ? "100%/110% of last year's tax" : "90% of this year's tax"}) avoids the underpayment penalty; the even split is about $${r2(needed / 4).toFixed(2)} per quarter. If you have W-2 withholding, it counts toward this.` });
  }
  if (!p.qbi) findings.push({ severity: "info", title: "The 20% qualified business income deduction is switched off, so the federal figure is higher than most sole proprietors will see." });
  else if (L.qbi === 0 && net > 0) findings.push({ severity: "info", title: `Taxable income is above the $${QBI_LIMIT[status].toLocaleString("en-US")} line where the QBI deduction is limited by business type, wages and property. This tool takes no QBI deduction there, which errs toward saving more. A tax professional can tell you what you qualify for.` });
  if (L.se.additional > 0) findings.push({ severity: "info", title: `Additional Medicare Tax of $${L.se.additional.toFixed(2)} (0.9%) is included because earnings pass $${ADDITIONAL_MEDICARE_THRESHOLD[status].toLocaleString("en-US")}.` });
  findings.push({ severity: "info", title: "State tax is a flat share of profit after half of self-employment tax, using the rate you entered. Real state brackets, local tax and credits differ, so treat it as a planning number." });
  return out;
}

export function summaryText(r) {
  const L = [];
  L.push(`US freelancer tax set-aside, ${TAX_YEAR} tax year (${r.status.toUpperCase()})`);
  L.push(`Revenue $${r.revenue.toFixed(2)}, expenses $${r.expenses.toFixed(2)}, net $${r.net.toFixed(2)}`);
  L.push(`Self-employment tax: $${r2(r.se.total + r.se.additional).toFixed(2)}`);
  L.push(`QBI deduction: $${r.qbi.toFixed(2)}; taxable income $${r.taxable.toFixed(2)} (${Math.round(r.bracket * 100)}% bracket)`);
  L.push(`Federal income tax: $${r.federal.toFixed(2)}`);
  L.push(`State (estimate): $${r.state.toFixed(2)}`);
  L.push(`Set aside: $${r.total.toFixed(2)} (${r.setAsidePct}% of revenue, $${r.monthly.toFixed(2)} a month, about $${r.quarter.toFixed(2)} a quarter)`);
  L.push("Verify figures on irs.gov. Not tax advice.");
  return L.join("\n");
}
