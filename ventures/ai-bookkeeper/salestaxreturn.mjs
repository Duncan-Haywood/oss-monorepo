// A sales tax return worksheet by jurisdiction. The tax line of an invoice
// (account 2100) carries the jurisdiction in its description column ("CA state",
// "LA county"); a tax line with no description is "Unlabelled". Per jurisdiction
// and filing period: gross sales, taxable sales (invoices that carry a tax line
// for it), non-taxable sales (invoices that carry none), credits, tax due, the
// implied rate against taxable sales and the due date. A worksheet to check a
// return against, not a filing: rates, exemptions, vendor discounts and due
// dates are the state's to say. A due date that falls on a weekend or a US
// federal holiday moves to the next business day (`rollover: false` keeps the
// calendar date). `discounts: { "CA state": { rate: 0.005, cap: 10000 } }` takes
// a timely-filing discount (cents cap) off that jurisdiction's tax, and bank
// lines filed to the tax account are matched to the period they most plausibly
// pay (the last period that ended before the payment), so each period shows
// paid and still owed (`asOf: "YYYY-MM-DD"` warns on any period still unpaid
// past its due date). -> { periods, warnings, totals }
import { journal } from "./engine.mjs";
const ym = (d) => d.slice(0, 7);
const LEN = { monthly: 1, quarterly: 3, semiannual: 6 };
const pad = (n) => String(n).padStart(2, "0");
// A quarter or half-year that does not end in a calendar-aligned month is labelled by the
// month it ends in ("2026-05"); `endMonth` is the month of the year's first period end
// (quarterly: 1-3, semiannual: 1-6). Default 3 and 6 keep "2026-Q1" and "2026-H1".
const periodOf = (d, freq, endMonth) => {
  const [y, m] = [Number(d.slice(0, 4)), Number(d.slice(5, 7))];
  if (freq === "monthly") return ym(d);
  if (freq === "annual") return String(y);
  const len = LEN[freq];
  if (endMonth == null || endMonth === len) return freq === "semiannual" ? `${y}-H${Math.ceil(m / 6)}` : `${y}-Q${Math.ceil(m / 3)}`;
  const steps = (len - ((m - endMonth) % len + len) % len) % len;
  const t = m + steps;
  return t > 12 ? `${y + 1}-${pad(t - 12)}` : `${y}-${pad(t)}`;
};
const periodEnd = (p) => {
  if (/^\d{4}$/.test(p)) return [Number(p), 12];
  if (/Q/.test(p)) return [Number(p.slice(0, 4)), Number(p.slice(6)) * 3];
  if (/H/.test(p)) return [Number(p.slice(0, 4)), Number(p.slice(6)) * 6];
  return [Number(p.slice(0, 4)), Number(p.slice(5))];
};
// Due day of the month after the period, by state, from the states' published
// monthly/quarterly schedules as the author recalls them: check yours
// (a state's own calendar can differ by filing frequency). "last" = month end.
export const STATE_DUE_DAYS = { CA: "last", TX: 20, FL: 20, NY: 20, WA: 25, IL: 20, PA: 20, NJ: 20, GA: 20, NC: 20, OH: 23, MA: 20, VA: 20, AZ: 20, MI: 20, CT: "last", WI: "last", UT: "last", IN: 30, KS: 25, CO: 20, MN: 20, TN: 20, AL: 20, SC: 20, NM: 25 };
// TN (tn.gov/revenue due-dates page: monthly and quarterly the 20th, annual Jan 20), AL, SC (third-party guides: the 20th) and NM (aggregator calendars: the 25th; some filers differ) added 2026-10-24 from search excerpts; state sites mostly not read.
// CO, MN: the 20th (third-party due-date tables, TaxCloud and TaxJar, via search 2026-10-24; state sites not read). Check your own notice.
// MI (michigan.gov Treasury: monthly and quarterly the 20th, annual return Feb 28 not modelled), CT (OS-114: last day of the month after, monthly, quarterly
// and annual), WI (revenue.wi.gov FAQ: last day of the month after; "early monthly" filers the 20th, not modelled), UT (tax.utah.gov: last day of the
// month after), IN (DOR filing-deadlines page and bulletin 102: the 30th, early filers the 20th, not modelled; a 30th that does not exist in February
// is clamped to month end) and KS (ST-36 form: the 25th) added 2026-10-24 from search excerpts of those pages, not the full forms.
// VA (tax.virginia.gov ST-9 package, July 2023 and later: "return and payment due on 20th of month following end of period") and AZ
// (TPT: the 20th; azdor.gov and Phoenix guidance; e-filers get until month end, not modelled) added 2026-10-24 from search excerpts.
// Both equal the default of 20, listed so the schedule is explicit and a later change to the default cannot silently move them.
// Added 2026-10-24 from search excerpts (NJ: nj.gov Division of Taxation, 20th after the period, quarterly or monthly;
// GA, NC: third-party guides, monthly and quarterly 20th; OH: 23rd, monthly, quarterly and semiannual Jan-Jun/Jul-Dec).
// MA: monthly returns the 20th; quarterly and annual returns 30 days after the period closes (the rule since 2021, from
// memory and search excerpts, not re-read on mass.gov), modelled as `{ after: 30 }` in stateDueDay.
// Checked 2026-10-24 against the states' own pages (via search excerpts): CA quarterly
// = last day of the month after the quarter; TX = 20th, monthly and quarterly; FL = due
// the 1st, late after the 20th; WA monthly = 25th but quarterly = end of the next month.
// Checked 2026-10-24 (search excerpts of tax.ny.gov ST-100 instructions, tax.illinois.gov ST-1
// instructions, revenue.pa.gov REV-819): NY, IL and PA monthly and quarterly returns are due the
// 20th, next business day if that is a weekend or holiday. WA annual returns are due April 15 (not modelled).
// NY quarters are Mar-May, Jun-Aug, Sep-Nov, Dec-Feb (due the 20th after), not calendar quarters;
// PA semiannual periods are Feb-Jul and Aug-Jan (due Aug 20 and Feb 20). Both are modelled via
// stateEndMonth (NY quarterly ends in Feb, PA semiannual in Jan); other states use calendar periods.
// The 2026-10-24 excerpts were not re-read against the full forms: check your own notice.
export function stateFilingNote(state, frequency = "quarterly") {
  const s = String(state ?? "").toUpperCase();
  if (s === "PA" && frequency === "annual") return "Pennsylvania has no annual return; assigned filers file monthly, quarterly or semiannually (due Aug 20 and Feb 20), use --freq semiannual with --state PA for the Feb-Jul and Aug-Jan periods.";
  return null;
}
export function stateEndMonth(state, frequency = "quarterly") {
  const s = String(state ?? "").toUpperCase();
  if (s === "NY" && frequency === "quarterly") return 2;
  if (s === "PA" && frequency === "semiannual") return 1;
  return null;
}
export function stateDueDay(state, frequency = "quarterly") {
  const s = String(state ?? "").toUpperCase();
  if (s === "WA" && frequency !== "monthly") return "last";
  if (s === "MA" && frequency !== "monthly") return { after: 30 };
  return STATE_DUE_DAYS[s] ?? 20;
}
export function dueDate(period, dueDay = 20) {
  let [y, m] = periodEnd(period);
  // { after: N } = N calendar days after the period's last day (Massachusetts quarterly and annual)
  if (dueDay && typeof dueDay === "object") return iso(new Date(Date.UTC(y, m, dueDay.after)));
  m += 1; if (m > 12) { m = 1; y += 1; }
  const monthEnd = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const day = dueDay === "last" ? monthEnd : Math.min(dueDay, monthEnd);
  return `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

const iso = (dt) => `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
// nth (1-based) weekday (0 Sun .. 6 Sat) of a month; n = -1 for the last
const nthWeekday = (y, m, wd, n) => {
  if (n > 0) return 1 + ((wd - new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 7) % 7) + (n - 1) * 7;
  const last = new Date(Date.UTC(y, m, 0));
  return last.getUTCDate() - ((last.getUTCDay() - wd + 7) % 7);
};
// US federal holidays for a year, observed on the nearest weekday (Sat -> Fri, Sun -> Mon)
export function usHolidays(y) {
  const fixed = [[1, 1], [6, 19], [7, 4], [11, 11], [12, 25]].map(([m, d]) => {
    const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    const dt = new Date(Date.UTC(y, m - 1, d + (wd === 6 ? -1 : wd === 0 ? 1 : 0)));
    return iso(dt);
  });
  const mk = (m, wd, n) => `${y}-${pad(m)}-${pad(nthWeekday(y, m, wd, n))}`;
  return new Set([...fixed, mk(1, 1, 3), mk(2, 1, 3), mk(5, 1, -1), mk(9, 1, 1), mk(10, 1, 2), mk(11, 4, 4)]);
}
export function nextBusinessDay(date) {
  const dt = new Date(`${date}T00:00:00Z`);
  for (;;) {
    const wd = dt.getUTCDay();
    // a Jan 1 observed on the prior Dec 31 belongs to the next year's set
    const hol = usHolidays(dt.getUTCFullYear()).has(iso(dt)) || usHolidays(dt.getUTCFullYear() + 1).has(iso(dt));
    if (wd !== 0 && wd !== 6 && !hol) return iso(dt);
    dt.setUTCDate(dt.getUTCDate() + 1);
  }
}
// the filing period that ended before the one a payment falls in
const periodBefore = (d, freq, endMonth) => {
  if (freq === "annual") return String(Number(d.slice(0, 4)) - 1);
  let [y, m] = periodEnd(periodOf(d, freq, endMonth));
  m -= LEN[freq];
  while (m < 1) { m += 12; y -= 1; }
  return periodOf(`${y}-${pad(m)}-01`, freq, endMonth);
};

export function salesTaxReturn(books, { account = "2100", frequency = "quarterly", endMonth = null, dueDay = 20, from = null, to = null, rates = {}, rollover = true, discounts = {}, asOf = null } = {}) {
  if (!["monthly", "quarterly", "semiannual", "annual"].includes(frequency)) throw new Error("frequency must be monthly, quarterly, semiannual or annual");
  if (endMonth != null && !(Number.isInteger(endMonth) && endMonth >= 1 && endMonth <= (LEN[frequency] ?? 1))) throw new Error("endMonth must be a month within the first period of the year");
  const cells = new Map();
  const cell = (period, j) => {
    const k = `${period}|${j}`;
    if (!cells.has(k)) cells.set(k, { period, jurisdiction: j, taxableSales: 0, creditedSales: 0, tax: 0, taxCredited: 0 });
    return cells.get(k);
  };
  const nontax = new Map();
  const warnings = [];
  for (const d of books.documents ?? []) {
    if (d.kind !== "invoice" || (from && d.date < from) || (to && d.date > to)) continue;
    const period = periodOf(d.date, frequency, endMonth);
    const taxLines = d.lines.filter((l) => l.account === account);
    const base = d.total - taxLines.reduce((a, l) => a + l.cents, 0);
    if (!taxLines.length) {
      const sign = d.credit ? -1 : 1;
      nontax.set(period, (nontax.get(period) ?? 0) + sign * base);
      continue;
    }
    for (const l of taxLines) {
      const c = cell(period, l.desc || "Unlabelled");
      if (d.credit) { c.tax -= l.cents; c.taxCredited += l.cents; c.creditedSales += base; c.taxableSales -= base; }
      else { c.tax += l.cents; c.taxableSales += base; }
    }
  }
  const rows = [...cells.values()].sort((a, b) => a.period.localeCompare(b.period) || a.jurisdiction.localeCompare(b.jurisdiction));
  for (const r of rows) {
    r.rate = r.taxableSales ? r.tax / r.taxableSales : null;
    r.due = dueDate(r.period, dueDay);
    if (rollover) r.due = nextBusinessDay(r.due);
    const disc = discounts[r.jurisdiction];
    r.discount = disc && r.tax > 0 ? Math.min(Math.round(r.tax * disc.rate), disc.cap ?? Infinity) : 0;
    r.payable = r.tax - r.discount;
    const want = rates[r.jurisdiction];
    if (want != null && r.rate != null && Math.abs(r.rate - want) > 0.0005) {
      warnings.push(`${r.jurisdiction} ${r.period}: collected ${(r.rate * 100).toFixed(2)}% of taxable sales, expected ${(want * 100).toFixed(2)}%.`);
    }
    if (r.jurisdiction === "Unlabelled") warnings.push(`${r.period}: tax lines with no description cannot be split by jurisdiction; put the jurisdiction in the line's description column.`);
  }
  const paid = new Map();
  for (const e of journal(books)) {
    if (e.source === "invoice" || e.source === "credit" || e.source === "bill" || (from && e.date < from) || (to && e.date > to)) continue;
    for (const l of e.lines) if (l.account === account && l.debit) {
      const k = periodBefore(e.date, frequency, endMonth);
      paid.set(k, (paid.get(k) ?? 0) + l.debit);
    }
  }
  const periods = [...new Set([...rows.map((r) => r.period), ...nontax.keys(), ...paid.keys()])].sort().map((period) => {
    const prow = rows.filter((r) => r.period === period);
    const payable = prow.reduce((a, r) => a + r.payable, 0);
    const p = { period, nonTaxableSales: nontax.get(period) ?? 0, rows: prow, payable, paid: paid.get(period) ?? 0 };
    p.owed = p.payable - p.paid;
    const due = prow.map((r) => r.due).sort()[0];
    if (p.owed > 0 && due && asOf && due < asOf) warnings.push(`${period}: $${(p.owed / 100).toFixed(2)} still unpaid after the ${due} due date.`);
    if (p.owed < 0) warnings.push(`${period}: paid over $${(-p.owed / 100).toFixed(2)} more than the return shows; check for a late payment filed to the wrong period.`);
    return p;
  });
  const totals = { taxableSales: 0, tax: 0, nonTaxableSales: 0, discount: 0, payable: 0, paid: 0 };
  for (const p of periods) { totals.nonTaxableSales += p.nonTaxableSales; totals.payable += p.payable; totals.paid += p.paid; for (const r of p.rows) { totals.taxableSales += r.taxableSales; totals.tax += r.tax; totals.discount += r.discount; } }
  return { frequency, periods, warnings: [...new Set(warnings)], totals };
}
