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
const periodOf = (d, freq) => {
  const [y, m] = [d.slice(0, 4), Number(d.slice(5, 7))];
  if (freq === "monthly") return ym(d);
  if (freq === "annual") return y;
  return `${y}-Q${Math.ceil(m / 3)}`;
};
const periodEnd = (p) => {
  if (/^\d{4}$/.test(p)) return [Number(p), 12];
  if (/Q/.test(p)) return [Number(p.slice(0, 4)), Number(p.slice(6)) * 3];
  return [Number(p.slice(0, 4)), Number(p.slice(5))];
};
// Due day of the month after the period, by state, from the states' published
// monthly/quarterly schedules as the author recalls them: check yours
// (a state's own calendar can differ by filing frequency). "last" = month end.
export const STATE_DUE_DAYS = { CA: "last", TX: 20, FL: 20, NY: 20, WA: 25, IL: 20, PA: 20 };
export function dueDate(period, dueDay = 20) {
  let [y, m] = periodEnd(period);
  m += 1; if (m > 12) { m = 1; y += 1; }
  const day = dueDay === "last" ? new Date(Date.UTC(y, m, 0)).getUTCDate() : dueDay;
  return `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

const pad = (n) => String(n).padStart(2, "0");
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
// the filing period that ended just before a payment date
const periodBefore = (d, freq) => {
  let y = Number(d.slice(0, 4)), m = Number(d.slice(5, 7));
  if (freq === "monthly") { m -= 1; if (m < 1) { m = 12; y -= 1; } return `${y}-${pad(m)}`; }
  if (freq === "annual") return String(y - 1);
  let q = Math.ceil(m / 3) - 1; if (q < 1) { q = 4; y -= 1; }
  return `${y}-Q${q}`;
};

export function salesTaxReturn(books, { account = "2100", frequency = "quarterly", dueDay = 20, from = null, to = null, rates = {}, rollover = true, discounts = {}, asOf = null } = {}) {
  if (!["monthly", "quarterly", "annual"].includes(frequency)) throw new Error("frequency must be monthly, quarterly or annual");
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
    const period = periodOf(d.date, frequency);
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
      const k = periodBefore(e.date, frequency);
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
