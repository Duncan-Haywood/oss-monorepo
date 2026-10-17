// Federal student loan repayment-plan comparison: Standard (tiered), Repayment Assistance Plan (RAP) and
// Income-Based Repayment (IBR). Pure functions, no dependencies, nothing leaves the browser.
//
// One pooled loan (balance, weighted-average rate). Monthly simulation up to 40 years. Income grows once a
// year; the poverty guideline grows with the inflation figure typed. Every statutory figure below is a
// default the visitor can overwrite, because Congress and ED change them.
//
// Standard (tiered, loans made on/after 2026-07-01): term by balance -- under $25k 10y, $25k-$50k 15y,
//   $50k-$100k 20y, over $100k 25y -- level payment at the loan rate.
// RAP: payment = AGI x pct / 12 - $50 per dependent, minimum $10. pct steps 1% per $10k of AGI from the
//   $10k-$20k band (1%) to 10% above $100k; AGI up to $10k pays the $10 minimum. Unpaid monthly interest is
//   waived; the government matches principal reduction up to the lesser of $50 or the payment. Forgiveness
//   after 360 qualifying payments.
// IBR: payment = rate x (AGI - 150% of poverty guideline) / 12, never more than the 10-year standard payment
//   on the starting balance. Unpaid interest accrues but does not capitalize. Forgiveness after 240 (new
//   borrowers, 10%) or 300 (older borrowers, 15%) payments.
// Forgiveness outside PSLF is treated as taxable income at the rate typed. PSLF (optional): 120 qualifying
//   payments on RAP or IBR (or the 10-year standard term), forgiveness tax-free.

export const DEFAULTS = {
  balance: 60000,
  ratePct: 6.5,
  agi: 55000,
  incomeGrowthPct: 3,
  dependents: 0,
  povertyGuideline: 15650,
  povertyGrowthPct: 2.5,
  ibrRatePct: 10,
  ibrYears: 20,
  forgivenessTaxPct: 22,
  pslf: 0,
};

export const num = (s) => {
  if (typeof s === "number") return s;
  const t = String(s ?? "").replace(/[$,%\s]/g, "");
  return t === "" ? NaN : Number(t);
};
export const money = (x) => `${x < 0 ? "-" : ""}$${Math.abs(Math.round(x)).toLocaleString("en-US")}`;

export function payment(loan, annualRate, months) {
  if (loan <= 0) return 0;
  const r = annualRate / 12;
  return r === 0 ? loan / months : (loan * r) / (1 - Math.pow(1 + r, -months));
}

export function standardYears(balance) {
  if (balance < 25000) return 10;
  if (balance < 50000) return 15;
  if (balance < 100000) return 20;
  return 25;
}

// Share of AGI paid under RAP, as a fraction. null below the flat-$10 band.
export function rapRate(agi) {
  if (agi <= 10000) return null;
  return Math.min(10, Math.ceil(agi / 10000) - 1) / 100;
}

export function rapMonthly(agi, dependents) {
  const r = rapRate(agi);
  if (r === null) return 10;
  return Math.max(10, (agi * r) / 12 - 50 * dependents);
}

export function ibrMonthly(agi, poverty, rate) {
  return Math.max(0, (rate * Math.max(0, agi - 1.5 * poverty)) / 12);
}

function standard(o) {
  const years = standardYears(o.balance);
  const n = years * 12;
  const p = payment(o.balance, o.ratePct / 100, n);
  return { plan: "Standard", months: n, firstPayment: p, totalPaid: p * n, forgiven: 0, interestPaid: p * n - o.balance, maxPayment: p, qualifyingYears: years };
}

function rap(o, cap = 360) {
  let bal = o.balance, paid = 0, m = 0, first = null, maxP = 0, agi = o.agi, interestPaid = 0;
  const r = o.ratePct / 100 / 12;
  while (bal > 0.005 && m < cap) {
    if (m > 0 && m % 12 === 0) agi *= 1 + o.incomeGrowthPct / 100;
    const interest = bal * r;
    let p = rapMonthly(agi, o.dependents);
    if (p > bal + interest) p = bal + interest;
    const charged = Math.min(interest, p); // unpaid interest is waived
    const reduction = Math.max(0, p - charged);
    const match = Math.max(0, Math.min(50, p) - reduction);
    bal = Math.max(0, bal - reduction - match);
    paid += p; interestPaid += charged; m++;
    if (first === null) first = p;
    maxP = Math.max(maxP, p);
  }
  return { plan: "RAP", months: m, firstPayment: first ?? 0, totalPaid: paid, forgiven: bal > 0.005 ? bal : 0, interestPaid, maxPayment: maxP, qualifyingYears: Math.round(m / 12) };
}

