// Mortgage discount-points break-even evaluator. Pure functions, no dependencies, nothing leaves the
// browser. Everything is arithmetic on a loan estimate the user types in.
//
// Model, monthly steps over the loan term. Two loans on the same amount, the same term and the same
// closing day: A pays points up front for a lower rate, B takes the higher rate with no points.
//   saving_m   = payment_B - payment_A - tax% x (interest_B_m - interest_A_m)   (a lower interest bill
//                shrinks the deduction, so the tax rate eats part of the saving; 0 if not itemizing)
//   advantage_t = sum saving_m x (1+i)^(t-m)  -  points x (1+i)^t  +  (balance_B_t - balance_A_t)
//                where i is the monthly return on cash you would otherwise have kept. That is the dollars
//                A is ahead of B if the loan ends (sale or refinance) at month t.
// "Moving" is a yearly chance of selling or refinancing, turned into a monthly hazard, so the expected
// advantage weights each possible end month by the chance the loan really ends then.

export const DEFAULTS = {
  loan: 400000,
  baseRate: 6.75,
  pointsPct: 1,
  pointsRate: 6.375,
  term: 30,
  horizon: 7,
  investReturn: 4.5,
  taxRate: 0,
  moveChance: 10,
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
export function pct(x, d = 2) {
  return Number.isFinite(x) ? x.toFixed(d) + "%" : "n/a";
}

export function payment(loan, annualRatePct, termYears) {
  const n = Math.round(termYears * 12);
  const r = annualRatePct / 100 / 12;
  if (n <= 0 || loan <= 0) return 0;
  return r === 0 ? loan / n : (loan * r) / (1 - Math.pow(1 + r, -n));
}

// Month-by-month schedule: balance[m] and interest[m] for m = 1..n (index 0 is the closing day).
export function schedule(loan, annualRatePct, termYears) {
  const n = Math.round(termYears * 12);
  const r = annualRatePct / 100 / 12;
  const pay = payment(loan, annualRatePct, termYears);
  const balance = [loan];
  const interest = [0];
  let b = loan;
  for (let m = 1; m <= n; m++) {
    const i = b * r;
    b = m === n ? 0 : b - (pay - i);
    balance.push(b);
    interest.push(i);
  }
  return { pay, balance, interest, n };
}

// Dollars loan A (points) is ahead of loan B (no points) if both end at each month 0..n.
export function advantageByMonth(o) {
  const a = schedule(o.loan, o.pointsRate, o.term);
  const b = schedule(o.loan, o.baseRate, o.term);
  const points = (o.loan * o.pointsPct) / 100;
  const i = Math.pow(1 + o.investReturn / 100, 1 / 12) - 1;
  const tax = o.taxRate / 100;
  const out = [{ month: 0, advantage: -points, saving: 0, balanceGap: 0 }];
  let fv = 0;
  for (let m = 1; m <= a.n; m++) {
    const saving = b.pay - a.pay - tax * (b.interest[m] - a.interest[m]);
    fv = fv * (1 + i) + saving;
    const balanceGap = b.balance[m] - a.balance[m];
    out.push({ month: m, advantage: fv - points * Math.pow(1 + i, m) + balanceGap, saving, balanceGap });
  }
  return { rows: out, a, b, points };
}

function irrAnnual(points, savings, endGap, months) {
  // Monthly rate m solving  points = sum saving_k/(1+m)^k + endGap/(1+m)^months.
  const f = (m) => {
    let pv = endGap / Math.pow(1 + m, months);
    for (let k = 1; k <= months; k++) pv += savings[k] / Math.pow(1 + m, k);
    return pv - points;
  };
  let lo = -0.3, hi = 0.1;
  if (f(lo) < 0 || f(hi) > 0) return null;
  for (let k = 0; k < 120; k++) {
    const mid = (lo + hi) / 2;
    if (f(mid) > 0) lo = mid; else hi = mid;
  }
  return (Math.pow(1 + (lo + hi) / 2, 12) - 1) * 100;
}

// Expected advantage when the loan ends at a random month: chance of ending in month t is
// survive(t-1) x hazard; whatever survives to maturity ends at month n.
export function expectedAdvantage(rows, n, moveChancePct) {
  const q = Math.min(Math.max(moveChancePct / 100, 0), 0.9999);
  const h = 1 - Math.pow(1 - q, 1 / 12);
  let alive = 1, expected = 0, pWin = 0;
  for (let t = 1; t <= n; t++) {
    const end = t === n ? alive : alive * h;
    expected += end * rows[t].advantage;
    if (rows[t].advantage >= 0) pWin += end;
    alive -= alive * h;
  }
  return { expected, pWin };
}

export function analyze(raw) {
  const o = { ...DEFAULTS, ...raw };
  const warnings = [];
  if (!(o.loan > 0)) warnings.push("Enter the loan amount.");
  if (!(o.term > 0)) warnings.push("Enter the loan term in years.");
  if (!(o.baseRate >= 0) || !(o.pointsRate >= 0)) warnings.push("Rates cannot be negative.");
  if (!(o.pointsPct >= 0)) warnings.push("Points cost cannot be negative. For a lender credit, see the FAQ.");
  if (o.pointsRate >= o.baseRate) warnings.push("The rate with points should be lower than the rate without. Otherwise the points buy nothing.");
  if (o.horizon > o.term) warnings.push("You plan to keep the loan longer than its term; the horizon was capped at the term.");
  if (warnings.length && (!(o.loan > 0) || !(o.term > 0) || o.pointsRate >= o.baseRate)) return { warnings, rows: [] };

  const horizon = Math.min(nz(o.horizon) || o.term, o.term);
  const hm = Math.round(horizon * 12);
  const { rows, a, b, points } = advantageByMonth(o);
  const n = a.n;
  const monthlySaving = b.pay - a.pay;
  const simpleBreakEven = monthlySaving > 0 ? points / monthlySaving : null;
  const firstWin = rows.find((r) => r.month > 0 && r.advantage >= 0);
  const trueBreakEven = firstWin ? firstWin.month : null;
  const savings = rows.map((r) => r.saving);
  const irr = points > 0 ? irrAnnual(points, savings, rows[hm].balanceGap, hm) : null;
  const { expected, pWin } = expectedAdvantage(rows, n, o.moveChance);
  const q = Math.min(Math.max(o.moveChance / 100, 0), 0.9999);
  const reachBreakEven = trueBreakEven === null ? 0 : Math.pow(1 - q, trueBreakEven / 12);

  const horizons = [...new Set([2, 3, 5, 7, 10, 15, 20, 30].filter((y) => y <= o.term).concat([Math.min(o.term, Math.max(1, Math.round(o.horizon)))]))].sort((x, y) => x - y);
  const returns = [...new Set([0, o.investReturn, 8])].sort((x, y) => x - y);
  const grid = horizons.map((y) => ({
    years: y,
    values: returns.map((rt) => advantageByMonth({ ...o, investReturn: rt }).rows[Math.round(y * 12)].advantage),
  }));

  return {
    warnings,
    rows,
    points,
    payA: a.pay,
    payB: b.pay,
    monthlySaving,
    rateDrop: o.baseRate - o.pointsRate,
    dropPerPoint: o.pointsPct > 0 ? (o.baseRate - o.pointsRate) / o.pointsPct : null,
    simpleBreakEven,
    trueBreakEven,
    reachBreakEven,
    atHorizon: rows[hm].advantage,
    horizon,
    interestSavedAtHorizon: b.interest.slice(1, hm + 1).reduce((s, x) => s + x, 0) - a.interest.slice(1, hm + 1).reduce((s, x) => s + x, 0),
    irr,
    expected,
    pWin,
    returns,
    grid,
  };
}
