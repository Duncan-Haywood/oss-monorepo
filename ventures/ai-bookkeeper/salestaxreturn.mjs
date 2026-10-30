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
  if (freq === "annual") return endMonth == null || endMonth === 12 ? String(y) : `${m > endMonth ? y + 1 : y}-${pad(endMonth)}`;
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
export const STATE_DUE_DAYS = { CA: "last", TX: 20, FL: 20, NY: 20, WA: 25, IL: 20, PA: 20, NJ: 20, GA: 20, NC: 20, OH: 23, MA: 20, VA: 20, AZ: 20, MI: 20, CT: "last", WI: "last", UT: "last", IN: 30, KS: 25, CO: 20, MN: 20, TN: 20, AL: 20, SC: 20, NM: 25, NV: 20, ID: 20, LA: 20, MD: 20, ME: 15, VT: 25, ND: "last", AR: 20, OK: 20, KY: 20, MS: 20, NE: 20, MO: "last", IA: "last", HI: 20, DC: 20, WV: 20, WY: "last", RI: 20, SD: 20 };
// HI (GET: the 20th; semiannual calendar halves due Jul 20 and Jan 20, tested 2026-10-28 from a 2026 third-party guide, HRS 237-30 not read), DC (the 20th; annual period ends Sep 30, due Oct 20, modelled in stateEndMonth), WV (the 20th) and WY (last day of the month after; Baker Tilly 2025 calendar, TaxCloud 2026 guide) added 2026-10-24 from search excerpts; state sites not read. Rhode Island and South Dakota left out: no schedule found.
// RI (third-party guides via search 2026-10-24: monthly returns the 20th, quarterly dates disagree between sources, not modelled; tax.ri.gov unreachable from the session) and SD (dor.sd.gov sales and use tax page via search excerpt: return due the 20th of the month after the period; electronic payment the 25th, not modelled) added 2026-10-24. Both equal the default of 20.
// AR, OK, KY, MS, NE: the 20th (Kintsugi and TaxJar calendars via search 2026-10-24; state sites not read). All equal the default, listed so the schedule is explicit. Missouri left out: TaxCloud lists month end, TaxJar the 20th.
// MO (dor.mo.gov 2026 monthly due-date table and sales tax FAQ: last day of the month after; the older instructions booklet says the 20th, outdated) and IA (revenue.iowa.gov filing-frequency page: last day of the month after; Streamlined Model 1 sellers the 20th, annual filers Jan 31, not modelled) added 2026-10-24 from search excerpts.
// ME (Rule 304, maine.gov: the 15th of the month after each reporting period), VT (tax.vermont.gov FAQ: the 25th; monthly returns for January are due the 23rd, not modelled) and
// ND (last day of the month after; third-party guides, state site not read) added 2026-10-24 from search excerpts. Iowa still left out: sources conflict (20th prepayments vs month-end returns).
// LA, MD: the 20th (TaxCloud and Kintsugi tables via search 2026-10-24; state sites not read).
// TN (tn.gov/revenue due-dates page: monthly and quarterly the 20th, annual Jan 20), AL (third-party guide: the 20th), SC (dor.sc.gov sales tax Due Dates table, read in full 2026-10-28: monthly, quarterly and annual returns all the 20th after the period, annual Dec 31 -> Jan 20; equals the default; pinned in the test) and NM (aggregator calendars: the 25th; some filers differ) added 2026-10-24 from search excerpts; state sites mostly not read.
// NV, ID: the 20th (Kintsugi/TaxJar tables via search 2026-10-24; Nevada moved from month end to the 20th for periods from January 2026: AB 594, Department of Taxation release 2026-01-23, via search 2026-10-28; a period before that was still due month end). Iowa left out: sources conflict.
// CO (tax.colorado.gov DR 0100 instructions and filing pages, via search 2026-10-24: monthly and quarterly the 20th, annual Jan 20) and MN (revenue.state.mn.us
// "Sales Tax Return Filing Due Dates", via search 2026-10-24: monthly and quarterly the 20th, annual Feb 5, modelled in stateDueDay): the 20th. A 20th on a weekend or holiday moves to the next business day. Check your own notice.
// MI (michigan.gov Treasury: monthly and quarterly the 20th, annual return Feb 28 not modelled), CT (OS-114: last day of the month after, monthly, quarterly
// and annual), WI (revenue.wi.gov FAQ: last day of the month after; "early monthly" filers the 20th, not modelled), UT (tax.utah.gov: last day of the
// month after), IN (DOR filing-deadlines page and bulletin 102: the 30th, early filers the 20th, not modelled; a 30th that does not exist in February
// is clamped to month end) and KS (ST-36 form: the 25th) added 2026-10-24 from search excerpts of those pages, not the full forms.
// VA (tax.virginia.gov ST-9 package, July 2023 and later: "return and payment due on 20th of month following end of period") and AZ
// (TPT: the 20th; azdor.gov and Phoenix guidance; e-filers get until month end, not modelled) added 2026-10-24 from search excerpts.
// Both equal the default of 20, listed so the schedule is explicit and a later change to the default cannot silently move them.
// Added 2026-10-24 from search excerpts (NJ: nj.gov Division of Taxation, 20th after the period, quarterly or monthly;
// GA: dor.georgia.gov File & Pay, the 20th (read 2026-10-24); NC: ncdor.gov, monthly 20th but quarterly last day of the month after (read 2026-10-24, see stateDueDay); OH: 23rd, monthly, quarterly and semiannual Jan-Jun/Jul-Dec; tax.ohio.gov Due Dates and vendor FAQ confirm the 23rd for monthly and semiannual via search 2026-10-28, quarterly not seen there, a weekend or holiday moves to the next banking day per ST 2007-06).
// MA: monthly returns the 20th; quarterly and annual returns 30 days after the period closes (the rule since 2021, from
// memory and search excerpts, not re-read on mass.gov), modelled as `{ after: 30 }` in stateDueDay.
// Checked 2026-10-24 against the states' own pages (via search excerpts): CA quarterly
// = last day of the month after the quarter; TX = 20th, monthly and quarterly; FL = due
// the 1st, late after the 20th; WA monthly = 25th but quarterly = end of the next month.
// Checked 2026-10-24 (search excerpts of tax.ny.gov ST-100 instructions, tax.illinois.gov ST-1
// instructions, revenue.pa.gov REV-819): NY, IL and PA monthly and quarterly returns are due the
// 20th, next business day if that is a weekend or holiday (IL re-read in full on the ST-1 instructions R-01/26, 2026-10-28: the 20th after the period, discount 1.75% capped $1,000 a month, `--discount "<label>=1.75"`). WA annual returns are due April 15 (modelled in stateDueDay, 2026-10-27).
// NY quarters are Mar-May, Jun-Aug, Sep-Nov, Dec-Feb (due the 20th after), not calendar quarters;
// PA semiannual periods are Feb-Jul and Aug-Jan (due Aug 20 and Feb 20). Both are modelled via
// stateEndMonth (NY quarterly ends in Feb, PA semiannual in Jan); other states use calendar periods.
// The 2026-10-24 excerpts were not re-read against the full forms: check your own notice.
// States with no general state sales tax, from the author's memory of each state's
// published position (2026-10-28; state sites not read): the note says so rather than
// letting a return be built for a filing that does not exist. Check yours.
const NO_STATE_SALES_TAX = {
  OR: "Oregon has no statewide sales tax, so there is no sales tax return to file; Oregon's Corporate Activity Tax and local transit or lodging taxes are separate filings.",
  MT: "Montana has no general state sales tax; some resort communities levy a local resort tax filed with the town, not the state.",
  NH: "New Hampshire has no general sales tax; its meals and rooms tax and other taxes are separate returns, which this command does not build.",
  DE: "Delaware has no sales tax; businesses pay a gross receipts tax (monthly, quarterly or annual by size) that is a different return on a different base, which this command does not build.",
  AK: "Alaska has no state sales tax, but many cities and boroughs levy local sales tax with their own return forms and due dates, which this command does not know; use the local schedule.",
};
// "CA state=7.25" -> { "CA state": 0.0725 }; one spec per entry. Bad numbers stay NaN so salesTaxReturn refuses them.
export function parseRateSpecs(specs = []) {
  const rates = {};
  for (const v of specs) { const [k, n] = v.split("="); rates[k.trim()] = Number(n) / 100; }
  return rates;
}