function ibr(o, cap) {
  const n = cap ?? o.ibrYears * 12;
  const std10 = payment(o.balance, o.ratePct / 100, 120);
  const r = o.ratePct / 100 / 12;
  let prin = o.balance, owed = 0, paid = 0, m = 0, first = null, maxP = 0, agi = o.agi, pov = o.povertyGuideline, interestPaid = 0;
  while (prin + owed > 0.005 && m < n) {
    if (m > 0 && m % 12 === 0) { agi *= 1 + o.incomeGrowthPct / 100; pov *= 1 + o.povertyGrowthPct / 100; }
    owed += prin * r; // accrues, never capitalizes
    let p = Math.min(ibrMonthly(agi, pov, o.ibrRatePct / 100), std10);
    p = Math.min(p, prin + owed);
    const toInterest = Math.min(p, owed);
    owed -= toInterest; interestPaid += toInterest;
    prin -= p - toInterest;
    paid += p; m++;
    if (first === null) first = p;
    maxP = Math.max(maxP, p);
  }
  const left = prin + owed;
  return { plan: "IBR", months: m, firstPayment: first ?? 0, totalPaid: paid, forgiven: left > 0.005 ? left : 0, interestPaid, maxPayment: maxP, qualifyingYears: Math.round(m / 12) };
}

function finish(row, o, pslfCap) {
  const taxable = row.forgiven * (o.forgivenessTaxPct / 100);
  return { ...row, forgivenessTax: taxable, netCost: row.totalPaid + taxable, pslfCap };
}

export function validate(o) {
  const w = [];
  if (!(o.balance > 0)) w.push("Enter the total balance you owe.");
  if (!(o.ratePct >= 0 && o.ratePct < 25)) w.push("Enter an interest rate between 0% and 25%.");
  if (!(o.agi >= 0)) w.push("Enter your adjusted gross income (zero is allowed).");
  if (!(o.dependents >= 0)) w.push("Dependents cannot be negative.");
  if (!(o.ibrRatePct > 0 && o.ibrRatePct <= 15)) w.push("IBR percentage is normally 10 or 15.");
  if (!(o.ibrYears >= 1 && o.ibrYears <= 30)) w.push("IBR forgiveness term is normally 20 or 25 years.");
  return w;
}

export function compare(o) {
  const std = finish(standard(o), o, null);
  const rapRow = finish(rap(o), o, null);
  const ibrRow = finish(ibr(o), o, null);
  return [std, rapRow, ibrRow];
}

// PSLF: only 120 qualifying payments are made on RAP or IBR; the rest is forgiven tax-free. Standard is
// shown unchanged (the tiered plan only qualifies on a 10-year term).
export function pslfCompare(o) {
  const std = standard(o);
  const rapRow = rap(o, 120);
  const ibrRow = ibr(o, 120);
  const fin = (r) => ({ ...r, forgivenessTax: 0, netCost: r.totalPaid });
  return [fin(std), fin(rapRow), fin(ibrRow)];
}

export function analyze(raw) {
  const o = { ...DEFAULTS, ...raw };
  const warnings = validate(o);
  if (warnings.length) return { opts: o, warnings, plans: [] };
  const plans = o.pslf ? pslfCompare(o) : compare(o);
  const best = plans.reduce((a, b) => (b.netCost < a.netCost ? b : a));
  const lowestMonthly = plans.reduce((a, b) => (b.firstPayment < a.firstPayment ? b : a));
  const growths = [0, 2, 4, 6];
  const grid = growths.map((g) => {
    const p = o.pslf ? pslfCompare({ ...o, incomeGrowthPct: g }) : compare({ ...o, incomeGrowthPct: g });
    return { growth: g, costs: p.map((r) => r.netCost) };
  });
  const warn = [];
  if (o.pslf) warn.push("PSLF mode: you need 120 qualifying payments while working full time for a qualifying employer. Standard here is shown for reference only.");
  if (!o.pslf && best.forgiven > 0) warn.push(`The cheapest plan leaves ${money(best.forgiven)} forgiven; the model taxes that at ${o.forgivenessTaxPct}%. Forgiveness outside PSLF is taxable federal income from 2026.`);
  if (rapRate(o.agi) === null) warn.push("At this income RAP is the $10 minimum payment.");
  return { opts: o, warnings: warn, plans, best, lowestMonthly, grid };
}

export function toCsv(a) {
  const head = "plan,first_payment,total_paid,months,forgiven,forgiveness_tax,net_cost";
  const lines = a.plans.map((r) => [r.plan, ...[r.firstPayment, r.totalPaid, r.months, r.forgiven, r.forgivenessTax, r.netCost].map((x) => Number(x).toFixed(0))].join(","));
  return [head, ...lines].join("\n");
}
