// Mortgage extra-payment vs invest calculator. Pure functions, no dependencies, nothing leaves the browser.
// Same cash out of pocket every month and the same lump sum, three ways of using them:
//   invest  - keep the mortgage as scheduled; invest the lump sum now and the extra every month
//   prepay  - put the lump sum on principal now and pay the extra monthly; the loan ends early, then the whole
//             payment is invested for the rest of the original term
//   recast  - put the lump sum on principal, pay a recast fee, and re-amortise over the remaining term; the
//             lower payment is not spent, it is invested together with the extra
// Wealth is compared at the end of the ORIGINAL term, when every path has no loan: after-tax investments.
// Model:
//   payment          = standard amortisation, monthly compounding
//   interest benefit = optional share of each month's mortgage interest returned as tax saved (itemisers), invested
//   investments      = grow monthly at return/12; contributions at month end; tax on gains (value - basis) at the end
//   break-even       = pre-tax investment return at which `invest` and `prepay` end level (bisection)
// Property pinned in the tests: with return == mortgage rate, no tax, no interest benefit, all paths tie.

export const DEFAULTS = {
  balance: 320000,
  ratePct: 6.5,
  yearsLeft: 27,
  extraMonthly: 400,
  lump: 25000,
  returnPct: 7,
  gainsTaxPct: 15,
  interestTaxSavingPct: 0,
  recastFee: 300,
};

export function num(v) {
  if (typeof v === "number") return v;
  const s = String(v ?? "").replace(/[$,%\s]/g, "");
  return s === "" ? NaN : Number(s);
}
export function money(x) {
  if (!Number.isFinite(x)) return "n/a";
  const n = Math.round(x);
  return (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString("en-US");
}
export function pct(x, d = 1) {
  return Number.isFinite(x) ? x.toFixed(d) + "%" : "n/a";
}

export function payment(balance, monthlyRate, months) {
  if (balance <= 0 || months <= 0) return 0;
  if (monthlyRate === 0) return balance / months;
  return (balance * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -months));
}

function clean(raw) {
  const o = { ...DEFAULTS };
  for (const k of Object.keys(DEFAULTS)) {
    const v = num(raw?.[k]);
    o[k] = Number.isFinite(v) ? v : DEFAULTS[k];
  }
  return o;
}

export function simulate(o, strategy) {
  const n = Math.round(o.yearsLeft * 12);
  const i = o.ratePct / 1200;
  const g = o.returnPct / 1200;
  const P = payment(o.balance, i, n);
  const budget = P + o.extraMonthly;
  const lump = Math.min(o.lump, o.balance);
  let bal = o.balance;
  let inv = 0;
  let basis = 0;
  let planned = P;
  if (strategy === "invest") {
    inv = o.lump; basis = o.lump;
  } else if (strategy === "prepay") {
    bal -= lump;
    inv = o.lump - lump; basis = inv;
    planned = P + o.extraMonthly;
  } else {
    bal -= lump;
    inv = o.lump - lump - o.recastFee; basis = inv;
    planned = payment(bal, i, n);
  }
  let interestPaid = 0;
  let payoffMonth = bal <= 0 ? 0 : null;
  const years = [{ year: 0, balance: bal, invested: inv }];
  for (let m = 1; m <= n; m++) {
    const interest = bal > 0 ? bal * i : 0;
    const due = Math.min(planned, bal + interest);
    bal = Math.max(0, bal + interest - due);
    if (bal < 0.005) bal = 0;
    if (payoffMonth === null && bal === 0) payoffMonth = m;
    interestPaid += interest;
    const contrib = budget - due + interest * (o.interestTaxSavingPct / 100);
    inv = inv * (1 + g) + contrib;
    basis += contrib;
    if (m % 12 === 0) years.push({ year: m / 12, balance: bal, invested: inv });
  }
  const gain = Math.max(0, inv - basis);
  const tax = gain * (o.gainsTaxPct / 100);
  return {
    strategy, payment: planned, interestPaid,
    payoffMonths: payoffMonth === null ? n : payoffMonth,
    investedPreTax: inv, tax, final: inv - tax, years,
  };
}

