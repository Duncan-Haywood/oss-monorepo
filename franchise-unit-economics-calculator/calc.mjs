// Franchise unit economics. Pure functions, no dependencies, nothing leaves the browser.
// Every default is a placeholder, not a market figure: take each number from the franchisor's
// Franchise Disclosure Document, your lease and lender quotes, and your own market.

export const DEFAULTS = {
  franchiseFee: 40000,
  buildout: 250000,
  equipment: 80000,
  workingCapital: 40000,
  loanAmount: 280000,
  loanRatePct: 10.5,
  loanYears: 10,
  annualRevenue: 900000,
  rampStartPct: 40,
  rampMonths: 12,
  growthPct: 3,
  cogsPct: 30,
  laborPct: 25,
  otherVarPct: 3,
  fixedMonthly: 14000,
  operatorPayMonthly: 5000,
  costEscPct: 2.5,
  royaltyPct: 6,
  royaltyMinMonthly: 0,
  adFundPct: 2,
  techFeeMonthly: 400,
  years: 10,
  exitMultiple: 0,
  targetCashFlow: 50000,
  indepRevenuePct: 75,
  indepMarketingPct: 3,
};

export function num(v) {
  if (typeof v === "number") return v;
  const n = Number(String(v ?? "").replace(/[$,%\s]/g, ""));
  return String(v ?? "").trim() === "" ? NaN : n;
}

const nz = (x) => (Number.isFinite(x) && x > 0 ? x : 0);
const fin = (x) => (Number.isFinite(x) ? x : 0);

