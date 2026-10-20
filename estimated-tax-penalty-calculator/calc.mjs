// Core arithmetic for the underpayment-of-estimated-tax penalty (IRS Form
// 2210, regular method) for an individual filer. No network calls: this
// applies published IRS rules to the numbers the user supplies. It is NOT
// tax advice -- see README "What this does not cover".
//
// Rules modelled (Form 2210 instructions / IRC 6654, verified 2026-09-29):
//
//   - Required annual payment = the SMALLER of 90% of this year's tax and
//     100% of last year's tax (110% when last year's AGI was over $150,000,
//     or $75,000 if married filing separately).
//   - No penalty when the tax still owed after withholding and credits is
//     under $1,000, or when last year's tax was zero (full-year US filer).
//   - The required payment is split into four equal installments due
//     Apr 15, Jun 15, Sep 15 and Jan 15. Withholding counts as paid evenly
//     on those dates unless the filer shows otherwise (the default here).
//   - A payment is applied to the EARLIEST installment still unpaid, so an
//     early or excess payment carries forward and a late one only stops the
//     penalty on the oldest shortfall.
//   - Penalty on each installment's unpaid balance = balance x annual rate
//     x days / 365, from its due date until paid or the return due date
//     (Apr 15 of the next year). The rate is the IRS underpayment rate for
//     the quarter (federal short-term rate + 3 points) and is an input,
//     because it is republished every quarter.
//
// Not modelled: the annualized income installment method (Schedule AI), the
// farmer/fisher rule, waivers, and rates that change mid-year.

export const INSTALLMENT_LABELS = ["Apr 15", "Jun 15", "Sep 15", "Jan 15"];
// Statutory due dates by tax year (weekend-adjusted the way Form 2210 prints them).
export const DUE_DATES = {
  2025: ["2025-04-15", "2025-06-16", "2025-09-15", "2026-01-15"],
  2026: ["2026-04-15", "2026-06-15", "2026-09-15", "2027-01-15"],
};
export const RETURN_DUE = { 2025: "2026-04-15", 2026: "2027-04-15" };
export const DEFAULT_RATE = 0.07;
export const HIGH_INCOME_AGI = 150000;
export const HIGH_INCOME_AGI_MFS = 75000;
export const DE_MINIMIS = 1000;

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const day = (iso) => Date.parse(`${iso}T00:00:00Z`) / 86400000;

export function money(n) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function requiredAnnualPayment({ currentTax, priorTax, priorAgi, marriedFilingSeparately = false }) {
  const tax = num(currentTax);
  const prior = num(priorTax);
  const threshold = marriedFilingSeparately ? HIGH_INCOME_AGI_MFS : HIGH_INCOME_AGI;
  const priorPct = num(priorAgi) > threshold ? 1.1 : 1.0;
  const ninetyPct = round2(tax * 0.9);
  const priorYear = round2(prior * priorPct);
  const usePrior = priorYear < ninetyPct;
  return {
    ninetyPct,
    priorYear,
    priorPct,
    basis: usePrior ? "prior-year" : "current-year",
    required: usePrior ? priorYear : ninetyPct,
  };
}

