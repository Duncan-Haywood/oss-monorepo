// W-2 job offer versus 1099 / corp-to-corp contract: the hourly rate a contract must pay to leave
// you with the same cash as the salaried offer. Pure functions, no dependencies, nothing leaves the
// browser. Every rate and the Social Security wage base is an editable input because they change.
//
// Both sides are compared after buying the same benefits: the employee's cash is salary + bonus +
// equity minus the employee half of FICA; the contractor's cash is revenue minus business
// expenses, self-employment tax, a replacement for the employer-paid health premium and a
// replacement for the 401(k) match. Income tax is left out of both sides (it depends on state,
// filing status and the QBI deduction), which slightly favours the contractor: half of
// self-employment tax is deductible and the QBI deduction may apply.

export const DEFAULTS = {
  salary: 150000,
  bonusPct: 10,
  equity: 0,
  matchPct: 4,
  employerHealth: 9000,
  ptoDays: 15,
  holidays: 9,
  hoursPerWeek: 40,
  benchWeeks: 2,
  expenses: 4000,
  offeredRate: 100,
  ssRate: 6.2,
  medicareRate: 1.45,
  wageBase: 184500,
};

export function num(v) {
  if (typeof v === "number") return v;
  const n = Number(String(v ?? "").replace(/[$,%\s]/g, ""));
  return String(v ?? "").trim() === "" ? NaN : n;
}

const nz = (x) => (Number.isFinite(x) && x > 0 ? x : 0);

export function money(x) {
  const n = Math.round(x);
  return (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString("en-US");
}
export function money2(x) {
  return (x < 0 ? "-$" : "$") + Math.abs(x).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Employee half of FICA on W-2 wages.
export function employeeFica(wages, o) {
  const ss = nz(o.ssRate) / 100, med = nz(o.medicareRate) / 100, cap = nz(o.wageBase);
  const w = nz(wages);
  return Math.min(w, cap) * ss + w * med;
}

// Self-employment tax: both halves of FICA on 92.35% of net earnings.
export function selfEmploymentTax(net, o) {
  const ss = 2 * nz(o.ssRate) / 100, med = 2 * nz(o.medicareRate) / 100, cap = nz(o.wageBase);
  const base = nz(net) * 0.9235;
  return Math.min(base, cap) * ss + base * med;
}

function paidWeeksOff(o) {
  const hours = nz(o.hoursPerWeek) || 40;
  const days = hours / 8; // days a week; only used to turn days off into weeks
  const perWeek = Math.min(5, Math.max(1, days));
  return (nz(o.ptoDays) + nz(o.holidays)) / perWeek;
}

// Annual cash the salaried offer leaves you, before income tax and with benefits as given.
export function fteCash(o, payroll = true) {
  const wages = nz(o.salary) * (1 + nz(o.bonusPct) / 100) + nz(o.equity);
  return wages - (payroll ? employeeFica(wages, o) : 0);
}

// Hourly rate at which contract cash equals fteCash. `flags` switches each gap on, so the same
// solver builds the step-by-step waterfall: timeOff, bench, tax, health, match, expenses.
export function breakEvenRate(o, flags = {}) {
  const f = { timeOff: true, bench: true, tax: true, health: true, match: true, expenses: true, ...flags };
  const hours = nz(o.hoursPerWeek) || 40;
  const weeks = Math.max(1, 52 - (f.timeOff ? paidWeeksOff(o) : 0) - (f.bench ? nz(o.benchWeeks) : 0));
  const target = fteCash(o, f.tax);
  const health = f.health ? nz(o.employerHealth) : 0;
  const match = f.match ? nz(o.salary) * nz(o.matchPct) / 100 : 0;
  const expenses = f.expenses ? nz(o.expenses) : 0;
  const cash = (revenue) => revenue - expenses - (f.tax ? selfEmploymentTax(revenue - expenses, o) : 0) - health - match;
  let lo = 0, hi = 1e9;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (cash(mid) < target) lo = mid; else hi = mid;
  }
  const revenue = (lo + hi) / 2;
  return { rate: revenue / (hours * weeks), revenue, hours: hours * weeks, weeks };
}

export function analyze(o) {
  const hours = nz(o.hoursPerWeek) || 40;
  const naive = (nz(o.salary) * (1 + nz(o.bonusPct) / 100) + nz(o.equity)) / (hours * 52);
  const steps = [
    ["Salary, bonus and equity spread over a full year", { timeOff: false, bench: false, tax: false, health: false, match: false, expenses: false }],
    ["Plus unpaid vacation and holidays", { bench: false, tax: false, health: false, match: false, expenses: false }],
    ["Plus unbilled gaps between contracts", { tax: false, health: false, match: false, expenses: false }],
    ["Plus self-employment tax (net of the FICA you stop paying as an employee)", { health: false, match: false, expenses: false }],
    ["Plus buying your own health coverage", { match: false, expenses: false }],
    ["Plus replacing the 401(k) match", { expenses: false }],
    ["Plus business expenses", {}],
  ].map(([label, flags]) => ({ label, ...breakEvenRate(o, flags) }));
  const be = steps[steps.length - 1];
  const rate = nz(o.offeredRate);
  let offer = null;
  if (rate > 0) {
    const revenue = rate * be.hours;
    const net = revenue - nz(o.expenses);
    const contractCash = net - selfEmploymentTax(net, o) - nz(o.employerHealth) - nz(o.salary) * nz(o.matchPct) / 100;
    const fte = fteCash(o);
    offer = { rate, revenue, contractCash, fteCash: fte, diff: contractCash - fte, shortfallRate: Math.max(0, be.rate - rate) };
  }
  return { naive, steps, breakEven: be, multiplier: naive > 0 ? be.rate / naive : 0, offer, fteCash: fteCash(o) };
}
