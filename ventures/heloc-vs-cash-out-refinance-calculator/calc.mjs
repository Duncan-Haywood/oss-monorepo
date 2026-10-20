// HELOC against cash-out refinance. Pure functions, no dependencies, nothing leaves the browser.
// Everything is arithmetic on figures the user types in.
//
// You need cash C and own a home with a first mortgage you already like. Two ways to get it:
//   A) keep the first mortgage as it is and add a HELOC of C (interest-only for a draw period, then
//      amortizing; one average rate assumed for its whole life)
//   B) replace the first mortgage with one new loan of (balance + C) at today's rate, new term
// Both pay their closing costs in cash on day 0 and both leave you holding the same C, so what is
// compared is only what each costs by month t, if the debts end (sale or refinance) then:
//   cost_t = sum over months m<=t of (payment_m - tax x interest_m) x (1+i)^(t-m)
//            + closing x (1+i)^t + debt still owed at t
// where i is the monthly return on money you would otherwise have kept. Lower is better.

export const DEFAULTS = {
  balance: 220000,
  oldRate: 3,
  oldYears: 25,
  cash: 60000,
  helocRate: 8.5,
  helocCost: 500,
  interestOnlyYears: 10,
  helocYears: 30,
  refiRate: 6.75,
  refiYears: 30,
  refiCostPct: 2.5,
  horizon: 7,
  investReturn: 4.5,
  taxRate: 0,
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

// Month-by-month schedule for months 1..n: pay[m], interest[m], balance[m] (index 0 is day 0).
// The first ioYears are interest-only, then the balance amortizes over what is left of the term.
export function schedule(loan, annualRatePct, termYears, ioYears = 0) {
  const n = Math.round(termYears * 12);
  const io = Math.min(Math.round(ioYears * 12), Math.max(n - 1, 0));
  const r = annualRatePct / 100 / 12;
  const pay = [0], interest = [0], balance = [loan];
  let b = loan, level = 0;
  for (let m = 1; m <= n; m++) {
    const i = b * r;
    let p;
    if (m <= io) p = i;
    else {
      if (!level) level = payment(b, annualRatePct, (n - m + 1) / 12);
      p = m === n ? b + i : level;
    }
    b = m === n ? 0 : b - (p - i);
    pay.push(p); interest.push(i); balance.push(b);
  }
  return { pay, interest, balance, n };
}

const at = (arr, m) => (m < arr.length ? arr[m] : 0);

function legs(o) {
  const cash = nz(o.cash), bal = nz(o.balance);
  const old = schedule(bal, o.oldRate, o.oldYears);
  const heloc = schedule(cash, o.helocRate, o.helocYears, o.interestOnlyYears);
  const refi = schedule(bal + cash, o.refiRate, o.refiYears);
  return { old, heloc, refi, bal, cash, refiClosing: ((bal + cash) * nz(o.refiCostPct)) / 100, helocClosing: nz(o.helocCost) };
}

// Cost of each route if the debts end at each month 0..maxMonths.
export function costByMonth(o) {
  const L = legs(o);
  const maxM = Math.max(L.old.n, L.heloc.n, L.refi.n);
  const i = Math.pow(1 + o.investReturn / 100, 1 / 12) - 1;
  const tax = o.taxRate / 100;
  let fa = 0, fb = 0;
  const rows = [{ month: 0, a: L.helocClosing, b: L.refiClosing, diff: L.refiClosing - L.helocClosing }];
  for (let m = 1; m <= maxM; m++) {
    const pa = at(L.old.pay, m) + at(L.heloc.pay, m) - tax * (at(L.old.interest, m) + at(L.heloc.interest, m));
    const pb = at(L.refi.pay, m) - tax * at(L.refi.interest, m);
    fa = fa * (1 + i) + pa;
    fb = fb * (1 + i) + pb;
    const g = Math.pow(1 + i, m);
    const a = fa + L.helocClosing * g + at(L.old.balance, m) + at(L.heloc.balance, m);
    const b = fb + L.refiClosing * g + at(L.refi.balance, m);
    rows.push({ month: m, a, b, diff: b - a });
  }
  return { rows, L, maxM };
}

// HELOC average rate at which the two routes cost the same at month hm (bisection); null if one
// route wins at every rate between 0% and 40%.
export function breakEvenHelocRate(o, hm) {
  const f = (r) => {
    const rows = costByMonth({ ...o, helocRate: r }).rows;
    return rows[Math.min(hm, rows.length - 1)].diff;
  };
  let lo = 0, hi = 40;
  if (f(lo) < 0 || f(hi) > 0) return null;
  for (let k = 0; k < 60; k++) {
    const mid = (lo + hi) / 2;
    if (f(mid) > 0) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

export function analyze(raw) {
  const o = { ...DEFAULTS, ...raw };
  const warnings = [];
  if (!(o.cash > 0)) warnings.push("Enter the cash you need.");
  if (!(o.balance >= 0)) warnings.push("The mortgage balance cannot be negative. Use 0 if the home is paid off.");
  if (!(o.oldYears > 0) && o.balance > 0) warnings.push("Enter the years left on your current mortgage.");
  if (!(o.helocYears > 0) || !(o.refiYears > 0)) warnings.push("Enter a term for the HELOC and for the new mortgage.");
  const tooLong = o.oldYears > 100 || o.helocYears > 100 || o.refiYears > 100;
  if (tooLong) warnings.push("Enter terms of 100 years or less.");
  if (!(o.oldRate >= 0) || !(o.helocRate >= 0) || !(o.refiRate >= 0)) warnings.push("Rates cannot be negative.");
  if (o.interestOnlyYears >= o.helocYears) warnings.push("The interest-only period must be shorter than the HELOC term; it was shortened.");
  if (warnings.length && (tooLong || !(o.cash > 0) || !(o.helocYears > 0) || !(o.refiYears > 0) || !(o.balance >= 0) || (o.balance > 0 && !(o.oldYears > 0)))) return { warnings, rows: [] };

  const { rows, L, maxM } = costByMonth(o);
  const horizon = Math.min(nz(o.horizon) || 7, maxM / 12);
  const hm = Math.round(horizon * 12);
  const atH = rows[hm];
  const payA1 = at(L.old.pay, 1) + at(L.heloc.pay, 1);
  const ioEnd = Math.round(Math.min(o.interestOnlyYears, o.helocYears - 1 / 12) * 12);
  const payAAfter = at(L.old.pay, ioEnd + 1) + at(L.heloc.pay, ioEnd + 1);
  const payB = at(L.refi.pay, 1);

  let crossover = null;
  for (let m = 1; m < rows.length; m++) {
    if (Math.sign(rows[m].diff) !== Math.sign(rows[1].diff) && rows[m].diff !== 0) { crossover = m; break; }
  }
  const oldPay = at(L.old.pay, 1);
  // What replacing the old mortgage costs per year in extra interest on the balance you already had.
  const repricing = L.bal > 0 ? (L.bal * (o.refiRate - o.oldRate)) / 100 : 0;
  const blended = L.bal + L.cash > 0 ? (L.bal * o.oldRate + L.cash * o.helocRate) / (L.bal + L.cash) : 0;

  const horizons = [...new Set([1, 2, 3, 5, 7, 10, 15].filter((y) => y * 12 <= maxM).concat([Math.round(horizon) || 1]))].sort((x, y) => x - y);
  const shifts = [0, 1, 2, 3];
  const grid = horizons.map((y) => ({
    years: y,
    values: shifts.map((s) => costByMonth({ ...o, helocRate: o.helocRate + s }).rows[Math.round(y * 12)].diff),
  }));

  return {
    warnings,
    rows,
    horizon,
    helocWins: atH.diff > 0,
    advantage: atH.diff,
    costHeloc: atH.a,
    costRefi: atH.b,
    payHeloc1: payA1,
    payHelocAfterIo: payAAfter,
    payOld: oldPay,
    payRefi: payB,
    refiClosing: L.refiClosing,
    helocClosing: L.helocClosing,
    owedHeloc: at(L.old.balance, hm) + at(L.heloc.balance, hm),
    owedRefi: at(L.refi.balance, hm),
    repricing,
    blended,
    breakEvenHelocRate: breakEvenHelocRate(o, hm),
    crossover,
    shifts,
    grid,
  };
}
