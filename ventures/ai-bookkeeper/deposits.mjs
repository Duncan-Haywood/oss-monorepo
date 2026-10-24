// Federal payroll tax deposit schedule (IRS Publication 15, section 7).
// The payroll register says what was withheld; this says when the IRS wanted
// it and whether the bank shows it paid in time.
//
// Rules modelled:
//  - Lookback: total Form 941 taxes in the 12 months from July 1 two years
//    back to June 30 of last year. $50,000 or less -> monthly depositor, more
//    -> semiweekly. A new employer (no lookback payroll) is monthly.
//  - Monthly: a month's liability is due the 15th of the next month.
//  - Semiweekly: pay days Wed-Fri are due the next Wednesday, Sat-Tue the
//    next Friday; in effect the third business day after the period ends.
//  - $100,000 next-day rule: once undeposited liability reaches $100,000 it is
//    due the next business day, and the employer is semiweekly for the rest
//    of the year and the next.
//  - A quarter with under $2,500 of liability can be paid with Form 941.
//  - A due date on a weekend or federal holiday moves to the next business day.
// Late deposits get the failure-to-deposit penalty tier (2%, 5%, 10%, 15%) on the
// amount paid late; the tier is an estimate (interest, abatement and the
// ordering rule for partial payments are not modelled). Bank matching reuses
// planPayroll, so a deposit shows as paid only when a bank line was found.
// Hand-made registers only; not payroll or tax advice.

import { federalDeposit, planPayroll } from "./payroll.mjs";
import { nextBusinessDay } from "./salestaxreturn.mjs";

export const LOOKBACK_LIMIT = 5000000;      // $50,000
export const NEXT_DAY_LIMIT = 10000000;     // $100,000
export const DE_MINIMIS = 250000;           // $2,500 a quarter

const iso = (dt) => dt.toISOString().slice(0, 10);
const addDays = (d, n) => iso(new Date(Date.parse(`${d}T00:00:00Z`) + n * 864e5));
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 864e5);
const dow = (d) => new Date(`${d}T00:00:00Z`).getUTCDay();
const businessDaysAfter = (d, n) => { let x = d; for (let i = 0; i < n; i++) x = nextBusinessDay(addDays(x, 1)); return x; };

// Semiweekly deposit period end (Tuesday or Friday) for a pay date.
const periodEnd = (d) => {
  const w = dow(d);                       // 0 Sun .. 6 Sat
  if (w >= 3 && w <= 5) return addDays(d, 5 - w);   // Wed-Fri -> Friday
  return addDays(d, (2 - w + 7) % 7);               // Sat-Tue -> Tuesday
};

export function lookbackTotal(books, year) {
  const from = `${year - 2}-07-01`, to = `${year - 1}-06-30`;
  const runs = (books.payroll ?? []).filter((r) => r.date >= from && r.date <= to);
  const first = (books.payroll ?? [])[0]?.date ?? null;
  return { from, to, runs: runs.length, total: runs.reduce((a, r) => a + federalDeposit(r), 0), covered: first !== null && first <= from };
}

