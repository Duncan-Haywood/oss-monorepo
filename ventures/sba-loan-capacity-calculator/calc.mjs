// SBA loan capacity calculator: pure functions, no dependencies, nothing leaves the browser.
// A lender sizes a small-business loan backwards from cash flow: cash available for debt service (CFADS), divided by the
// minimum debt-service-coverage ratio (DSCR), minus the debt you already carry, is the most new yearly payment the
// business can support. That payment is turned into a principal with the annuity formula. Fee %, rate, term, equity
// injection and the DSCR floor are all inputs, because they differ by lender, program and year.

export function num(v) {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/[$,%\s]/g, ""));
  return Number.isFinite(n) ? n : NaN;
}
export const money = (n) => (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");
export const ratio = (n) => (Number.isFinite(n) ? n.toFixed(2) + "x" : "n/a");

export const DEFAULTS = {
  netIncome: 120000, interestExpense: 8000, depreciation: 22000, otherAddBacks: 6000,
  ownerCompAdjustment: -60000, maintenanceCapex: 10000,
  existingDebtService: 18000,
  otherHouseholdIncome: 45000, livingExpenses: 54000, personalDebtService: 14000,
  requiredDscr: 1.25, ratePct: 10.5, termYears: 10, feePct: 3.5,
  requestedLoan: 450000, projectCost: 500000, equityPct: 10,
};

// Level monthly payment on `principal` at annual `ratePct` over `years`.
export function monthlyPayment(principal, ratePct, years) {
  const n = Math.round(years * 12);
  if (!(principal > 0) || !(n > 0)) return 0;
  const r = ratePct / 100 / 12;
  return r === 0 ? principal / n : (principal * r) / (1 - Math.pow(1 + r, -n));
}
// Inverse: the principal a level monthly payment retires.
export function principalFromMonthly(pmt, ratePct, years) {
  const n = Math.round(years * 12);
  if (!(pmt > 0) || !(n > 0)) return 0;
  const r = ratePct / 100 / 12;
  return r === 0 ? pmt * n : (pmt * (1 - Math.pow(1 + r, -n))) / r;
}
export const annualDebtService = (principal, ratePct, years) => monthlyPayment(principal, ratePct, years) * 12;

// Cash flow available for debt service: net income with interest, depreciation and one-off add-backs restored, owner
// pay adjusted to a market wage (negative lowers it), and maintenance capex taken off.
export function cashFlowAvailable(o) {
  return o.netIncome + o.interestExpense + o.depreciation + o.otherAddBacks + o.ownerCompAdjustment - o.maintenanceCapex;
}

// Coverage on the business alone, and "global" coverage that also counts the owner's household.
export function coverage(o, newDebtService, cfads = cashFlowAvailable(o)) {
  const total = newDebtService + o.existingDebtService;
  const business = total > 0 ? cfads / total : Infinity;
  const globalDs = total + o.personalDebtService;
  const globalCash = cfads + o.otherHouseholdIncome - o.livingExpenses;
  const global = globalDs > 0 ? globalCash / globalDs : Infinity;
  return { business, global, globalCash };
}

// Largest loan that still clears `requiredDscr` on the business, at the given rate and term. Fee is a % of the loan
// taken out of what you receive, so net proceeds = loan x (1 - fee).
export function maxLoan(o, over = {}) {
  const p = { ...o, ...over };
  const cfads = cashFlowAvailable(p);
  const roomYear = cfads / p.requiredDscr - p.existingDebtService;
  if (!(roomYear > 0)) return { loan: 0, netProceeds: 0, roomYear: Math.min(0, roomYear), payment: 0, cfads };
  const loan = principalFromMonthly(roomYear / 12, p.ratePct, p.termYears);
  return { loan, netProceeds: loan * (1 - p.feePct / 100), roomYear, payment: roomYear / 12, cfads };
}

// How a requested loan measures up.
export function assess(o) {
  const cfads = cashFlowAvailable(o);
  const pmt = monthlyPayment(o.requestedLoan, o.ratePct, o.termYears);
  const ds = pmt * 12;
  const cov = coverage(o, ds, cfads);
  const fee = o.requestedLoan * o.feePct / 100;
  const equity = o.projectCost * o.equityPct / 100;
  const net = o.requestedLoan - fee;
  // Cash the owner must bring: everything the loan, after its fee, does not cover. Never below the equity-injection floor.
  const cashIn = Math.max(equity, o.projectCost - net);
  const totalInterest = pmt * Math.round(o.termYears * 12) - o.requestedLoan;
  // Fall in cash flow, in %, that takes business coverage down to the floor (negative = already below it).
  const needed = o.requiredDscr * (ds + o.existingDebtService);
  const cushionPct = cfads > 0 ? (1 - needed / cfads) * 100 : -100;
  return {
    cfads, monthly: pmt, yearly: ds, fee, netProceeds: net, equity, cashIn, totalInterest,
    businessDscr: cov.business, globalDscr: cov.global, passes: cov.business >= o.requiredDscr,
    globalPasses: cov.global >= 1.0, cushionPct, fundsProject: net + cashIn >= o.projectCost - 0.5,
  };
}

const TERMS = [5, 7, 10, 15, 25];
export function termGrid(o) {
  return TERMS.map((t) => ({ termYears: t, ...maxLoan(o, { termYears: t }) }));
}
export function rateGrid(o) {
  return [-2, -1, 0, 1, 2].map((d) => {
    const ratePct = Math.max(0, o.ratePct + d);
    return { delta: d, ratePct, ...maxLoan(o, { ratePct }) };
  });
}
// Re-run capacity with cash flow lower by each %, to show how a soft year shrinks what a lender will approve.
export function cashFlowStress(o) {
  return [0, 10, 20, 30].map((cut) => {
    const base = cashFlowAvailable(o);
    const adj = { ownerCompAdjustment: o.ownerCompAdjustment - (base * cut) / 100 };
    return { cut, ...maxLoan(o, adj) };
  });
}
// Annual cash flow needed to carry the requested loan at the floor.
export function cashFlowNeeded(o) {
  return o.requiredDscr * (annualDebtService(o.requestedLoan, o.ratePct, o.termYears) + o.existingDebtService);
}
