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
import { LEN, periodOf, periodEnd, periodBefore, dueDate, nextBusinessDay } from "./salestax-rules.mjs";
export { STATE_DUE_DAYS, parseRateSpecs, parseDiscountSpecs, STATE_SOURCES, STATE_SOURCES_READ, stateSourceRead, stateDiscountNote, presetDiscountWarning, stateFilingNote, stateDiscounts, monthlyTaxByLabel, stateHistoryPresets, stateEndMonth, stateDueDay, dueDate, usHolidays, nextBusinessDay, salesTaxDueDates } from "./salestax-rules.mjs";

export function salesTaxReturn(books, { account = "2100", frequency = "quarterly", endMonth = null, dueDay = 20, from = null, to = null, rates = {}, rollover = true, discounts = {}, asOf = null } = {}) {
  if (!["monthly", "quarterly", "semiannual", "annual"].includes(frequency)) throw new Error("frequency must be monthly, quarterly, semiannual or annual");
  if (endMonth != null && !(Number.isInteger(endMonth) && endMonth >= 1 && endMonth <= (frequency === "annual" ? 12 : LEN[frequency] ?? 1))) throw new Error("endMonth must be a month within the first period of the year");
  for (const [j, w] of Object.entries(rates)) {
    if (!Number.isFinite(w) || w < 0 || w > 1) throw new Error(`rate for "${j}" needs a percent between 0 and 100, as in --rate "${j}=7.25"`);
  }
  const okDue = (v) => { const dd = v && typeof v === "object" ? v.day ?? v.after : v; return dd === "last" || (Number.isInteger(dd) && dd >= 1 && dd <= (v?.after != null ? 366 : 31)); };
  if (!(dueDay?.byYear ? okDue(dueDay.otherwise) && Object.values(dueDay.byYear).every(okDue) : okDue(dueDay))) throw new Error('due day must be a whole day from 1 to 31 or "last"');
  for (const [j, d] of Object.entries(discounts)) {
    const okCap = (c) => c == null || (Number.isFinite(c) && c >= 0);
    if (!d || !Number.isFinite(d.rate) || d.rate < 0 || d.rate > 1 || !okCap(d.cap) || !okCap(d.capPerMonth) || !(d.tiers == null || (Array.isArray(d.tiers) && d.tiers.length && d.tiers.every((t) => Number.isFinite(t.rate) && t.rate >= 0 && t.rate <= 1 && (t.upTo == null || okCap(t.upTo))))) || !okCap(d.min) || !(d.steps == null || (Array.isArray(d.steps) && d.steps.length && d.steps.every((t) => Number.isFinite(t.rate) && t.rate >= 0 && t.rate <= 1 && (t.below == null || okCap(t.below))))) || !(d.onSales == null || (Number.isFinite(d.onSales) && d.onSales >= 0 && d.onSales <= 1)) || !(d.bands == null || (Array.isArray(d.bands) && d.bands.length && d.bands.every((t) => Number.isFinite(t.rate) && t.rate >= 0 && t.rate <= 1 && (t.belowMonthlySales == null || okCap(t.belowMonthlySales))))) || !okCap(d.floorPerMonth) || !(d.floorShare == null || (Number.isFinite(d.floorShare) && d.floorShare >= 0 && d.floorShare <= 1)) || !(d.byYear == null || Object.values(d.byYear).every((v) => Number.isFinite(v) && v >= 0 && v <= 1))) throw new Error(`discount for "${j}" needs a rate between 0 and 100 percent and a cap of zero or more, as in --discount "${j}=0.5,100"`);
  }
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
    const months = { monthly: 1, quarterly: 3, semiannual: 6, annual: 12 }[frequency];
    const cap = disc?.capPerMonth != null ? disc.capPerMonth * months : disc?.cap ?? Infinity;
    // byYear: a rate that depends on the year the period ends in (Indiana's allowance band, set by the 12 months to June 30 of the year before)
    const rate = disc ? disc.byYear?.[periodEnd(r.period)[0]] ?? disc.rate : 0;
    let raw = disc ? r.tax * rate : 0;
    if (disc?.tiers && r.tax > 0) { // tiered: each slice of tax earns its own rate, `upTo` is the tier's ceiling in cents of tax
      raw = 0; let lo = 0;
      for (const t of disc.tiers) { const hi = t.upTo ?? Infinity; if (r.tax > lo) raw += (Math.min(r.tax, hi) - lo) * t.rate; lo = hi; }
    }
    // steps: one rate on the whole tax, chosen by the return's tax (`below` in cents; South Carolina 3% under $100, else 2%)
    if (disc?.steps && r.tax > 0) raw = r.tax * (disc.steps.find((t) => t.below == null || r.tax < t.below) ?? disc.steps[disc.steps.length - 1]).rate;
    // min: a floor of the lesser of `min` and the tax itself (Wisconsin: the lesser of $10 or the tax)
    if (disc?.min != null && r.tax > 0) raw = Math.max(raw, Math.min(disc.min, r.tax));
    // onSales and bands: the discount is figured on taxable sales, not on the tax (Virginia ST-1: Line 5 x 0.043 x a rate picked by
    // monthly taxable sales, a quarter's sales divided by 3). `belowMonthlySales` is the band's ceiling in cents of sales a month.
    if (disc?.onSales != null && r.tax > 0) {
      const monthly = Math.max(0, r.taxableSales) / months;
      const band = disc.bands ? (disc.bands.find((t) => t.belowMonthlySales == null || monthly < t.belowMonthlySales) ?? disc.bands[disc.bands.length - 1]) : disc;
      raw = Math.max(0, r.taxableSales) * disc.onSales * band.rate;
    }
    // floorPerMonth: the greater of the percentage and a fixed amount per month of the period, never more than floorShare of the tax
    // (Michigan Form 5080: $6 a month, $18 a quarter, $72 a year, or 2/3 of the tax when that is less)
    if (disc?.floorPerMonth != null && r.tax > 0) raw = Math.max(raw, Math.min(disc.floorPerMonth * months, r.tax * (disc.floorShare ?? 1)));
    r.discount = disc && r.tax > 0 ? Math.min(Math.round(raw), cap) : 0;
    r.payable = r.tax - r.discount;
    const want = rates[r.jurisdiction];
    if (want != null && r.rate != null && Math.abs(r.rate - want) > 0.0005) {
      warnings.push(`${r.jurisdiction} ${r.period}: collected ${(r.rate * 100).toFixed(2)}% of taxable sales, expected ${(want * 100).toFixed(2)}%.`);
    }
    if (r.jurisdiction === "Unlabelled") warnings.push(`${r.period}: tax lines with no description cannot be split by jurisdiction; put the jurisdiction in the line's description column.`);
  }
  const paid = new Map();
  const lastPaid = new Map();
  for (const e of journal(books)) {
    if (e.source === "invoice" || e.source === "credit" || e.source === "bill" || (from && e.date < from) || (to && e.date > to)) continue;
    for (const l of e.lines) if (l.account === account && l.debit) {
      const k = periodBefore(e.date, frequency, endMonth);
      paid.set(k, (paid.get(k) ?? 0) + l.debit);
      if (e.date > (lastPaid.get(k) ?? "")) lastPaid.set(k, e.date);
    }
  }
  const periods = [...new Set([...rows.map((r) => r.period), ...nontax.keys(), ...paid.keys()])].sort().map((period) => {
    const prow = rows.filter((r) => r.period === period);
    const payable = prow.reduce((a, r) => a + r.payable, 0);
    const p = { period, nonTaxableSales: nontax.get(period) ?? 0, rows: prow, payable, paid: paid.get(period) ?? 0 };
    p.owed = p.payable - p.paid;
    // the discount is a reward for paying on time: a payment filed after the due date forfeits it
    for (const r of prow) if (r.discount && lastPaid.has(period) && lastPaid.get(period) > r.due) warnings.push(`${r.jurisdiction} ${period}: the ${(r.discount / 100).toFixed(2)} discount assumes payment by ${r.due}, but a payment was filed on ${lastPaid.get(period)}; the state may disallow it.`);
    const due = prow.map((r) => r.due).sort()[0];
    if (p.owed > 0 && due && asOf && due < asOf) warnings.push(`${period}: $${(p.owed / 100).toFixed(2)} still unpaid after the ${due} due date.`);
    if (p.owed < 0) warnings.push(`${period}: paid over $${(-p.owed / 100).toFixed(2)} more than the return shows; check for a late payment filed to the wrong period.`);
    return p;
  });
  const totals = { taxableSales: 0, tax: 0, nonTaxableSales: 0, discount: 0, payable: 0, paid: 0 };
  for (const p of periods) { totals.nonTaxableSales += p.nonTaxableSales; totals.payable += p.payable; totals.paid += p.paid; for (const r of p.rows) { totals.taxableSales += r.taxableSales; totals.tax += r.tax; totals.discount += r.discount; } }
  return { frequency, periods, warnings: [...new Set(warnings)], totals };
}
