// 401(k) loan vs hardship/early withdrawal vs outside loan. Pure functions, nothing leaves the browser.
//
// One yardstick for all three: what each option costs in horizon dollars, i.e. how much less you hold, after tax,
// at the horizon than if you had not needed the cash at all (you receive the same net cash N in every case).
//   cost = (1 - retirement tax) * (retirement-account shortfall at horizon) + (value at horizon of cash payments
//          you make out of pocket, had you invested that cash at the spare-cash rate).
// Loan: the principal leaves the account and grows nowhere; your payments (principal + interest) go back in.
//   They are paid with after-tax money into a pre-tax account, which is why the loan is not "free interest".
// Withdrawal: gross-up so that after income tax and any early-withdrawal penalty you net N; the gross amount
//   leaves the account for good.
// Outside loan: a personal loan or card at a typed APR; the retirement account is untouched.
// Plan loan limit: the greater of $10,000 or 50% of the vested balance, capped at $50,000 (a plan may set lower).

export const DEFAULTS = {
  need: 15000,
  balance: 80000,
  nowTaxPct: 27,
  retTaxPct: 20,
  penaltyPct: 10,
  growthPct: 6,
  horizonYears: 20,
  loanRatePct: 8.5,
  loanTermYears: 5,
  loanFee: 75,
  sparePct: 4,
  outsideAprPct: 14,
  outsideTermYears: 3,
  leaveAfterMonths: 12,
};

export const LOAN_CAP = 50000;
export const LOAN_FLOOR = 10000;

export const num = (s) => {
  if (typeof s === "number") return s;
  const t = String(s ?? "").replace(/[$,%\s]/g, "");
  return t === "" ? NaN : Number(t);
};
export const money = (x) => `${x < 0 ? "-" : ""}$${Math.abs(Math.round(x)).toLocaleString("en-US")}`;
export const pct = (x, d = 1) => `${(x * 100).toFixed(d)}%`;

export function validate(o) {
  const w = [];
  for (const k of ["need", "balance", "loanFee"]) if (!(o[k] >= 0)) w.push(`${k} must be zero or more.`);
  if (!(o.need > 0)) w.push("Enter the cash you need, above zero.");
  for (const k of ["nowTaxPct", "retTaxPct", "penaltyPct"]) if (!(o[k] >= 0 && o[k] < 60)) w.push(`${k} looks out of range (0-60%).`);
  if (o.nowTaxPct + o.penaltyPct >= 95) w.push("Tax plus penalty leaves nothing to withdraw.");
  for (const k of ["growthPct", "loanRatePct", "sparePct", "outsideAprPct"]) if (!(o[k] > -50 && o[k] < 60)) w.push(`${k} looks out of range.`);
  if (!(o.horizonYears >= 1 && o.horizonYears <= 50)) w.push("Horizon must be 1-50 years.");
  for (const k of ["loanTermYears", "outsideTermYears"]) {
    if (!(o[k] > 0)) w.push(`${k} must be above zero.`);
    else if (o[k] > o.horizonYears) w.push(`${k} cannot be longer than the horizon.`);
  }
  if (!(o.leaveAfterMonths >= 0)) w.push("Months before leaving the job must be zero or more.");
  return w;
}

// Level monthly payment for a loan of `p` at yearly rate `ratePct` over `years`.
export function payment(p, ratePct, years) {
  const n = Math.round(years * 12);
  const i = ratePct / 100 / 12;
  if (n <= 0) return p;
  return i === 0 ? p / n : (p * i) / (1 - Math.pow(1 + i, -n));
}

// Balance still owed after `k` payments.
export function balanceAfter(p, ratePct, years, k) {
  const n = Math.round(years * 12);
  const i = ratePct / 100 / 12;
  const m = Math.min(Math.max(0, Math.round(k)), n);
  const pay = payment(p, ratePct, years);
  if (i === 0) return Math.max(0, p - pay * m);
  return Math.max(0, p * Math.pow(1 + i, m) - (pay * (Math.pow(1 + i, m) - 1)) / i);
}