// "CA state=0.5,100" (cap per return) or "IL state=1.75,1000/mo" (cap per month), caps in dollars.
export function parseDiscountSpecs(specs = []) {
  const discounts = {};
  for (const v of specs) {
    const [k, spec = ""] = v.split("=");
    const [pct, cap] = spec.split(",");
    const perMonth = cap != null && /\/mo$/.test(cap.trim());
    const c = cap == null ? undefined : Math.round(Number(cap.trim().replace(/\/mo$/, "")) * 100);
    discounts[k.trim()] = { rate: Number(pct) / 100, ...(perMonth ? { capPerMonth: c } : { cap: c }) };
  }
  return discounts;
}

export function stateFilingNote(state, frequency = "quarterly") {
  const s = String(state ?? "").toUpperCase();
  if (NO_STATE_SALES_TAX[s]) return NO_STATE_SALES_TAX[s];
  if (s === "PA" && frequency === "annual") return "Pennsylvania has no annual return; assigned filers file monthly, quarterly or semiannually (due Aug 20 and Feb 20), use --freq semiannual with --state PA for the Feb-Jul and Aug-Jan periods.";
  // IA (secondary guides via search 2026-10-28; revenue.iowa.gov not reachable): large filers make semi-monthly prepayments, not one return
  if (s === "IA") return "Iowa: this is the due date for a monthly or quarterly return. Large filers prepay semi-monthly instead (the 1st to 15th by the 25th, the 16th to month end by the 10th of the next month; the size threshold varies between guides), which this command does not build. Check your own notice.";
  return null;
}
// Timely-filing discounts pinned in tests (IL ST-1 R-01/26, TX comptroller, FL Rule 12A-1.056), keyed by the
// "<ST> state" label; the CLI applies them under --state unless --discount names that label. Check yours.
export function stateDiscounts(state) {
  const s = String(state ?? "").toUpperCase();
  // GA vendor's compensation (ST-3 instructions via search 2026-10-28; dor.georgia.gov not reachable): 3% of the first $3,000 of tax on a return, 0.5% of the rest, only when return and payment are both timely. A 2026 fiscal note describes a proposal to raise the $3,000 step to $10,000: unconfirmed, not modelled. The tax of one return is the whole base here, local tax included only if booked under the same label.
  // OH vendor discount (R.C. 5739.12, ODT notice ST 2025-02 via search excerpts 2026-10-29; tax.ohio.gov not reachable): 0.75% of tax, capped at $750 per vendor's license per month covered, on returns due on or after 2026-01-01; motor vehicle dealers' vehicle sales are uncapped (not modelled); timely return and payment required.
  const d = { OH: { rate: 0.0075, capPerMonth: 75000 }, IL: { rate: 0.0175, capPerMonth: 100000 }, TX: { rate: 0.005 }, FL: { rate: 0.025, cap: 3000 }, GA: { rate: 0.03, tiers: [{ upTo: 300000, rate: 0.03 }, { rate: 0.005 }] } }[s];
  return d ? { [`${s} state`]: { ...d } } : {};
}
export function stateEndMonth(state, frequency = "quarterly") {
  const s = String(state ?? "").toUpperCase();
  if (s === "NY" && (frequency === "quarterly" || frequency === "annual")) return 2;
  if (s === "PA" && frequency === "semiannual") return 1;
  // DC (OTR FAQ via search 2026-10-28: annual filers' return is due October 20, the 20th after a September 30 year end; site not read)
  if (s === "DC" && frequency === "annual") return 9;
  return null;
}
export function stateDueDay(state, frequency = "quarterly") {
  const s = String(state ?? "").toUpperCase();
  // WA (dor.wa.gov "Filing frequencies & due dates", read 2026-10-27): monthly the 25th, quarterly the end of the next month, annual April 15
  // NY (tax.ny.gov Tax Bulletin ST-... "Filing requirements for sales and use tax returns", read 2026-10-27): annual ST-101 covers Mar 1 to Feb 28/29, due March 20; quarters Mar-May, Jun-Aug, Sep-Nov, Dec-Feb; returns due 20 days after the period (modelled via stateEndMonth)
  if (s === "WA" && frequency === "annual") return { months: 4, day: 15 };
  if (s === "WA" && frequency !== "monthly") return "last";
  // UT (tax.utah.gov/sales/due-dates, read 2026-10-28): the Aug 2026 monthly Sales and Use (STC) return is due 2026-09-30, the last day of the next month; equals the "last" preset (quarterly and annual dates unseen)
  // MO (dor.mo.gov sales tax filing FAQ, read whole 2026-10-28): monthly the last day of the next month, quarterly the last day of Apr/Jul/Oct/Jan, annual January 31; equals the "last" preset
  // MA (mass.gov Sales and Use Tax guide, via search 2026-10-27): monthly, quarterly and annual returns all due the 30th day after the period; the 20th in 830 CMR 62C.16.2 is the older rule
  if (s === "MA") return { after: 30 };
  // VA (tax.virginia.gov "Sales and use tax", read 2026-10-27): monthly the 20th; quarterly Jan-Mar Apr 20, Apr-Jun Jul 20, Jul-Sep Oct 20, Oct-Dec Jan 20; equals the default of 20
  // NC: monthly the 20th, quarterly the last day of Jan/Apr/Jul/Oct (ncdor.gov "Filing Frequency and Due Dates", read 2026-10-24)
  if (s === "NC" && frequency !== "monthly") return "last";
  // RI: monthly the 20th, quarterly the last day of Apr/Jul/Oct/Jan (tax.ri.gov sales tax calendars, 2022 and 2024 PDFs via search excerpts 2026-10-24; weekend dates move to the next business day)
  if (s === "RI" && frequency !== "monthly") return "last";
  // MN: annual filers (under $100 a month) pay and file by February 5; the whole 2026 table read on revenue.state.mn.us 2026-10-27 and pinned in salestaxreturn.test.mjs
  if (s === "MN" && frequency === "annual") return { months: 2, day: 5 };
  // MI: annual filers file by February 28 (michigan.gov Treasury "Filing and Payment Due Dates" and Sales and Use Tax pages, via search 2026-10-26; monthly and quarterly are the 20th)
  if (s === "MI" && frequency === "annual") return { months: 2, day: 28 };
  return STATE_DUE_DAYS[s] ?? 20;
}
export function dueDate(period, dueDay = 20) {
  let [y, m] = periodEnd(period);
  // { after: N } = N calendar days after the period's last day (Massachusetts quarterly and annual)
  if (dueDay && typeof dueDay === "object" && dueDay.after != null) return iso(new Date(Date.UTC(y, m, dueDay.after)));
  // { months: N, day: D } = day D of the Nth month after the period's last month (Minnesota annual: February 5)
  const ahead = dueDay && typeof dueDay === "object" ? dueDay.months : 1;
  m += ahead; while (m > 12) { m -= 12; y += 1; }
  if (dueDay && typeof dueDay === "object") dueDay = dueDay.day;
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
// Every return due in a calendar year for a state and filing frequency:
// [{ period, due }], due moved to the next business day. Uses the same period
// and due-day rules as `salesTaxReturn`, so a calendar and a worksheet agree.
export function salesTaxDueDates(year, { state = null, frequency = "quarterly", endMonth = undefined, dueDay = undefined } = {}) {
  const em = endMonth === undefined ? stateEndMonth(state, frequency) : endMonth;
  const dd = dueDay === undefined ? stateDueDay(state, frequency) : dueDay;
  const periods = new Set();
  for (let y = year - 1; y <= year; y++) for (let m = 1; m <= 12; m++) periods.add(periodOf(`${y}-${pad(m)}-01`, frequency, em));
  return [...periods].map((period) => ({ period, due: nextBusinessDay(dueDate(period, dd)) }))
    .filter((e) => e.due.startsWith(String(year))).sort((a, b) => a.due.localeCompare(b.due));
}
// the filing period that ended before the one a payment falls in
const periodBefore = (d, freq, endMonth) => {
  if (freq === "annual") {
    if (endMonth == null || endMonth === 12) return String(Number(d.slice(0, 4)) - 1);
    const [y, m] = periodEnd(periodOf(d, freq, endMonth));
    return `${y - 1}-${pad(m)}`;
  }
  let [y, m] = periodEnd(periodOf(d, freq, endMonth));
  m -= LEN[freq];
  while (m < 1) { m += 12; y -= 1; }
  return periodOf(`${y}-${pad(m)}-01`, freq, endMonth);
};

export function salesTaxReturn(books, { account = "2100", frequency = "quarterly", endMonth = null, dueDay = 20, from = null, to = null, rates = {}, rollover = true, discounts = {}, asOf = null } = {}) {
  if (!["monthly", "quarterly", "semiannual", "annual"].includes(frequency)) throw new Error("frequency must be monthly, quarterly, semiannual or annual");
  if (endMonth != null && !(Number.isInteger(endMonth) && endMonth >= 1 && endMonth <= (frequency === "annual" ? 12 : LEN[frequency] ?? 1))) throw new Error("endMonth must be a month within the first period of the year");
  for (const [j, w] of Object.entries(rates)) {
    if (!Number.isFinite(w) || w < 0 || w > 1) throw new Error(`rate for "${j}" needs a percent between 0 and 100, as in --rate "${j}=7.25"`);
  }
  const dd = dueDay && typeof dueDay === "object" ? dueDay.day ?? dueDay.after : dueDay;
  if (!(dd === "last" || (Number.isInteger(dd) && dd >= 1 && dd <= (dueDay?.after != null ? 366 : 31)))) throw new Error('due day must be a whole day from 1 to 31 or "last"');
  for (const [j, d] of Object.entries(discounts)) {
    const okCap = (c) => c == null || (Number.isFinite(c) && c >= 0);
    if (!d || !Number.isFinite(d.rate) || d.rate < 0 || d.rate > 1 || !okCap(d.cap) || !okCap(d.capPerMonth) || !(d.tiers == null || (Array.isArray(d.tiers) && d.tiers.length && d.tiers.every((t) => Number.isFinite(t.rate) && t.rate >= 0 && t.rate <= 1 && (t.upTo == null || okCap(t.upTo)))))) throw new Error(`discount for "${j}" needs a rate between 0 and 100 percent and a cap of zero or more, as in --discount "${j}=0.5,100"`);
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
    let raw = disc ? r.tax * disc.rate : 0;
    if (disc?.tiers && r.tax > 0) { // tiered: each slice of tax earns its own rate, `upTo` is the tier's ceiling in cents of tax
      raw = 0; let lo = 0;
      for (const t of disc.tiers) { const hi = t.upTo ?? Infinity; if (r.tax > lo) raw += (Math.min(r.tax, hi) - lo) * t.rate; lo = hi; }
    }
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