export function money(x) {
  const n = Math.round(x);
  return (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString("en-US");
}
export function pct(x, d = 1) {
  return (x * 100).toFixed(d) + "%";
}

export function monthlyPayment(principal, ratePct, years) {
  const n = Math.round(nz(years) * 12);
  const p = nz(principal);
  if (!n || !p) return 0;
  const i = fin(ratePct) / 100 / 12;
  return i === 0 ? p / n : (p * i) / (1 - Math.pow(1 + i, -n));
}

function loanBalance(principal, ratePct, years, paid) {
  const n = Math.round(nz(years) * 12);
  const p = nz(principal);
  if (!n || !p) return 0;
  if (paid >= n) return 0;
  const i = fin(ratePct) / 100 / 12;
  const pmt = monthlyPayment(p, ratePct, years);
  if (i === 0) return p - pmt * paid;
  return p * Math.pow(1 + i, paid) - (pmt * (Math.pow(1 + i, paid) - 1)) / i;
}

export function investment(raw) {
  const o = { ...DEFAULTS, ...raw };
  const total = nz(o.franchiseFee) + nz(o.buildout) + nz(o.equipment) + nz(o.workingCapital);
  const loan = Math.min(total, nz(o.loanAmount));
  return { total, loan, equity: total - loan };
}

// Steady-state monthly operating result at annual revenue `annual` (no ramp, no escalation).
// `primeShift` moves labor-plus-cost-of-goods by that many points of revenue, for the grid.
export function steady(raw, annual, primeShift = 0) {
  const o = { ...DEFAULTS, ...raw };
  const rev = nz(annual) / 12;
  const varPct = (nz(o.cogsPct) + nz(o.laborPct) + nz(o.otherVarPct) + primeShift) / 100;
  const royalty = Math.max(rev * nz(o.royaltyPct) / 100, nz(o.royaltyMinMonthly));
  const ad = rev * nz(o.adFundPct) / 100;
  const fixed = nz(o.fixedMonthly) + nz(o.operatorPayMonthly);
  const operating = rev * (1 - varPct) - royalty - ad - nz(o.techFeeMonthly) - fixed;
  const debt = monthlyPayment(Math.min(investment(o).total, nz(o.loanAmount)), o.loanRatePct, o.loanYears);
  return { rev, royalty, ad, operating, debt, afterDebt: operating - debt };
}

// Month-by-month cash for `years` years. Month 0 is the equity you put in.
export function simulate(raw) {
  const o = { ...DEFAULTS, ...raw };
  const years = Math.max(1, Math.min(20, Math.round(nz(o.years)) || 1));
  const months = years * 12;
  const inv = investment(o);
  const pmt = monthlyPayment(inv.loan, o.loanRatePct, o.loanYears);
  const loanMonths = Math.round(nz(o.loanYears) * 12);
  const start = Math.min(100, nz(o.rampStartPct)) / 100;
  const ramp = Math.max(0, Math.round(nz(o.rampMonths)));
  const g = fin(o.growthPct) / 100;
  const ce = fin(o.costEscPct) / 100;
  const base = nz(o.annualRevenue) / 12;
  const rows = [];
  let cumEquity = -inv.equity;
  let cash = nz(o.workingCapital);
  let lowestCash = cash;
  let lowestMonth = 0;
  let runOut = null;
  let payback = null;
  const flows = [-inv.equity];
  for (let m = 1; m <= months; m++) {
    const yr = Math.floor((m - 1) / 12);
    const rampPct = ramp === 0 ? 1 : start + (1 - start) * Math.min(1, (m - 1) / ramp);
    const rev = base * rampPct * Math.pow(1 + g, yr);
    const esc = Math.pow(1 + ce, yr);
    const varCost = (rev * (nz(o.cogsPct) + nz(o.laborPct) + nz(o.otherVarPct))) / 100;
    const royalty = Math.max((rev * nz(o.royaltyPct)) / 100, nz(o.royaltyMinMonthly));
    const ad = (rev * nz(o.adFundPct)) / 100;
    const tech = nz(o.techFeeMonthly);
    const fixed = (nz(o.fixedMonthly) + nz(o.operatorPayMonthly)) * esc;
    const operating = rev - varCost - royalty - ad - tech - fixed;
    const debt = m <= loanMonths ? pmt : 0;
    const free = operating - debt;
    cumEquity += free;
    cash += free;
    if (cash < lowestCash) { lowestCash = cash; lowestMonth = m; }
    if (runOut === null && cash < 0) runOut = m;
    if (payback === null && cumEquity >= 0) payback = m;
    flows.push(free);
    rows.push({ m, year: yr + 1, rev, royalty, ad, tech, varCost, fixed, operating, debt, free, cumEquity });
  }
  const last12 = rows.slice(-12).reduce((s, r) => s + r.operating, 0);
  const bal = loanBalance(inv.loan, o.loanRatePct, o.loanYears, months);
  const terminal = nz(o.exitMultiple) * Math.max(0, last12) - bal;
  flows[months] += terminal;
  const totals = rows.reduce((t, r) => { t.rev += r.rev; t.royalty += r.royalty; t.ad += r.ad; t.tech += r.tech; t.free += r.free; return t; }, { rev: 0, royalty: 0, ad: 0, tech: 0, free: 0 });
  const byYear = [];
  for (let y = 1; y <= years; y++) {
    const rs = rows.filter((r) => r.year === y);
    byYear.push({
      year: y,
      rev: rs.reduce((s, r) => s + r.rev, 0),
      fees: rs.reduce((s, r) => s + r.royalty + r.ad + r.tech, 0),
      operating: rs.reduce((s, r) => s + r.operating, 0),
      debt: rs.reduce((s, r) => s + r.debt, 0),
      free: rs.reduce((s, r) => s + r.free, 0),
      cum: rs[rs.length - 1].cumEquity,
    });
  }
  const feesTotal = totals.royalty + totals.ad + totals.tech;
  return {
    years, inv, pmt, rows, byYear, payback, lowestCash, lowestMonth, runOut,
    extraCapital: Math.max(0, -lowestCash),
    feesTotal, feeLoad: totals.rev > 0 ? feesTotal / totals.rev : 0,
    totalFree: totals.free, terminal, remainingLoan: bal,
    multiple: inv.equity > 0 ? (totals.free + terminal) / inv.equity : null,
    irr: irr(flows),
    firstYearFree: byYear[0].free,
    lastYearFree: byYear[byYear.length - 1].free,
    dscr: pmt > 0 ? byYear[Math.min(1, byYear.length - 1)].operating / (pmt * 12) : null,
    dscrYear1: pmt > 0 ? byYear[0].operating / (pmt * 12) : null,
  };
}

// Annualised IRR of monthly flows, by bisection. null when there is no sign change.
export function irr(flows) {
  const npv = (r) => flows.reduce((s, f, t) => s + f / Math.pow(1 + r, t), 0);
  let lo = -0.5, hi = 1;
  if (!(flows.some((f) => f < 0) && flows.some((f) => f > 0))) return null;
  if (npv(lo) * npv(hi) > 0) return null;
  for (let k = 0; k < 200; k++) {
    const mid = (lo + hi) / 2;
    if (npv(lo) * npv(mid) <= 0) hi = mid; else lo = mid;
  }
  return Math.pow(1 + (lo + hi) / 2, 12) - 1;
}

// Annual revenue at which a steady year pays exactly `target` a year after debt.
// Exact: the result is linear in revenue, with the royalty minimum handled as a second case.
export function revenueForCashFlow(raw, target = 0) {
  const o = { ...DEFAULTS, ...raw };
  const varPct = (nz(o.cogsPct) + nz(o.laborPct) + nz(o.otherVarPct)) / 100;
  const fixed = nz(o.fixedMonthly) + nz(o.operatorPayMonthly) + nz(o.techFeeMonthly);
  const debt = steady(o, 0).debt;
  const need = fixed + debt + fin(target) / 12;
  const r = nz(o.royaltyPct) / 100;
  const M = nz(o.royaltyMinMonthly);
  const a = nz(o.adFundPct) / 100;
  const pctDen = 1 - varPct - a - r;
  const minDen = 1 - varPct - a;
  const pctCase = pctDen > 0 ? need / pctDen : null;
  const minCase = minDen > 0 ? (need + M) / minDen : null;
  let monthly = null;
  if (pctCase !== null && pctCase * r >= M) monthly = pctCase;
  else if (minCase !== null && minCase * r <= M) monthly = minCase;
  return monthly !== null && Number.isFinite(monthly) ? monthly * 12 : null;
}

export function sensitivity(raw) {
  const o = { ...DEFAULTS, ...raw };
  const shifts = [-3, 0, 3, 6];
  return [0.8, 0.9, 1, 1.1].map((f) => ({
    factor: f,
    annual: nz(o.annualRevenue) * f,
    cells: shifts.map((s) => ({ shift: s, afterDebt: steady(o, nz(o.annualRevenue) * f, s).afterDebt * 12 })),
  }));
}

// What the same unit earns with no franchise: no fee, royalty, ad fund or tech fee, a smaller
// sales base (no brand), and its own marketing. Compared on a steady year before debt, with the
// franchise fee spread over the years you keep the unit.
export function versusIndependent(raw) {
  const o = { ...DEFAULTS, ...raw };
  const years = Math.max(1, Math.min(20, Math.round(nz(o.years)) || 1));
  const R = nz(o.annualRevenue);
  const varPct = (nz(o.cogsPct) + nz(o.laborPct) + nz(o.otherVarPct)) / 100;
  const fixedA = (nz(o.fixedMonthly) + nz(o.operatorPayMonthly)) * 12;
  const royaltyA = Math.max((R * nz(o.royaltyPct)) / 100, nz(o.royaltyMinMonthly) * 12);
  const franchiseOp = R * (1 - varPct - nz(o.adFundPct) / 100) - royaltyA - nz(o.techFeeMonthly) * 12 - fixedA - nz(o.franchiseFee) / years;
  const indepR = (R * Math.min(150, nz(o.indepRevenuePct))) / 100;
  const indepOp = indepR * (1 - varPct - nz(o.indepMarketingPct) / 100) - fixedA;
  const denom = R * (1 - varPct - nz(o.indepMarketingPct) / 100);
  const tie = denom > 0 ? (franchiseOp + fixedA) / denom : null;
  return {
    franchiseOp, indepOp, diff: franchiseOp - indepOp,
    tiePct: tie === null || tie < 0 ? null : tie,
    franchiseWins: franchiseOp >= indepOp,
  };
}

export function analyze(raw) {
  const o = { ...DEFAULTS, ...raw };
  const sim = simulate(o);
  const st = steady(o, nz(o.annualRevenue));
  return {
    sim,
    steady: st,
    beRevenue: revenueForCashFlow(o, 0),
    targetRevenue: revenueForCashFlow(o, nz(o.targetCashFlow)),
    grid: sensitivity(o),
    vs: versusIndependent(o),
  };
}
