// True cost of a merchant cash advance (MCA) or an invoice-factoring deal.
// Pure arithmetic, no I/O, no imports.
//
// An MCA is quoted as a "factor rate" (1.35 means repay $1.35 per $1 advanced),
// never as an APR. But it is repaid in small daily or weekly slices, so the
// money is outstanding for less time than the headline suggests and the
// annualised cost is far higher than the factor implies. The rate here is the
// internal rate of return of the real cash flows: the amount actually funded
// (advance minus fees) goes in on day 0, each payment comes out.

export const money = (v) => (v == null || !Number.isFinite(v) ? "n/a" : (v < 0 ? "-" : "") + "$" + Math.round(Math.abs(v)).toLocaleString("en-US"));
export const money2 = (v) => (v == null || !Number.isFinite(v) ? "n/a" : (v < 0 ? "-" : "") + "$" + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
export const pct = (v) => (v == null || !Number.isFinite(v) ? "n/a" : v >= 10 ? Math.round(v * 100).toLocaleString("en-US") + "%" : (v * 100).toFixed(1) + "%");

export const PERIODS_PER_YEAR = { daily: 252, weekly: 52 };

const num = (v, d = 0) => {
  if (v === "" || v == null) return d;
  const n = Number(String(v).replace(/[$,%\s]/g, ""));
  return Number.isFinite(n) ? n : NaN;
};

// Periodic rate r such that  sum_t cf[t] / (1+r)^t = 0, cf[0] > 0 (money in)
// and later flows negative. Bisection: robust, no derivative, and the NPV rises
// monotonically with r for this sign pattern. Returns null when no rate exists
// (total repaid is less than funded) or the solver cannot bracket it.
export function irr(cf) {
  const npv = (r) => cf.reduce((s, c, t) => s + c / Math.pow(1 + r, t), 0);
  if (cf.reduce((s, c) => s + c, 0) > 0) return null;
  let lo = 0, hi = 1;
  if (Math.abs(cf.reduce((s, c) => s + c, 0)) < 1e-9) return 0;
  while (npv(hi) < 0 && hi < 1e6) hi *= 2;
  if (npv(hi) < 0) return null;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (npv(mid) < 0) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

export function annualise(r, ppy) {
  if (r == null) return { apr: null, ear: null };
  return { apr: r * ppy, ear: Math.pow(1 + r, ppy) - 1 };
}

// ---- Merchant cash advance -------------------------------------------------

export function normalizeMca(raw) {
  const freq = raw.frequency === "weekly" ? "weekly" : "daily";
  const m = {
    freq,
    ppy: PERIODS_PER_YEAR[freq],
    advance: num(raw.advance),
    fees: num(raw.fees),
    factor: raw.factor === "" || raw.factor == null ? null : num(raw.factor),
    payment: raw.payment === "" || raw.payment == null ? null : num(raw.payment),
    n: Math.round(num(raw.n)),
    monthlyRevenue: raw.monthlyRevenue === "" || raw.monthlyRevenue == null ? null : num(raw.monthlyRevenue),
    altRate: raw.altRate === "" || raw.altRate == null ? null : num(raw.altRate) / 100,
  };
  const errs = [];
  if (!(m.advance > 0)) errs.push("Enter the advance amount (the headline amount you are approved for).");
  if (!(m.fees >= 0) || m.fees >= m.advance) errs.push("Fees must be zero or more, and less than the advance.");
  if (!(m.n >= 1 && m.n <= 2000)) errs.push("Enter the number of payments (for example 120 to 200 daily payments, or 26 to 52 weekly).");
  if (m.factor == null && m.payment == null) errs.push("Enter the factor rate, or the payment amount, or both.");
  if (m.factor != null && !(m.factor >= 1 && m.factor <= 3)) errs.push("Factor rate must be between 1.00 and 3.00 (1.35 means repay $1.35 per $1).");
  if (m.payment != null && !(m.payment > 0)) errs.push("Payment amount must be greater than zero.");
  if (m.monthlyRevenue != null && !(m.monthlyRevenue > 0)) errs.push("Monthly revenue must be greater than zero, or left blank.");
  if (m.altRate != null && !(m.altRate >= 0 && m.altRate <= 3)) errs.push("Alternative loan rate must be an APR between 0% and 300%.");
  return { m, errs };
}

// Cash flows when the advance is repaid on schedule.
export function mcaFlows(funded, payment, n, payoffAt = null, payback = null) {
  const cf = [funded];
  if (payoffAt == null) {
    for (let t = 1; t <= n; t++) cf.push(-payment);
  } else {
    // Early payoff with no discount: pay on schedule, then the whole
    // remaining balance in one lump at period `payoffAt`.
    for (let t = 1; t < payoffAt; t++) cf.push(-payment);
    cf.push(-(payback - payment * (payoffAt - 1)));
  }
  return cf;
}

export function analyzeMca(raw) {
  const { m, errs } = normalizeMca(raw);
  if (errs.length) return { error: errs.join(" ") };
  const warnings = [];
  let payback, payment, factor;
  if (m.payment != null) {
    payment = m.payment;
    payback = payment * m.n;
    factor = payback / m.advance;
    if (m.factor != null && Math.abs(m.advance * m.factor - payback) / payback > 0.01) {
      warnings.push(`The factor rate (${m.factor}) and the payment x payments (${money(payback)}) disagree by more than 1%. The payment schedule was used, because that is what leaves your account.`);
    }
  } else {
    factor = m.factor;
    payback = m.advance * factor;
    payment = payback / m.n;
  }
  const funded = m.advance - m.fees;
  const cost = payback - funded;
  const r = irr(mcaFlows(funded, payment, m.n));
  const { apr, ear } = annualise(r, m.ppy);
  const termYears = m.n / m.ppy;
  const nominalFactorApr = (factor - 1) / termYears; // what "35%" would look like if read as simple annual interest on the advance
  const out = {
    kind: "mca", input: m, factor, payback, payment, funded, cost, apr, ear, termYears,
    costPerDollar: cost / funded, headlineCost: payback - m.advance, feeShare: m.fees / cost,
    simpleApr: nominalFactorApr, warnings, findings: [],
  };

  // Early payoff: MCAs rarely discount the balance, so paying sooner
  // raises the annualised cost instead of lowering the dollar cost.
  out.payoff = [0.25, 0.5, 0.75, 1].map((share) => {
    const k = Math.max(1, Math.round(m.n * share));
    const rr = irr(mcaFlows(funded, payment, m.n, k, payback));
    const a = annualise(rr, m.ppy);
    return { share, period: k, apr: a.apr, ear: a.ear, totalPaid: payback };
  });

  if (m.monthlyRevenue != null) {
    const monthlyPay = (payment * m.ppy) / 12;
    out.strain = { monthlyPay, share: monthlyPay / m.monthlyRevenue };
  }

  if (m.altRate != null) {
    // Same funded amount, monthly amortising loan over the same calendar term.
    const months = Math.max(1, Math.round(termYears * 12));
    const i = m.altRate / 12;
    const pay = i === 0 ? funded / months : (funded * i) / (1 - Math.pow(1 + i, -months));
    const altTotal = pay * months;
    out.alt = { months, monthly: pay, totalPaid: altTotal, cost: altTotal - funded, extra: payback - altTotal };
  }

  if (apr != null && apr >= 0.6) out.findings.push({ severity: "high", title: `Annualised cost is about ${pct(apr)}`, detail: `A factor rate of ${factor.toFixed(2)} looks like ${pct(factor - 1)} of the advance. Because the money is repaid in ${m.freq} slices over ${termYears < 1 ? Math.round(termYears * 12) + " months" : termYears.toFixed(1) + " years"}, the annualised cost of the ${money(funded)} you actually receive is about ${pct(apr)} (${pct(ear)} compounded).` });
  else if (apr != null) out.findings.push({ severity: "medium", title: `Annualised cost is about ${pct(apr)}`, detail: `On the ${money(funded)} you actually receive, the advance costs ${money(cost)}, about ${pct(apr)} a year on a simple basis.` });
  if (m.fees > 0) out.findings.push({ severity: "medium", title: `Fees are ${pct(m.fees / m.advance)} of the advance`, detail: `${money(m.fees)} is taken from the advance before you receive it, so you get ${money(funded)}, not ${money(m.advance)}. Fees are ${pct(out.feeShare)} of the total cost.` });
  const half = out.payoff[1];
  if (half.apr != null && apr != null && half.apr > apr * 1.15) out.findings.push({ severity: "medium", title: "Paying it off early makes the annualised cost worse", detail: `If the full ${money(payback)} is settled at the halfway point (payment ${half.period}), the annualised cost rises from ${pct(apr)} to about ${pct(half.apr)}. Ask whether the contract gives any discount for early payoff.` });
  if (out.strain && out.strain.share >= 0.15) out.findings.push({ severity: "high", title: `Payments take ${pct(out.strain.share)} of monthly revenue`, detail: `About ${money(out.strain.monthlyPay)} a month goes to this advance. Above roughly 10 to 15% of revenue, payments compete with payroll, rent and inventory.` });
  if (out.alt && out.alt.extra > 0) out.findings.push({ severity: "info", title: `Versus a ${pct(m.altRate)} loan: ${money(out.alt.extra)} more`, detail: `A ${money(funded)} amortising loan at ${pct(m.altRate)} over ${out.alt.months} months would cost ${money(out.alt.cost)} against ${money(cost)} here.` });
  for (const w of warnings) out.findings.push({ severity: "medium", title: "Check the quote", detail: w });
  return out;
}

// Same total paid, different terms: shows why a shorter term at the same
// factor rate is the more expensive advance.
export function termSensitivity(raw, terms = null) {
  const { m, errs } = normalizeMca(raw);
  if (errs.length) return [];
  const base = analyzeMca(raw);
  if (base.error) return [];
  const list = terms || [0.5, 0.75, 1, 1.5, 2].map((x) => Math.max(1, Math.round(m.n * x)));
  return [...new Set(list)].sort((a, b) => a - b).map((n) => {
    const p = base.payback / n;
    const r = irr(mcaFlows(base.funded, p, n));
    return { n, payment: p, apr: annualise(r, m.ppy).apr, termMonths: (n / m.ppy) * 12 };
  });
}

// ---- Invoice factoring -----------------------------------------------------

export function normalizeFactoring(raw) {
  const f = {
    face: num(raw.face),
    advancePct: num(raw.advancePct, 90) / 100,
    feePct: num(raw.feePct) / 100,
    feeDays: Math.round(num(raw.feeDays, 30)),
    days: Math.round(num(raw.days)),
    otherFees: num(raw.otherFees),
    invoicesPerYear: raw.invoicesPerYear === "" || raw.invoicesPerYear == null ? null : num(raw.invoicesPerYear),
  };
  const errs = [];
  if (!(f.face > 0)) errs.push("Enter the invoice amount.");
  if (!(f.advancePct > 0 && f.advancePct <= 1)) errs.push("Advance rate must be between 1% and 100%.");
  if (!(f.feePct >= 0 && f.feePct <= 0.5)) errs.push("Fee rate must be between 0% and 50% per fee period.");
  if (!(f.feeDays >= 1 && f.feeDays <= 365)) errs.push("Fee period must be 1 to 365 days (commonly 30, or 7 for weekly rates).");
  if (!(f.days >= 1 && f.days <= 365)) errs.push("Enter how many days the customer takes to pay (1 to 365).");
  if (!(f.otherFees >= 0)) errs.push("Other fees must be zero or more.");
  if (f.invoicesPerYear != null && !(f.invoicesPerYear >= 1)) errs.push("Invoices per year must be at least 1, or left blank.");
  return { f, errs };
}

export function analyzeFactoring(raw) {
  const { f, errs } = normalizeFactoring(raw);
  if (errs.length) return { error: errs.join(" ") };
  const periods = Math.ceil(f.days / f.feeDays); // a started period is billed in full
  const discountFee = f.face * f.feePct * periods;
  const fees = discountFee + f.otherFees;
  const advance = f.face * f.advancePct;
  const reserve = f.face - advance;
  const rebate = reserve - fees;
  const cash = advance + rebate;
  // You receive `advance` now and give up `fees` in the end: the annualised
  // cost is the fee over the money you could actually use, scaled to a year.
  const apr = (fees / advance) * (365 / f.days);
  const ear = Math.pow(1 + fees / advance, 365 / f.days) - 1;
  const out = { kind: "factoring", input: f, periods, discountFee, fees, advance, reserve, rebate, cash, apr, ear, feeOfInvoice: fees / f.face, findings: [] };
  if (f.invoicesPerYear != null) out.yearly = { fees: fees * f.invoicesPerYear, invoiced: f.face * f.invoicesPerYear };
  if (rebate < 0) out.findings.push({ severity: "high", title: "Fees exceed the reserve", detail: `Fees of ${money(fees)} are more than the ${money(reserve)} reserve, so you would owe the factor ${money(-rebate)} on top of the advance.` });
  out.findings.push({ severity: apr >= 0.4 ? "high" : "medium", title: `Annualised cost is about ${pct(apr)}`, detail: `A fee of ${pct(f.feePct)} per ${f.feeDays} days on an invoice that takes ${f.days} days to collect is ${periods} billed period${periods > 1 ? "s" : ""}, ${money(fees)} in total (${pct(out.feeOfInvoice)} of the invoice). On the ${money(advance)} advanced, that annualises to about ${pct(apr)}.` });
  if (f.days % f.feeDays !== 0 && f.days > f.feeDays) {
    const saved = f.face * f.feePct * (periods - f.days / f.feeDays);
    out.findings.push({ severity: "info", title: "Started periods are billed in full", detail: `The last ${f.days % f.feeDays} days are billed as a whole ${f.feeDays}-day period. Collection ${f.days % f.feeDays} days earlier would save about ${money(saved)}.` });
  }
  if (out.yearly) out.findings.push({ severity: "info", title: `About ${money(out.yearly.fees)} a year at this volume`, detail: `${out.input.invoicesPerYear} invoices like this cost ${money(out.yearly.fees)} in fees.` });
  return out;
}

export function sampleMca() {
  return { frequency: "daily", advance: "50000", fees: "1500", factor: "1.38", payment: "", n: "168", monthlyRevenue: "50000", altRate: "14" };
}
export function sampleFactoring() {
  return { face: "20000", advancePct: "90", feePct: "3", feeDays: "30", days: "45", otherFees: "50", invoicesPerYear: "24" };
}

export function reportCsv(r) {
  const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
  const rows = [["measure", "value"]];
  if (r.kind === "mca") {
    rows.push(["advance", r.input.advance], ["fees", r.input.fees], ["funded", r.funded.toFixed(2)], ["factor_rate", r.factor.toFixed(4)], ["total_payback", r.payback.toFixed(2)], ["payment", r.payment.toFixed(2)], ["payments", r.input.n], ["cost_of_capital", r.cost.toFixed(2)], ["annualised_cost_simple", r.apr == null ? "" : (r.apr * 100).toFixed(2) + "%"], ["annualised_cost_compounded", r.ear == null ? "" : (r.ear * 100).toFixed(2) + "%"]);
    for (const p of r.payoff) rows.push([`payoff_at_${Math.round(p.share * 100)}pct_annualised`, p.apr == null ? "" : (p.apr * 100).toFixed(2) + "%"]);
  } else {
    rows.push(["invoice", r.input.face], ["advance", r.advance.toFixed(2)], ["fees", r.fees.toFixed(2)], ["reserve_rebate", r.rebate.toFixed(2)], ["billed_periods", r.periods], ["annualised_cost", (r.apr * 100).toFixed(2) + "%"]);
  }
  return rows.map((row) => row.map(q).join(",")).join("\n") + "\n";
}