// payments: [{ date: "YYYY-MM-DD", amount }] of estimated payments made.
export function underpaymentPenalty(input) {
  const year = input.taxYear in DUE_DATES ? Number(input.taxYear) : 2026;
  const currentTax = num(input.currentTax);
  const withholding = num(input.withholding);
  const rate = Math.min(Math.max(Number(input.rate) || DEFAULT_RATE, 0), 1);
  if (!currentTax) return { invalid: true };

  const req = requiredAnnualPayment(input);
  const due = DUE_DATES[year];
  const end = day(RETURN_DUE[year]);
  const findings = [];

  const balanceDue = round2(currentTax - withholding);
  const priorTaxZero = input.priorTax !== undefined && input.priorTax !== "" && num(input.priorTax) === 0 && input.priorYearFull !== false;
  let exemptReason = null;
  if (balanceDue < DE_MINIMIS) exemptReason = `Tax owed after withholding is ${money(Math.max(balanceDue, 0))}, under the $1,000 threshold.`;
  else if (priorTaxZero) exemptReason = "Last year's total tax was $0 for a full 12-month year, so no penalty applies.";

  const inst = due.map((d, i) => ({ label: INSTALLMENT_LABELS[i], due: d, required: round2(req.required / 4), allocs: [] }));

  // Withholding counts as paid evenly on each due date.
  const pays = [];
  for (const d of due) pays.push({ date: d, amount: withholding / 4 });
  for (const p of input.payments || []) {
    if (num(p.amount) && p.date) pays.push({ date: p.date, amount: num(p.amount) });
  }
  pays.sort((a, b) => day(a.date) - day(b.date));

  // Apply each payment to the earliest installment still short.
  const remaining = inst.map((x) => x.required);
  for (const p of pays) {
    let left = p.amount;
    for (let i = 0; i < inst.length && left > 1e-9; i++) {
      const take = Math.min(left, remaining[i]);
      if (take > 0) {
        remaining[i] -= take;
        inst[i].allocs.push({ t: day(p.date), amount: take });
        left -= take;
      }
    }
  }

  let totalPenalty = 0;
  for (const x of inst) {
    const start = day(x.due);
    const paidOnTime = x.allocs.filter((a) => a.t <= start).reduce((s, a) => s + a.amount, 0);
    let balance = x.required - paidOnTime;
    x.shortfall = round2(Math.max(balance, 0));
    let cursor = start;
    let penalty = 0;
    for (const a of x.allocs.filter((a) => a.t > start).sort((p, q) => p.t - q.t)) {
      const t = Math.min(a.t, end);
      penalty += (balance * rate * Math.max(t - cursor, 0)) / 365;
      cursor = Math.max(cursor, t);
      balance -= a.amount;
    }
    penalty += (Math.max(balance, 0) * rate * Math.max(end - cursor, 0)) / 365;
    x.penalty = round2(penalty);
    x.paidOnTime = round2(paidOnTime);
    x.unpaidAtDeadline = round2(Math.max(balance, 0));
    totalPenalty += x.penalty;
    delete x.allocs;
  }
  totalPenalty = round2(totalPenalty);
  const penalty = exemptReason ? 0 : totalPenalty;

  // What to pay to be safe: cumulative required minus cumulative paid on time.
  let cumReq = 0;
  let cumPaid = 0;
  const plan = inst.map((x) => {
    cumReq += x.required;
    cumPaid += x.paidOnTime;
    return { label: x.label, due: x.due, catchUp: round2(Math.max(cumReq - cumPaid, 0)) };
  });

  if (exemptReason) {
    findings.push({ severity: "info", title: "No penalty applies", detail: exemptReason });
  } else if (totalPenalty > 0) {
    findings.push({
      severity: "high",
      title: `Estimated penalty ${money(totalPenalty)}`,
      detail: `Against a required annual payment of ${money(req.required)} (${req.basis === "prior-year" ? `${Math.round(req.priorPct * 100)}% of last year's tax` : "90% of this year's tax"}), your payments fell short of the four installments. Paying the shortfall now stops the clock on it.`,
    });
  } else {
    findings.push({ severity: "info", title: "Safe harbor met", detail: "Your payments cover every installment on time, so this method shows no penalty." });
  }
  if (req.basis === "prior-year" && num(input.priorTax)) {
    findings.push({
      severity: "info",
      title: "Prior-year safe harbor is the cheaper target",
      detail: `Paying ${money(req.priorYear)} (last year's tax${req.priorPct > 1 ? " x 110%, because last year's AGI was above the threshold" : ""}) avoids the penalty even if this year's tax ends up far higher, versus ${money(req.ninetyPct)} for the 90% test.`,
    });
  }
  if (!exemptReason && totalPenalty > 0) {
    findings.push({
      severity: "medium",
      title: "Uneven income? The annualized method may cut this",
      detail: "If most of your income arrived late in the year, Form 2210 Schedule AI can lower or erase the penalty by matching installments to when income was earned. This tool does not model it.",
    });
  }

  return {
    invalid: false,
    taxYear: year,
    rate,
    ...req,
    balanceDue,
    exempt: Boolean(exemptReason),
    exemptReason,
    installments: inst,
    plan,
    totalPenalty,
    penalty,
    findings,
  };
}