const monthly = (annualPct) => Math.pow(1 + annualPct / 100, 1 / 12) - 1;

// Value at the horizon of `pay` deposited at the end of each of `n` months.
function annuityFv(pay, n, annualPct, horizonMonths) {
  const r = monthly(annualPct);
  let v = 0;
  for (let m = 1; m <= n; m++) v += pay * Math.pow(1 + r, horizonMonths - m);
  return v;
}

export function costs(o) {
  const H = Math.round(o.horizonYears * 12);
  const keep = 1 - o.retTaxPct / 100;
  const grow = Math.pow(1 + monthly(o.growthPct), H);

  const maxLoan = Math.min(o.balance, LOAN_CAP, Math.max(LOAN_FLOOR, o.balance * 0.5));
  const L = o.need + o.loanFee;
  const nL = Math.round(o.loanTermYears * 12);
  const pL = payment(L, o.loanRatePct, o.loanTermYears);
  const loanShortfall = L * grow - annuityFv(pL, nL, o.growthPct, H);
  const loanCash = annuityFv(pL, nL, o.sparePct, H);
  const loanCost = keep * loanShortfall + loanCash;

  const wFactor = 1 - o.nowTaxPct / 100 - o.penaltyPct / 100;
  const W = o.need / wFactor;
  const wCost = keep * W * grow;

  const nO = Math.round(o.outsideTermYears * 12);
  const pO = payment(o.need, o.outsideAprPct, o.outsideTermYears);
  const outCost = annuityFv(pO, nO, o.sparePct, H);

  return {
    maxLoan, loanAmount: L, loanPayment: pL, loanInterest: pL * nL - L, loanCost,
    gross: W, taxAndPenalty: W - o.need, withdrawalCost: wCost,
    outsidePayment: pO, outsideInterest: pO * nO - o.need, outsideCost: outCost,
  };
}

export function analyze(input) {
  const o = { ...DEFAULTS, ...input };
  const warnings = validate(o);
  if (warnings.length) return { opts: o, warnings, result: null };
  const c = costs(o);
  const notes = [];
  if (c.loanAmount > c.maxLoan) notes.push(`The loan (${money(c.loanAmount)}) is above the usual plan limit of ${money(c.maxLoan)}; the loan option may not be available at this size.`);
  if (c.gross > o.balance) notes.push(`The gross withdrawal (${money(c.gross)}) is more than the balance.`);
  if (o.penaltyPct === 0) notes.push("Penalty is set to 0%: that is right only at 59½ or older or when an exception applies.");

  const rows = [
    { key: "loan", label: "401(k) loan", cost: c.loanCost },
    { key: "withdrawal", label: "Withdrawal", cost: c.withdrawalCost },
    { key: "outside", label: "Outside loan", cost: c.outsideCost },
  ].sort((a, b) => a.cost - b.cost);

  // Risk: leaving the job with the loan outstanding turns the balance into a taxable distribution (plus penalty
  // if under 59½) unless it is rolled over by the tax filing deadline.
  const owed = balanceAfter(c.loanAmount, o.loanRatePct, o.loanTermYears, o.leaveAfterMonths);
  const separation = { owed, taxAndPenalty: owed * (o.nowTaxPct / 100 + o.penaltyPct / 100) };

  // Sensitivity: the same three costs across investment-growth rates.
  const sens = [2, 4, 6, 8, 10].map((g) => {
    const cc = costs({ ...o, growthPct: g });
    return { growthPct: g, loan: cc.loanCost, withdrawal: cc.withdrawalCost, outside: cc.outsideCost };
  });
  return { opts: o, warnings, notes, result: { ...c, cheapest: rows[0], ranked: rows, separation }, sens };
}

export function toCsv(a) {
  const rows = ["growth_pct,loan_cost_usd,withdrawal_cost_usd,outside_loan_cost_usd"];
  for (const s of a.sens) rows.push(`${s.growthPct},${s.loan.toFixed(2)},${s.withdrawal.toFixed(2)},${s.outside.toFixed(2)}`);
  return rows.join("\n") + "\n";
}