export function depositSchedule(books, year, { schedule = null, asOf = null } = {}) {
  year = Number(year);
  if (schedule && !["monthly", "semiweekly"].includes(schedule)) throw new Error("schedule must be monthly or semiweekly");
  const warnings = [];
  const lb = lookbackTotal(books, year);
  let sched = schedule ?? (lb.total > LOOKBACK_LIMIT ? "semiweekly" : "monthly");
  let basis = schedule ? "given" : lb.runs === 0 ? "no payroll in the lookback period" : `lookback ${lb.total / 100} vs 50,000`;
  // A monthly depositor who hit the $100,000 rule last year is semiweekly this year too.
  if (!schedule && sched === "monthly" && (books.payroll ?? []).some((r) => r.date < `${year}-01-01`)) {
    const prev = depositSchedule(books, year - 1);
    if (prev.switchedOn) { sched = "semiweekly"; basis = `$100,000 next-day rule hit on ${prev.switchedOn} (semiweekly that year and the next)`; }
  }
  if (!schedule && !lb.covered && (books.payroll ?? []).length) warnings.push(`The register starts after ${lb.from}, so the lookback total (${(lb.total / 100).toFixed(2)}) may be short; pass --schedule if you know your schedule from the IRS notice.`);
  const runs = (books.payroll ?? []).filter((r) => r.date >= `${year}-01-01` && r.date <= `${year}-12-31`);
  const plan = planPayroll(books);
  const paidOn = new Map(), unmatched = new Set();
  for (const m of plan.matched) if (m.kind.startsWith("federal deposit")) for (const id of m.run.split("+")) paidOn.set(id, m.lineDate);
  for (const u of plan.unmatched) if (u.kind === "federal deposit") unmatched.add(u.run);

  // $100,000 rule: walk days, accumulating undeposited liability per period.
  const dues = [];   // { runs: [ids], amount, liabilityDates, due, rule }
  const mk = (rs, due, rule) => dues.push({ runs: rs.map((r) => r.id), from: rs[0].date, to: rs[rs.length - 1].date, amount: rs.reduce((a, r) => a + federalDeposit(r), 0), due, rule });
  let nextDay = false, switchedOn = null;
  const groups = new Map();
  if (sched === "monthly") {      // the first day a month's liability reaches $100,000 turns a monthly depositor semiweekly
    const acc = new Map();
    for (const r of runs) {
      const m = r.date.slice(0, 7);
      acc.set(m, (acc.get(m) ?? 0) + federalDeposit(r));
      if (acc.get(m) >= NEXT_DAY_LIMIT) { switchedOn = addDays(r.date, 1); break; }
    }
  }
  for (const r of runs) {
    const amt = federalDeposit(r);
    if (!amt) continue;
    // Pub. 15 (2026), "Semiweekly deposit period spanning 2 quarters": pay dates in different quarters are separate deposits, both due the same day.
    const key = sched === "monthly" && (!switchedOn || r.date < switchedOn) ? r.date.slice(0, 7) : `${periodEnd(r.date)}|Q${Math.ceil(Number(r.date.slice(5, 7)) / 3)}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  for (const [key, rs] of groups) {
    let acc = 0, batch = [];
    const flush = (rule, due) => { if (batch.length) mk(batch, due, rule); batch = []; acc = 0; };
    for (const r of rs) {
      batch.push(r); acc += federalDeposit(r);
      if (acc >= NEXT_DAY_LIMIT) { flush("next-day ($100,000)", nextBusinessDay(addDays(r.date, 1))); nextDay = true; }
    }
    if (batch.length) {
      if (/^\d{4}-\d\d$/.test(key)) flush("monthly", nextBusinessDay(`${addDays(`${key}-01`, 31).slice(0, 7)}-15`));
      else flush("semiweekly", businessDaysAfter(key.slice(0, 10), 3));
    }
  }
  if (switchedOn) warnings.push(`A $100,000 liability makes a monthly depositor semiweekly from the next day (${switchedOn}) for the rest of the year and the next; liability after it is scheduled as semiweekly.`);
  dues.sort((a, b) => a.due.localeCompare(b.due));

  // De minimis: a quarter under $2,500 is paid with Form 941, no deposit due.
  const q = (d) => Math.ceil(Number(d.slice(5, 7)) / 3);
  const qTotal = [0, 0, 0, 0, 0];
  for (const d of dues) qTotal[q(d.from)] += d.amount;
  for (const d of dues) {
    if (qTotal[q(d.from)] < DE_MINIMIS) d.rule += "; under $2,500 for the quarter, pay with Form 941";
    const dates = d.runs.map((id) => paidOn.get(id)).filter(Boolean);
    const ok = dates.length === d.runs.length;
    d.paid = ok ? dates.sort().at(-1) : null;
    d.status = ok ? (d.paid <= d.due ? "on time" : "late") : (d.runs.some((id) => unmatched.has(id)) || !dates.length ? "no bank line found" : "partly matched");
    if (d.status === "late") {
      const days = daysBetween(d.due, d.paid);
      d.daysLate = days;
      d.penaltyPct = days <= 5 ? 2 : days <= 15 ? 5 : 10;
      d.penalty = Math.round(d.amount * d.penaltyPct / 100);
    }
    if (d.status !== "on time" && asOf && d.due > asOf && !d.paid) d.status = "not due yet";
  }
  return { year, schedule: sched, basis, lookback: lb, nextDay, switchedOn, deposits: dues, warnings };
}