// Pre-tax investment return (annual %) at which investing the money ends level with paying down the loan.
export function breakEvenReturn(raw) {
  const o = clean(raw);
  const f = (r) => {
    const p = { ...o, returnPct: r };
    return simulate(p, "invest").final - simulate(p, "prepay").final;
  };
  let lo = 0, hi = 40;
  if (f(lo) > 0) return 0;
  if (f(hi) < 0) return null;
  for (let k = 0; k < 80; k++) {
    const mid = (lo + hi) / 2;
    if (f(mid) < 0) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

const LABELS = {
  invest: "Keep the mortgage, invest the money",
  prepay: "Pay down the mortgage faster",
  recast: "Lump sum, recast, invest the lower payment",
};

export function analyze(raw) {
  const o = clean(raw);
  const warnings = [];
  const n = Math.round(o.yearsLeft * 12);
  if (!(o.balance > 0)) warnings.push("Enter a loan balance above zero.");
  if (!(n >= 1)) warnings.push("Enter the years left on the loan (at least one month).");
  if (n > 1200) warnings.push("Enter 100 years or less left on the loan.");
  if (o.ratePct < 0 || o.returnPct < -50) warnings.push("Check the rates; a negative mortgage rate or a return below -50% is not modelled.");
  if (o.extraMonthly < 0 || o.lump < 0) warnings.push("The extra payment and the lump sum cannot be negative.");
  if (o.gainsTaxPct < 0 || o.gainsTaxPct > 100 || o.interestTaxSavingPct < 0 || o.interestTaxSavingPct > 100) warnings.push("Tax percentages must be between 0 and 100.");
  if (warnings.length) return { warnings, rows: [] };
  if (o.lump > o.balance) warnings.push("The lump sum is larger than the loan balance; only the balance is paid off and the rest is invested.");
  if (o.extraMonthly === 0 && o.lump === 0) warnings.push("With no extra payment and no lump sum there is nothing to compare; all three paths are identical.");
  if (o.interestTaxSavingPct > 0) warnings.push("The interest tax saving only exists if you itemise and the mortgage interest actually lowers your tax; 0 is the safe entry.");
  const sims = ["invest", "prepay", "recast"].map((s) => simulate(o, s));
  const base = sims[0];
  const rows = sims.map((s) => ({
    key: s.strategy, label: LABELS[s.strategy], payment: s.payment,
    payoffMonths: s.payoffMonths, interestPaid: s.interestPaid,
    investedPreTax: s.investedPreTax, tax: s.tax, final: s.final,
    vsInvest: s.final - base.final,
  }));
  const best = rows.reduce((a, b) => (b.final > a.final + 0.5 ? b : a), rows[0]);
  const be = breakEvenReturn(o);
  const afterTaxMortgage = o.ratePct * (1 - o.interestTaxSavingPct / 100);
  const sensitivity = [];
  for (let r = 2; r <= 12; r += 2) {
    const p = { ...o, returnPct: r };
    const a = simulate(p, "invest").final, b = simulate(p, "prepay").final, c = simulate(p, "recast").final;
    sensitivity.push({ returnPct: r, invest: a, prepay: b, recast: c, winner: a >= b && a >= c ? "invest" : c > b ? "recast" : "prepay" });
  }
  return {
    warnings, rows, best, breakEven: be, afterTaxMortgage, sensitivity,
    years: sims.map((s) => s.years), originalPayment: base.payment, months: n,
    monthsSaved: rows[1].payoffMonths < n ? n - rows[1].payoffMonths : 0,
    interestSavedByPrepay: rows[0].interestPaid - rows[1].interestPaid,
  };
}

export function toCsv(a) {
  const lines = ["year,loan_balance_keep,loan_balance_prepay,loan_balance_recast,investments_keep,investments_prepay,investments_recast"];
  const [x, y, z] = a.years;
  for (let k = 0; k < x.length; k++) {
    lines.push([x[k].year, x[k].balance, y[k].balance, z[k].balance, x[k].invested, y[k].invested, z[k].invested].map((v, j) => (j ? Math.round(v) : v)).join(","));
  }
  return lines.join("\n");
}
